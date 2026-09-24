import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import * as cheerio from 'cheerio';
import { validateUrl, safeFetch } from '@/lib/security/ssrfValidator';

// ─── Kill Switch (fail-closed + production block) ─────────────────────────────
// The endpoint is disabled unless ALL conditions are met:
//   1. SCRAPE_ENABLED === 'true'
//   2. NODE_ENV !== 'production'
// During Phase 0, production is unconditionally blocked regardless of
// SCRAPE_ENABLED. This restriction will be lifted only after implementing
// authentication, rate limiting, and a DNS-safe transport (e.g. Undici
// connector with IP pinning).
function isScrapeAllowed(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.SCRAPE_ENABLED === 'true';
}

// ─── Constants ────────────────────────────────────────────────────────────────
const OEMBED_TIMEOUT_MS = 5_000;
const OEMBED_MAX_BYTES = 256 * 1024; // 256 KB

function getFetchTimeoutMs(): number {
  const parsed = parseInt(process.env.SCRAPE_FETCH_TIMEOUT_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10_000;
}

/**
 * Sanitize a URL for logging: strips query strings and credentials.
 */
function sanitizeUrlForLog(urlString: string): string {
  try {
    const u = new URL(urlString);
    return `${u.protocol}//${u.hostname}${u.pathname}`;
  } catch {
    return '[malformed-url]';
  }
}

export async function POST(request: Request) {
  if (!isScrapeAllowed()) {
    return NextResponse.json(
      { error: 'El servicio de scraping está temporalmente deshabilitado.' },
      { status: 503 }
    );
  }

  try {
    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Debes proporcionar una URL válida' }, { status: 400 });
    }

    // ─── SSRF Validation ────────────────────────────────────────────────
    const urlValidation = validateUrl(url);
    if (!urlValidation.valid) {
      console.warn(`[Scraper] SSRF blocked: ${urlValidation.reason} — host: ${sanitizeUrlForLog(url)}`);
      return NextResponse.json(
        { error: 'La URL proporcionada no es válida o apunta a un destino no permitido.' },
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'La clave GEMINI_API_KEY no está configurada en .env.local' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // ─── NOTE: No HEAD redirect resolution ──────────────────────────────
    // Previously this code did `fetch(url, { redirect: 'follow' })` to
    // resolve shortened URLs. This was removed because redirect: 'follow'
    // allows the runtime to connect to any redirect destination (including
    // private IPs) BEFORE we can validate it.
    //
    // Shortened URLs (vm.tiktok.com, bit.ly, etc.) are now resolved by
    // safeFetch() which validates each redirect hop individually.
    const resolvedUrl = url;

    // ─── 1. Platform-specific APIs (e.g., TikTok oEmbed) ────────────────
    let optimizedPayload = '';
    let fetchFailed = false;
    let extractedImageUrl = '';

    if (resolvedUrl.includes('tiktok.com')) {
      console.log(`[Scraper] Detectada URL de TikTok. Intentando oEmbed API...`);
      try {
        const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(resolvedUrl)}`;
        const oembedValidation = validateUrl(oembedUrl);
        if (oembedValidation.valid) {
          const oembedController = new AbortController();
          const oembedTimer = setTimeout(() => oembedController.abort(), OEMBED_TIMEOUT_MS);
          try {
            const oembedRes = await fetch(oembedUrl, {
              redirect: 'manual',
              signal: oembedController.signal,
              headers: { 'Accept': 'application/json' },
            });

            if (oembedRes.status >= 300 && oembedRes.status < 400) {
              // Cancel body and reject unexpected redirects
              if (oembedRes.body) await oembedRes.body.cancel().catch(() => {});
              console.warn(`[Scraper] oEmbed returned unexpected redirect, skipping`);
            } else if (oembedRes.ok) {
              const reader = oembedRes.body?.getReader();
              if (reader) {
                const chunks: Uint8Array[] = [];
                let totalBytes = 0;
                let oversized = false;
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    totalBytes += value.byteLength;
                    if (totalBytes > OEMBED_MAX_BYTES) {
                      await reader.cancel();
                      oversized = true;
                      break;
                    }
                    chunks.push(value);
                  }
                } finally {
                  reader.releaseLock();
                }

                if (!oversized) {
                  const decoder = new TextDecoder('utf-8', { fatal: false });
                  const merged = chunks.reduce((acc, chunk) => {
                    const m = new Uint8Array(acc.length + chunk.length);
                    m.set(acc);
                    m.set(chunk, acc.length);
                    return m;
                  }, new Uint8Array(0));
                  const oembedData = JSON.parse(decoder.decode(merged));

                  if (oembedData.title) {
                    optimizedPayload = `Título y Descripción del Vídeo de TikTok:\n${oembedData.title}\n\n`;
                    console.log(`[Scraper] TikTok oEmbed extraído con éxito.`);
                    if (oembedData.thumbnail_url) {
                      extractedImageUrl = oembedData.thumbnail_url;
                    }
                  }
                }
              }
            } else {
              // Non-redirect, non-ok: cancel body
              if (oembedRes.body) await oembedRes.body.cancel().catch(() => {});
            }
          } finally {
            clearTimeout(oembedTimer);
          }
        }
      } catch {
        console.log(`[Scraper] TikTok oEmbed falló`);
      }
    }

    // ─── 2. Download HTML via safeFetch ──────────────────────────────────
    if (!optimizedPayload || optimizedPayload.length < 50) {
      try {
        const { body: html } = await safeFetch(resolvedUrl, {
          maxRedirects: 5,
          timeoutMs: getFetchTimeoutMs(),
          maxBytes: 2 * 1024 * 1024,
          allowedContentTypes: ['text/html', 'application/xhtml+xml', 'application/xml', 'text/xml'],
        });

        const $ = cheerio.load(html);

        const sigiState = $('#SIGI_STATE').html() || '';
        const universalData = $('#__UNIVERSAL_DATA_FOR_REHYDRATION__').html() || '';
        const nextData = $('#__NEXT_DATA__').html() || '';
        const metaDescriptions = $(
          'meta[name="description"], meta[property="og:description"], meta[property="og:title"], meta[name="twitter:description"]'
        ).map((_i, el) => $(el).attr('content')).get().join(' | ');

        extractedImageUrl = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content') || '';

        const jsonLd = $('script[type="application/ld+json"]').map((_i, el) => $(el).html()).get().join('\n');

        $('svg, style, img, link, iframe, video, audio, script, noscript, header, footer, nav').remove();
        const cleanText = $('body').text().replace(/\\s+/g, ' ').trim();

        if (cleanText.length < 100 && !jsonLd && !sigiState && !universalData) {
          fetchFailed = true;
        } else {
          optimizedPayload = `
Metadatos: ${metaDescriptions}

JSON-LD (datos estructurados):
${jsonLd.substring(0, 20000)}

Texto visible:
${cleanText.substring(0, 15000)}

Datos de red social:
${sigiState.substring(0, 20000)}
${universalData.substring(0, 20000)}
${nextData.substring(0, 10000)}
`;
        }
      } catch (fetchError: unknown) {
        const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
        if (errorMsg.startsWith('SSRF blocked')) {
          console.warn(`[Scraper] ${errorMsg}`);
          return NextResponse.json(
            { error: 'La URL proporcionada no es válida o apunta a un destino no permitido.' },
            { status: 400 }
          );
        }
        console.log(`[Scraper] Fetch error (details omitted for security)`);
        fetchFailed = true;
      }
    }

    // ─── 3. Build Gemini prompt ─────────────────────────────────────────
    let prompt: string;

    if (fetchFailed || !optimizedPayload) {
      prompt = `
Eres un chef profesional. El usuario quiere guardar la receta de este enlace: ${resolvedUrl}

No he podido descargar el contenido de la página porque es una red social (TikTok, Instagram, etc.) que bloquea el acceso.

INSTRUCCIONES:
- USA la herramienta de búsqueda de Google para buscar esta URL o el vídeo y encontrar la receta completa.
- Busca el título del vídeo, los ingredientes y los pasos de preparación.
- Si NO puedes determinar la receta, devuelve TODOS los campos vacíos. NUNCA inventes una receta aleatoria.

Devuelve ÚNICAMENTE un JSON válido (sin markdown, sin backticks):
{
  "title": "Título de la receta",
  "time": "Tiempo estimado (ej: '30 min')",
  "ingredients": [
    { "quantity": "cantidad", "name": "nombre del ingrediente" }
  ],
  "steps": [
    "Paso 1...",
    "Paso 2..."
  ],
  "chefTips": "Consejo profesional...",
  "imageUrl": "URL de la imagen (opcional)"
}
`;
    } else {
      prompt = `
Eres un chef profesional y experto analista. Tu tarea es extraer la receta completa de la siguiente página web.
En sitios como TikTok o Instagram, la receta suele estar escrita como un bloque de texto caótico en la descripción del vídeo o en metadatos.

INSTRUCCIONES CRÍTICAS ANTI-ALUCINACIÓN:
Si el texto proporcionado es solo una página de inicio de sesión (Login), una página de error, o NO contiene absolutamente ninguna referencia a una receta, comida o ingredientes reales, DEBES devolver un JSON con todos los campos vacíos. NUNCA inventes una receta.

INSTRUCCIONES SI HAY RECETA:
1. INGREDIENTES: Separa SIEMPRE la cantidad del nombre. Si no se menciona cantidad exacta, pon "Al gusto" o deduce una cantidad lógica. Nunca dejes la cantidad vacía.
2. PASOS: Si la receta está en un solo párrafo, DEBES separarlo en varios pasos claros. NUNCA devuelvas un array de pasos vacío si has encontrado ingredientes.
3. CONSEJOS (chefTips): Extrae cualquier truco mencionado. Si el autor no da ninguno, inventa un consejo profesional para esta receta.

Devuelve ÚNICAMENTE un JSON válido (sin markdown, sin backticks):
{
  "title": "Título de la receta",
  "time": "Tiempo estimado (ej: '30 min')",
  "ingredients": [
    { "quantity": "cantidad", "name": "nombre del ingrediente" }
  ],
  "steps": [
    "Paso 1...",
    "Paso 2..."
  ],
  "chefTips": "Consejo profesional...",
  "imageUrl": "URL de la imagen (opcional)"
}

Contenido a analizar:
---
${optimizedPayload}
---
`;
    }

    console.log(`[Scraper] Enviando prompt a Gemini (modo: ${fetchFailed ? 'URL directa + googleSearch' : 'HTML'})...`);

    let chatResponse;

    if (fetchFailed || !optimizedPayload) {
      chatResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        }
      });
    } else {
      chatResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });
    }

    const text = chatResponse.text;
    if (!text) {
      throw new Error('Gemini no devolvió ninguna respuesta');
    }

    console.log(`[Scraper] Respuesta de Gemini recibida (${text.length} chars)`);

    let cleanJson = text.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.slice(7);
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.slice(3);
    }
    if (cleanJson.endsWith('```')) {
      cleanJson = cleanJson.slice(0, -3);
    }
    cleanJson = cleanJson.trim();

    const parsedData = JSON.parse(cleanJson);
    
    if (!parsedData.imageUrl && extractedImageUrl) {
      parsedData.imageUrl = extractedImageUrl;
    }
    
    return NextResponse.json(parsedData);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    console.error("[Scraper] Error (details omitted for security)");

    if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
      return NextResponse.json({
        error: 'Has superado el límite de lecturas por minuto gratuito de Gemini. Espera 1 minuto e inténtalo de nuevo.'
      }, { status: 429 });
    }

    return NextResponse.json({ error: 'Error al analizar la receta' }, { status: 500 });
  }
}

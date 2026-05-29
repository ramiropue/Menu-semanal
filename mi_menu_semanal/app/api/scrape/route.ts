import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import * as cheerio from 'cheerio';

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'Debes proporcionar una URL válida' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'La clave GEMINI_API_KEY no está configurada en .env.local' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Resolver URL acortada (vm.tiktok.com, bit.ly, etc.)
    let resolvedUrl = url;
    try {
      const headRes = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      resolvedUrl = headRes.url || url;
      console.log(`[Scraper] URL resuelta: ${resolvedUrl}`);
    } catch {
      console.log(`[Scraper] No se pudo resolver la URL, usando la original`);
    }

    // 1. Obtener datos con APIs específicas (ej: TikTok oEmbed)
    let optimizedPayload = '';
    let fetchFailed = false;

    if (resolvedUrl.includes('tiktok.com')) {
      console.log(`[Scraper] Detectada URL de TikTok. Intentando oEmbed API...`);
      try {
        const oembedRes = await fetch(`https://www.tiktok.com/oembed?url=${resolvedUrl}`);
        if (oembedRes.ok) {
          const oembedData = await oembedRes.json();
          if (oembedData.title) {
            optimizedPayload = `Título y Descripción del Vídeo de TikTok:\n${oembedData.title}\n\n`;
            console.log(`[Scraper] TikTok oEmbed extraído con éxito.`);
          }
        }
      } catch (e) {
        console.log(`[Scraper] TikTok oEmbed falló:`, e);
      }
    }

    // 2. Intentar descargar el HTML de la URL si no tenemos datos suficientes
    if (!optimizedPayload || optimizedPayload.length < 50) {
      try {
        const response = await fetch(resolvedUrl, { // Cambiado a usar resolvedUrl
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
          },
          redirect: 'follow',
        });

        if (response.ok) {
          const html = await response.text();
          const $ = cheerio.load(html);

          const sigiState = $('#SIGI_STATE').html() || '';
          const universalData = $('#__UNIVERSAL_DATA_FOR_REHYDRATION__').html() || '';
          const nextData = $('#__NEXT_DATA__').html() || '';
          const metaDescriptions = $(
            'meta[name="description"], meta[property="og:description"], meta[property="og:title"], meta[name="twitter:description"]'
          ).map((_i, el) => $(el).attr('content')).get().join(' | ');

          const jsonLd = $('script[type="application/ld+json"]').map((_i, el) => $(el).html()).get().join('\n');

          $('svg, style, img, link, iframe, video, audio, script, noscript, header, footer, nav').remove();
          const cleanText = $('body').text().replace(/\\s+/g, ' ').trim();

          if (cleanText.length < 100 && !jsonLd && !sigiState && !universalData) {
            console.log(`[Scraper] HTML demasiado corto, se marcará como fallido para usar Google Search.`);
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
        } else {
          console.log(`[Scraper] Fetch falló con status ${response.status}`);
          fetchFailed = true;
        }
      } catch (fetchError) {
        console.log(`[Scraper] Fetch error: ${fetchError}`);
        fetchFailed = true;
      }
    }



    // 2. Construir prompt según si tenemos HTML o no
    let prompt: string;

    if (fetchFailed || !optimizedPayload) {
      // Modo "URL directa": pedimos a Gemini que use su conocimiento
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
  "chefTips": "Consejo profesional..."
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
  "chefTips": "Consejo profesional..."
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
      // Modo con Google Search: Gemini busca la receta en internet
      chatResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        }
      });
    } else {
      // Modo HTML: tenemos contenido, no necesita buscar
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
    console.log(`[Scraper] Respuesta: ${text.substring(0, 500)}`);

    // Limpiar respuesta: quitar backticks de markdown si los hay
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
    return NextResponse.json(parsedData);

  } catch (error: any) {
    console.error("Scraping error:", error);

    const errorMessage = error.message || '';
    if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
      return NextResponse.json({
        error: 'Has superado el límite de lecturas por minuto gratuito de Gemini. Espera 1 minuto e inténtalo de nuevo.'
      }, { status: 429 });
    }

    return NextResponse.json({ error: errorMessage || 'Error desconocido al analizar la receta' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import * as cheerio from 'cheerio';

// Initialize the Google Gen AI SDK
// Se instancia dentro de POST para que lea correctamente .env.local sin necesidad de reiniciar el servidor tras cambios
// const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

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

    // 1. Descargar el HTML de la URL
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
      }
    });

    if (!response.ok) {
      throw new Error(`No se pudo acceder a la URL: ${response.status}`);
    }

    const html = await response.text();
    
    // 2. Limpiar el HTML con Cheerio para reducir drásticamente el uso de Tokens y evitar errores 429
    const $ = cheerio.load(html);
    
    // Rescatar JSON scripts importantes de TikTok o Instagram
    const sigiState = $('#SIGI_STATE').html() || '';
    const universalData = $('#__UNIVERSAL_DATA_FOR_REHYDRATION__').html() || '';
    const metaDescriptions = $('meta[name="description"], meta[property="og:description"]').map((i, el) => $(el).attr('content')).get().join(' | ');
    
    // Eliminar etiquetas pesadas que no aportan texto útil
    $('svg, style, img, link, iframe, video, audio, script, noscript').remove();
    const cleanText = $('body').text().replace(/\\s+/g, ' ').trim();

    // Crear un payload muy comprimido
    const optimizedPayload = `
Metadatos: ${metaDescriptions}

Texto visible:
${cleanText.substring(0, 15000)}

Datos de red social:
${sigiState.substring(0, 30000)}
${universalData.substring(0, 30000)}
`;

    // 2. Extraer datos con Gemini
    const prompt = `
Eres un chef profesional y experto analista. Tu tarea es extraer la receta completa de la siguiente página web (HTML parcial). 
En sitios como TikTok o Instagram, la receta suele estar escrita como un bloque de texto caótico en la descripción del vídeo o en metadatos.

INSTRUCCIONES CRÍTICAS ANTI-ALUCINACIÓN:
Si el texto HTML proporcionado es solo una página de inicio de sesión (Login), una página de error, o NO contiene absolutamente ninguna referencia a una receta, comida o ingredientes reales, DEBES devolver un JSON con todos los campos vacíos (arrays vacíos, título vacío). NUNCA inventes una receta aleatoria (como tostadas de aguacate) si no está en el texto.

INSTRUCCIONES OBLIGATORIAS SI HAY RECETA:
1. INGREDIENTES: Separa SIEMPRE la cantidad del nombre. Si el texto no menciona la cantidad exacta (ej: "echas un poco de sal"), pon "Al gusto", "Una pizca" o deduce una cantidad lógica. Nunca dejes la cantidad vacía.
2. PASOS: Si la receta está explicada en un solo párrafo (ej: "mezclar y freír"), DEBES separarlo y redactarlo en varios pasos claros y lógicos. NUNCA devuelvas un array de pasos vacío si has encontrado ingredientes.
3. CONSEJOS (chefTips): Extrae cualquier truco mencionado (ej: "horno precalentado", "usa aceite de oliva"). Si el autor original no da ningún consejo, inventa TÚ un consejo profesional que mejore esta receta específica.

Devuelve el resultado en formato JSON ESTRICTO, sin markdown:
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
  "chefTips": "Consejo profesional o extraído del autor..."
}

Contenido a analizar:
---
${optimizedPayload}
---
`;

    const chatResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const text = chatResponse.text;
    if (!text) {
      throw new Error('Gemini no devolvió ninguna respuesta');
    }

    const parsedData = JSON.parse(text);
    return NextResponse.json(parsedData);

  } catch (error: any) {
    console.error("Scraping error:", error);
    
    // Controlar el error de límite de cuota (429) explícitamente
    const errorMessage = error.message || '';
    if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
      return NextResponse.json({ 
        error: 'Has superado el límite de lecturas por minuto gratuito de Gemini. Espera 1 minuto e inténtalo de nuevo.' 
      }, { status: 429 });
    }

    return NextResponse.json({ error: errorMessage || 'Error desconocido al analizar la receta' }, { status: 500 });
  }
}

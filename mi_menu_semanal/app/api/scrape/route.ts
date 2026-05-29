import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Initialize the Google Gen AI SDK
// The SDK will automatically pick up the GEMINI_API_KEY environment variable if instantiated without arguments,
// but we pass it explicitly just in case.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'Debes proporcionar una URL válida' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'La clave GEMINI_API_KEY no está configurada en .env.local' }, { status: 500 });
    }

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
    
    // Limitamos a los primeros 2,000,000 caracteres para asegurar que entra todo el HTML 
    // pero sin sobrepasar los límites de Gemini 1.5 Flash (1M tokens).
    // Muchas webs pesadas como TikTok o Instagram tienen los datos al final de la página.
    const truncatedHtml = html.substring(0, 2000000);

    // 2. Extraer datos con Gemini
    const prompt = `
Eres un chef profesional y experto analista. Tu tarea es extraer la receta completa de la siguiente página web (HTML parcial). 
En sitios como TikTok o Instagram, la receta suele estar escrita como un bloque de texto caótico en la descripción del vídeo.

INSTRUCCIONES OBLIGATORIAS:
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

Contenido HTML a analizar:
---
${truncatedHtml}
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
    return NextResponse.json({ error: error.message || 'Error desconocido al analizar la receta' }, { status: 500 });
  }
}

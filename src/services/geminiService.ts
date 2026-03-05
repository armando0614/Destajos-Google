import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function generateWeeklySummary(capturas: any[], semana: string) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY no está configurada");
  }

  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Analiza los siguientes datos de capturas de destajos para la Semana ${semana} y genera un resumen ejecutivo breve (máximo 150 palabras).
    Incluye:
    1. Total de actividades realizadas.
    2. Destajista con mayor productividad.
    3. Actividad más frecuente.
    4. Una recomendación u observación rápida.

    Datos:
    ${JSON.stringify(capturas.map(c => ({
      destajista: c.destajista_nombre,
      actividad: c.actividad_nombre,
      cantidad: c.cantidad,
      importe: c.cantidad * c.precio
    })))}
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: [{ parts: [{ text: prompt }] }],
    });

    return response.text;
  } catch (error) {
    console.error("Error generating AI summary:", error);
    throw error;
  }
}

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { GoogleGenerativeAI } from '@google/generative-ai';

PORT=5174
GEMINI_API_KEY=TU_API_KEY_DE_GEMINI
GOOGLE_CSE_KEY=TU_API_KEY_DE_GOOGLE_SEARCH
GOOGLE_CX=TU_CX_DE_PROGRAMMABLE_SEARCH_ENGINE


const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 5174;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_KEY;
const GOOGLE_CX = process.env.GOOGLE_CX;

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const model = genAI ? genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }) : null;

/**
 * Intento básico de resolver código de barras a nombre de producto:
 * 1) OpenFoodFacts (gratis, pero principalmente alimentos)
 * 2) Si no hay nombre, usamos el propio código como query
 */
async function resolveBarcodeToName(barcode) {
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('OFF error');
    const data = await resp.json();
    const name =
      data?.product?.product_name ||
      data?.product?.generic_name ||
      data?.product?.brands_tags?.[0];
    if (name && name.trim()) return name.trim();
  } catch {
    // ignora
  }
  return null; // no se pudo
}

/**
 * Búsqueda web con Google Custom Search JSON API
 */
async function webSearch(query) {
  const params = new URLSearchParams({
    key: GOOGLE_CSE_KEY,
    cx: GOOGLE_CX,
    q: query,
    num: '10'
  });
  const url = `https://www.googleapis.com/customsearch/v1?${params.toString()}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google CSE error: ${resp.status} ${text}`);
  }
  const json = await resp.json();
  const items = (json.items || []).map(i => ({
    title: i.title,
    snippet: i.snippet,
    link: i.link,
    displayLink: i.displayLink
  }));
  return items;
}

/**
 * Pide a Gemini resumir/estructurar resultados (si hay API key).
 * Extrae nombre de tienda, señal de precio (si aparece) y recomendación.
 */
async function rankWithGemini(query, items) {
  if (!model) return null;
  const prompt = `
Eres un asistente que toma resultados de búsqueda web y genera hasta 6 ofertas para comprar un producto.
Devuelve JSON estricto con este esquema:
[
  { "merchant": string, "title": string, "url": string, "why": string, "maybePrice": string | null }
]

- 'merchant': usa displayLink o dedúcelo del link/título.
- 'maybePrice': si ves precio en snippet/título (por ejemplo "$", "MXN", "USD", "€"), extráelo tal cual; si no, null.
- 'why': breve razón (disponibilidad, envío, reputación, oficial, etc.)
- No inventes precios.

Query: "${query}"
Resultados:
${JSON.stringify(items, null, 2)}
  `.trim();

  const res = await model.generateContent(prompt);
  const text = res.response?.text?.();
  if (!text) return null;

  // Intenta parsear cualquier bloque de JSON en la respuesta
  const match = text.match(/\[\s*{[\s\S]*}\s*]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed.slice(0, 6) : null;
  } catch {
    return null;
  }
}

/**
 * Endpoint principal
 * body: { barcode?: string, query?: string }
 */
app.post('/api/find-product', async (req, res) => {
  const { barcode, query } = req.body || {};
  try {
    let q = (query || '').trim();
    if (!q && barcode) {
      const name = await resolveBarcodeToName(String(barcode));
      q = name ? `${name} comprar precio` : `${barcode} comprar`;
    }
    if (!q) return res.status(400).json({ error: 'Falta query o barcode' });

    const items = await webSearch(q);
    const ranked = await rankWithGemini(q, items);

    res.json({
      query: q,
      offers: ranked || items.map(i => ({
        merchant: i.displayLink || new URL(i.link).hostname,
        title: i.title,
        url: i.link,
        maybePrice: null,
        why: i.snippet
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});



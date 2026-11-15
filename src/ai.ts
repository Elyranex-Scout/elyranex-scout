// Direct calls from the client (browser/phone) to the Groq API (OpenAI-compatible) with the user's own key.
import { storage } from "@/src/utils/storage";

const BASE = "https://groq.com";
const MODEL_KEY = "groq_model";
const PRIMARY = "qwen/qwen3.8-27b";
const SECONDARY = "meta-models/muse-spark-open";
const TIMEOUT_MS = 20000;
const LIST_TIMEOUT_MS = 8000;

export const CATEGORIES = ["Coleccionismo", "Electrónica", "Ropa", "Hogar", "Juguetes", "Otros"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Demand = "Alta" | "Media" | "Baja";

export type Analysis = {
  nombre: string;
  marca: string;
  modelo_edicion: string;
  estado: string;
  categoria: Category;
  precio_nuevo: number;
  ver: number;
  demanda: Demand;
  explicacion: string;
};

const INSTRUCTIONS = `Eres un tasador experto y PRUDENTE para revendedores de mercadillos y tiendas de segunda mano en España. Tu prioridad es no hacer perder dinero al comprador: ante la duda, tasa a la baja.

PASO 1 · LECTURA OBLIGATORIA DE TEXTO Y LOGOTIPOS:
- Antes de nada, lee el texto, logotipo o marca exacta impresa en el objeto (esfera del reloj, etiqueta, hebilla, suela, carcasa, caja, cartucho, carta...). La marca es la que está ESCRITA, no la que sugiere el diseño.
- En relojes lee la esfera: si pone "Poedagar", "Pagani Design", "Curren", "Naviforce", "Benyar", "Casio", etc., ese es el reloj. NUNCA lo tases como "Rolex", "Panerai", "Omega", "Patek" u otra marca de lujo solo porque se le parezca.
- Si no se lee ninguna marca, indica "Sin marca visible" y tásalo como genérico.

PASO 2 · PRUDENCIA EN LUJO:
- Si un reloj, bolso, gafas, joya o prenda PARECE de lujo pero es un homenaje/réplica, o no hay caja, certificado ni pruebas claras de autenticidad, tásalo como homenaje/sin autenticar: "ver" entre 10 y 20 €, demanda "Baja" y dilo en la explicación ("posible homenaje/réplica, sin autenticar").
- Solo da valor de lujo si la marca de lujo se lee claramente Y los detalles (grabados, acabados, número de serie, caja/papeles) son coherentes con un original.

PASO 3 · PROTOCOLO ESTRICTO PARA MONEDAS (NUMISMÁTICA):
- Si es una moneda, extrae obligatoriamente: país, valor facial, año exacto acuñado, marca de ceca (letras o estrellas), metal aparente (cobre, níquel, latón, plata, oro) y grado de conservación visual (circulada/gastada o sin circular/brillo original). Pon país, valor facial y año en "nombre"; ceca, metal y conservación en "modelo_edicion"; conservación también en "estado".
- Sé ULTRACONSERVADOR: la inmensa mayoría de monedas comunes circuladas (pesetas habituales, euros normales, monedas extranjeras modernas) valen entre 0,50 € y 3 € → "ver" entre 0.5 y 3 y demanda "Baja".
- Solo da un "ver" alto y demanda "Alta" o "Media" si identificas claramente: plata u oro, una fecha clave escasa, un error de acuñación evidente o una conmemorativa con valor real en el mercado numismático. En ese caso explica POR QUÉ es valiosa (metal, año, tirada o error).

PASO 4 · TASACIÓN GENERAL:
- Si es un cromo de Pokémon, carta coleccionable o videojuego, lee número de serie/edición y evalúa el estado visual.
- Clasifícalo en: Coleccionismo, Electrónica, Ropa, Hogar, Juguetes u Otros (monedas → Coleccionismo).
- Estima su "Precio Nuevo" (€), su "Valor Estimado de Reventa (VER)" real en Wallapop, Vinted, eBay o Todocoleccion (€) según su estado, y su demanda ("Alta", "Media" o "Baja"). Si no puedes identificarlo con seguridad, tasa a la baja y dilo.

FORMATO: responde SOLO con un objeto JSON estricto con exactamente estas claves:
{"nombre": string, "marca": string (la marca LEÍDA, o "Sin marca visible"), "modelo_edicion": string, "estado": "Nuevo"|"Muy bueno"|"Bueno"|"Usado"|"Dañado"|"Sin circular"|"Circulada", "categoria": "Coleccionismo"|"Electrónica"|"Ropa"|"Hogar"|"Juguetes"|"Otros", "precio_nuevo": número en euros, "ver": número en euros, "demanda": "Alta"|"Media"|"Baja", "explicacion": 2 o 3 frases cortas y completas en español (máx. 300 caracteres) diciendo qué marca/inscripción has leído y por qué vale lo que vale}`;

async function timedFetch(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return { status: res.status, raw: await res.text() };
  } catch {
    throw new Error(ctrl.signal.aborted ? `sin respuesta en ${ms / 1000} s (timeout)` : "sin conexión con Groq");
  } finally {
    clearTimeout(timer);
  }
}

const parseJson = (raw: string): any => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const errorText = (status: number, raw: string) => {
  const data = parseJson(raw);
  return `${data?.error?.message ?? (raw.slice(0, 160) || "error desconocido")} (HTTP ${status})`;
};

// GET /models → pick the preferred vision model the key can use.
async function detectModel(apiKey: string): Promise<string> {
  const { status, raw } = await timedFetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${apiKey}` } }, LIST_TIMEOUT_MS);
  if (status < 200 || status >= 300) throw new Error(errorText(status, raw));
  const ids: string[] = ((parseJson(raw)?.data ?? []) as { id: string; active?: boolean }[])
    .filter((m) => m.active !== false)
    .map((m) => m.id);
  if (ids.includes(PRIMARY)) return PRIMARY;
  if (ids.includes(SECONDARY)) return SECONDARY;
  const vision = ids.find((id) => /(qwen|muse|scout|vision)/i.test(id));
  if (!vision) throw new Error("Tu clave no tiene modelos de visión de Groq disponibles.");
  return vision;
}

async function candidates(): Promise<string[]> {
  const saved = await storage.getItem(MODEL_KEY, "");
  const s: string = typeof saved === "string" ? saved : "";
  // A previously working official model goes first; older saved models only as last resort.
  const head = s === SECONDARY ? [SECONDARY, PRIMARY] : [PRIMARY, SECONDARY];
  return [...new Set([...head, s].filter(Boolean))];
}

async function chat(model: string, apiKey: string, content: unknown, json: boolean): Promise<string> {
  const { status, raw } = await timedFetch(
    `${BASE}/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content }],
        temperature: 0.2,
        max_completion_tokens: json ? 1000 : 5,
        ...(json ? { temperature: 0.1 } : {}),
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    },
    TIMEOUT_MS,
  );
  if (status < 200 || status >= 300) throw new Error(errorText(status, raw));
  const text: string | undefined = parseJson(raw)?.choices?.[0]?.message?.content;
  if (!text) throw new Error("respuesta vacía de Groq");
  return text;
}

// Saved model first, then the other vision models. Both fail → exact errors.
async function call(apiKey: string, content: unknown, json: boolean, models?: string[]) {
  const errors: string[] = [];
  for (const model of models ?? (await candidates())) {
    try {
      const text = await chat(model, apiKey, content, json);
      await storage.setItem(MODEL_KEY, model);
      return { text, model };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${model}: ${msg}`);
      if (/HTTP 401/.test(msg)) break; // invalid key: no point trying other models
    }
  }
  throw new Error(`No se pudo conectar con Groq.\n${errors.join("\n")}`);
}

function parse(text: string): Analysis {
  const a = JSON.parse(text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")) as Analysis;
  return {
    nombre: String(a.nombre ?? "Artículo"),
    marca: String(a.marca ?? ""),
    modelo_edicion: String(a.modelo_edicion ?? ""),
    estado: String(a.estado ?? ""),
    explicacion: String(a.explicacion ?? ""),
    precio_nuevo: Math.max(0, Number(a.precio_nuevo) || 0),
    ver: Math.max(0, Number(a.ver) || 0),
    categoria: CATEGORIES.includes(a.categoria) ? a.categoria : "Otros",
    demanda: (["Alta", "Media", "Baja"] as const).includes(a.demanda) ? a.demanda : "Baja",
  };
}

export async function analyzePhoto(apiKey: string, imageBase64: string, mimeType = "image/jpeg") {
  const prefix = imageBase64.match(/^data:(image\/[\w.+-]+);base64,/);
  const mime = prefix ? (prefix[1] === "image/jpg" ? "image/jpeg" : prefix[1]) : mimeType;
  const data = imageBase64.replace(/^data:image\/[\w.+-]+;base64,/, "").replace(/\s/g, "");
  const { text } = await call(
    apiKey,
    [
      { type: "text", text: INSTRUCTIONS },
      { type: "image_url", image_url: { url: `data:${mime};base64,${data}` } },
    ],
    true,
  );
  return parse(text);
}

export async function analyzeBarcode(apiKey: string, code: string, type: string) {
  const { text } = await call(
    apiKey,
    `${INSTRUCTIONS}\n\nNo hay foto: identifica el producto a partir de este código de barras (${type}): ${code}. Asume estado "Usado - Bueno".`,
    true,
  );
  return parse(text);
}

export async function analyzeText(apiKey: string, description: string) {
  const { text } = await call(
    apiKey,
    `${INSTRUCTIONS}\n\nNo hay foto: identifica y tasa el artículo a partir de esta descripción escrita por el comprador: "${description.trim()}". Si no especifica estado, asume "Usado".`,
    true,
  );
  return parse(text);
}

// Detects the vision model (GET /models), sends a test message and saves the working model.
export async function testConnection(apiKey: string): Promise<string> {
  let first = PRIMARY;
  try {
    first = await detectModel(apiKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/HTTP 401/.test(msg)) throw new Error(`API Key de Groq no válida: ${msg}`);
  }
  const { model } = await call(apiKey, "Responde solo: OK", false, [...new Set([first, PRIMARY, SECONDARY])]);
  return model;
}

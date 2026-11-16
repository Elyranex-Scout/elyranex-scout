// Direct calls from the client (browser/phone) to the Groq API (OpenAI-compatible) with the user's own key.
import { storage } from "@/src/utils/storage";

const BASE = "/api/groq";
const MODEL_KEY = "groq_model_v2";
const PRIMARY = "qwen/qwen3.8-27b";
const SECONDARY = "meta-models/muse-spark-open";
const TIMEOUT_MS = 25000;
const LIST_TIMEOUT_MS = 10000;

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

export type CoinAnalysis = {
  tipo_pieza: "moneda";
  pais: string;
  denominacion: string;
  anio: string;
  ceca: string;
  metal: string;
  tirada_estimada: string;
  rareza: "Muy común" | "Común" | "Escasa" | "Rara" | "Muy rara";
  tipo_canto: string;
  especificaciones: {
    peso_g: string;
    diametro_mm: string;
    grosor_mm: string;
  };
  grado_estimado: "SC" | "EBC" | "MBC" | "BC";
  precios_por_grado: {
    SC: [number, number];
    EBC: [number, number];
    MBC: [number, number];
    BC: [number, number];
  };
  explicacion: string;
};

export type StampAnalysis = {
  tipo_pieza: "sello";
  pais: string;
  serie_tematica: string;
  anio: string;
  valor_facial: string;
  color_impresion: string;
  numero_catalogo: string;
  rareza: "Muy común" | "Común" | "Escaso" | "Raro" | "Muy raro";
  evaluacion_dentado: string;
  estado_estimado: "MNH (**)" | "MH (*)" | "Sin goma" | "Usado (O)";
  precios_por_estado: {
    "MNH (**)": [number, number];
    "MH (*)": [number, number];
    "Sin goma": [number, number];
    "Usado (O)": [number, number];
  };
  explicacion: string;
};

export type CardAnalysis = {
  tipo_pieza: "carta";
  juego_o_coleccion: string;
  nombre_carta: string;
  expansion_set: string;
  numero_carta: string;
  idioma: string;
  rareza: string;
  autenticidad: "Original aparente" | "Posible réplica / Proxy" | "No determinable";
  estado_estimado: "Near Mint (NM)" | "Excellent (EX)" | "Good (GD)" | "Played (PL)";
  precios_por_estado: {
    "Near Mint (NM)": [number, number];
    "Excellent (EX)": [number, number];
    "Good (GD)": [number, number];
    "Played (PL)": [number, number];
  };
  explicacion: string;
};

const INSTRUCTIONS = [
  "Eres un tasador experto y PRUDENTE para revendedores de mercadillos, Vinted y Wallapop en España. Tu prioridad es no hacer perder dinero al comprador: ante la duda, tasa a la baja.",
  "PASO 1 · LECTURA OBLIGATORIA DE TEXTO Y LOGOTIPOS: Lee el texto, logotipo o marca exacta impresa en el objeto. La marca es la que está ESCRITA, no la que sugiere el diseño. En relojes lee la esfera: si pone Poedagar, Pagani Design, Curren, Naviforce, Benyar, Casio, ese es el reloj; NUNCA lo tases como Rolex, Omega o similar solo por parecerse. Si no se lee ninguna marca, indica Sin marca visible.",
  "PASO 2 · PRUDENCIA EN LUJO: Si un reloj, bolso, gafas, joya o prenda PARECE de lujo pero es un homenaje/réplica o no hay pruebas claras de autenticidad, tásalo entre 10 y 20 euros con demanda Baja.",
  "PASO 3 · TASACIÓN GENERAL: Clasifícalo en Coleccionismo, Electrónica, Ropa, Hogar, Juguetes u Otros. Estima su Precio Nuevo (€), su Valor Estimado de Reventa (VER) real en Wallapop, Vinted o eBay (€) según su estado, y su demanda (Alta, Media o Baja).",
  'FORMATO: responde SOLO con un objeto JSON estricto con estas claves: {"nombre": string, "marca": string, "modelo_edicion": string, "estado": "Nuevo"|"Muy bueno"|"Bueno"|"Usado"|"Dañado", "categoria": "Coleccionismo"|"Electrónica"|"Ropa"|"Hogar"|"Juguetes"|"Otros", "precio_nuevo": número, "ver": número, "demanda": "Alta"|"Media"|"Baja", "explicacion": "2 o 3 frases cortas en español (máx. 300 caracteres)"}',
].join("\n");

const COIN_INSTRUCTIONS = [
  "Eres un experto numismático internacional y tasador prudente. Analizas TRES fotografías de la misma moneda: 1) Anverso (cara), 2) Reverso (cruz) y 3) Canto (borde/perfil).",
  "INSTRUCCIONES:",
  "- Identifica país, denominación (valor facial), año exacto acuñado, marca de ceca (letras, estrellas o símbolos) y metal/aleación.",
  "- Examina atentamente la TERCERA imagen para describir el tipo de canto exacto (Estriado, Liso, Estriado discontinuo, Con leyenda incusa, Seguridad, etc.) y si tiene golpes en el borde.",
  "- Estima la tirada aproximada y clasifica su rareza en: Muy común, Común, Escasa, Rara o Muy rara.",
  "- Indica sus datos físicos estándar de catálogo (peso en gramos, diámetro en mm, grosor en mm).",
  "- Evalúa el grado de conservación visual de las fotos (SC Sin Circular, EBC Excelente Buena Conservación, MBC Muy Buena Conservación, BC Buena Conservación).",
  "- Da una horquilla realista y PRUDENTE de precios de mercado en euros [min, max] para cada grado. Las monedas circuladas comunes valen entre 0.20 y 3 euros.",
  'FORMATO: responde SOLO con un objeto JSON estricto con estas claves: {"tipo_pieza": "moneda", "pais": string, "denominacion": string, "anio": string, "ceca": string, "metal": string, "tirada_estimada": string, "rareza": "Muy común"|"Común"|"Escasa"|"Rara"|"Muy rara", "tipo_canto": string, "especificaciones": {"peso_g": string, "diametro_mm": string, "grosor_mm": string}, "grado_estimado": "SC"|"EBC"|"MBC"|"BC", "precios_por_grado": {"SC": [number, number], "EBC": [number, number], "MBC": [number, number], "BC": [number, number]}, "explicacion": "2 o 3 frases en español detallando anverso, reverso y canto"}',
].join("\n");

const STAMP_INSTRUCTIONS = [
  "Eres un experto filatélico y tasador prudente. Analizas DOS fotografías de un sello postal: 1) Anverso (imagen y dentado) y 2) Reverso (goma y charnela).",
  "INSTRUCCIONES:",
  "- Identifica país emisor, serie o temática, año de emisión, valor facial, color de impresión y número aproximado de catálogo (Edifil/Yvert/Scott si es reconocible).",
  "- Evalúa la calidad del dentado y centrado en la primera foto (Completo y bien centrado, Descentrado, Diente corto/defectuoso, Imperforado, etc.).",
  "- Evalúa el estado en ambas fotos: MNH (**) (nuevo sin charnela con goma original), MH (*) (nuevo con huella de fijasellos), Sin goma, o Usado (O) (con matasellos).",
  "- Da horquillas realistas y PRUDENTES de valor en euros [min, max] para cada estado.",
  'FORMATO: responde SOLO con un objeto JSON estricto con estas claves: {"tipo_pieza": "sello", "pais": string, "serie_tematica": string, "anio": string, "valor_facial": string, "color_impresion": string, "numero_catalogo": string, "rareza": "Muy común"|"Común"|"Escaso"|"Raro"|"Muy raro", "evaluacion_dentado": string, "estado_estimado": "MNH (**)"|"MH (*)"|"Sin goma"|"Usado (O)", "precios_por_estado": {"MNH (**)": [number, number], "MH (*)": [number, number], "Sin goma": [number, number], "Usado (O)": [number, number]}, "explicacion": "2 o 3 frases en español detallando emisión, centrado, matasellos y reverso"}',
].join("\n");

async function timedFetch(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return { status: res.status, raw: await res.text() };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(ctrl.signal.aborted ? `sin respuesta en ${ms / 1000} s (timeout)` : `sin conexión con Groq (${reason})`);
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

async function detectModel(apiKey: string): Promise<string> {
  const { status, raw } = await timedFetch(
    `${BASE}/models`,
    { headers: { Authorization: `Bearer ${apiKey.trim()}` } },
    LIST_TIMEOUT_MS
  );
  if (status < 200 || status >= 300) throw new Error(errorText(status, raw));
  const ids: string[] = ((parseJson(raw)?.data ?? []) as { id: string; active?: boolean }[])
    .filter((m) => m.active !== false)
    .map((m) => m.id);
  if (ids.includes(PRIMARY)) return PRIMARY;
  if (ids.includes(SECONDARY)) return SECONDARY;
  const vision = ids.find((id) => /(llama-4|scout|maverick|vision)/i.test(id));
  return vision ?? PRIMARY;
}

async function candidates(): Promise<string[]> {
  const saved = await storage.getItem(MODEL_KEY, "");
  const s: string = typeof saved === "string" ? saved : "";
  const head = s === SECONDARY ? [SECONDARY, PRIMARY] : [PRIMARY, SECONDARY];
  return [...new Set([...head, s].filter(Boolean))];
}
async function chat(model: string, apiKey: string, content: unknown, json: boolean): Promise<string> {
  const { status, raw } = await timedFetch(
    `${BASE}/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content }],
        temperature: json ? 0.1 : 0.2,
        max_completion_tokens: json ? 1100 : 10,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    },
    TIMEOUT_MS
  );
  if (status < 200 || status >= 300) throw new Error(errorText(status, raw));
  const choices = parseJson(raw)?.choices;
  const text: string | undefined = Array.isArray(choices) ? choices.at(0)?.message?.content : undefined;
  if (!text) throw new Error("respuesta vacía de Groq");
  return text;
}

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
      if (/HTTP 401/.test(msg)) break;
    }
  }
  throw new Error(`No se pudo conectar con Groq.\n${errors.join("\n")}`);
}

const cleanJsonText = (text: string) => {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) return text.slice(first, last + 1);
  return text.trim();
};

function parse(text: string): Analysis {
  const a = JSON.parse(cleanJsonText(text)) as Analysis;
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

const toDataUrl = (b64: string, mime = "image/jpeg") =>
  b64.startsWith("data:") ? b64 : `data:${mime};base64,${b64}`;

export async function testConnection(apiKey: string): Promise<string> {
  const res = await call(apiKey, "Responde solo OK", false );
  return res.model;
}

export async function analyzePhoto(apiKey: string, imageBase64: string, mimeType = "image/jpeg"): Promise<Analysis> {
  const { text } = await call(
    apiKey,
    [
      { type: "text", text: INSTRUCTIONS },
      { type: "image_url", image_url: { url: toDataUrl(imageBase64, mimeType) } },
    ],
    true
  );
  return parse(text);
}

export async function analyzeBarcode(apiKey: string, code: string, type: string): Promise<Analysis> {
  const { text } = await call(
    apiKey,
    `${INSTRUCTIONS}\n\nIdentifica y tasa este artículo a partir de su código de barras (${type}): ${code}`,
    true
  );
  return parse(text);
}

export async function analyzeText(apiKey: string, description: string): Promise<Analysis> {
  const { text } = await call(
    apiKey,
    `${INSTRUCTIONS}\n\nIdentifica y tasa este artículo descrito por el usuario: ${description}`,
    true
  );
  return parse(text);
}

const normRange = (arr: unknown): [number, number] => {
  if (Array.isArray(arr) && arr.length >= 2) {
    const a = Math.max(0, Number(arr.at(0)) || 0);
    const b = Math.max(a, Number(arr.at(1)) || 0);
    return [a, b];
  }
  return [0, 0];
};

export async function analyzeCoin(
  apiKey: string,
  photos: { anverso: string; reverso: string; canto: string }
): Promise<CoinAnalysis> {
  const { text } = await call(
    apiKey,
    [
      { type: "text", text: COIN_INSTRUCTIONS },
      { type: "text", text: "Imagen 1 — ANVERSO (Cara):" },
      { type: "image_url", image_url: { url: toDataUrl(photos.anverso) } },
      { type: "text", text: "Imagen 2 — REVERSO (Cruz):" },
      { type: "image_url", image_url: { url: toDataUrl(photos.reverso) } },
      { type: "text", text: "Imagen 3 — CANTO (Borde / Perfil):" },
      { type: "image_url", image_url: { url: toDataUrl(photos.canto) } },
    ],
    true
  );
  const raw = JSON.parse(cleanJsonText(text)) as CoinAnalysis;
  const grades = ["SC", "EBC", "MBC", "BC"] as const;
  return {
    tipo_pieza: "moneda",
    pais: String(raw.pais ?? "Desconocido"),
    denominacion: String(raw.denominacion ?? "Moneda"),
    anio: String(raw.anio ?? "S/F"),
    ceca: String(raw.ceca ?? "Sin marca visible"),
    metal: String(raw.metal ?? "Desconocido"),
    tirada_estimada: String(raw.tirada_estimada ?? "No disponible"),
    rareza: (["Muy común", "Común", "Escasa", "Rara", "Muy rara"] as const).includes(raw.rareza)
      ? raw.rareza
      : "Común",
    tipo_canto: String(raw.tipo_canto ?? "No apreciable"),
    especificaciones: {
      peso_g: String(raw.especificaciones?.peso_g ?? "-"),
      diametro_mm: String(raw.especificaciones?.diametro_mm ?? "-"),
      grosor_mm: String(raw.especificaciones?.grosor_mm ?? "-"),
    },
    grado_estimado: grades.includes(raw.grado_estimado) ? raw.grado_estimado : "MBC",
    precios_por_grado: {
      SC: normRange(raw.precios_por_grado?.SC),
      EBC: normRange(raw.precios_por_grado?.EBC),
      MBC: normRange(raw.precios_por_grado?.MBC),
      BC: normRange(raw.precios_por_grado?.BC),
    },
    explicacion: String(raw.explicacion ?? ""),
  };
}

const CARD_INSTRUCTIONS = [
  "Eres un experto tasador de cartas coleccionables (Pokémon TCG, Magic, Yu-Gi-Oh!, deportes y cromos) y detector de falsificaciones. Puedes recibir 1 foto (solo Anverso) o 2 fotos (Anverso y Reverso).",
  "INSTRUCCIONES:",
  "- Lee exactamente el nombre de la carta, la expansión/colección (símbolo o código inferior), el número de carta (ej. 025/198), el idioma y el acabado (Normal, Holo, Reverse Holo, EX, GX, V, VMAX, Illustration Rare, Full Art).",
  "- Comprueba indicios de autenticidad (tipografía correcta, textura en cartas Full Art/VMAX, brillo diagonal en Pokémon, tono azul y nitidez del reverso si se aporta la 2ª foto). Si parece falsa o proxy, indícalo claramente.",
  "- Evalúa el centrado, esquinas y blanqueamiento (whitening) en bordes para estimar su estado: Near Mint (NM), Excellent (EX), Good (GD) o Played (PL).",
  "- Da horquillas realistas y PRUDENTES de precio de mercado en euros [min, max] para cada estado.",
  'FORMATO: responde SOLO con un objeto JSON estricto con estas claves: {"tipo_pieza": "carta", "juego_o_coleccion": string, "nombre_carta": string, "expansion_set": string, "numero_carta": string, "idioma": string, "rareza": string, "autenticidad": "Original aparente"|"Posible réplica / Proxy"|"No determinable", "estado_estimado": "Near Mint (NM)"|"Excellent (EX)"|"Good (GD)"|"Played (PL)", "precios_por_estado": {"Near Mint (NM)": [number, number], "Excellent (EX)": [number, number], "Good (GD)": [number, number], "Played (PL)": [number, number]}, "explicacion": "2 o 3 frases en español detallando edición, rareza, centrado/bordes y autenticidad"}',
].join("\n");

export async function analyzeStamp(apiKey: string, photoBase64: string): Promise<StampAnalysis> {
  const { text } = await call(
    apiKey,
    [
      { type: "text", text: STAMP_INSTRUCTIONS },
      { type: "text", text: "Fotografía del ANVERSO del sello postal (diseño, dentado y matasellos):" },
      { type: "image_url", image_url: { url: toDataUrl(photoBase64) } },
    ],
    true
  );
  const raw = JSON.parse(cleanJsonText(text)) as StampAnalysis;
  const states = ["MNH (**)", "MH (*)", "Sin goma", "Usado (O)"] as const;
  return {
    tipo_pieza: "sello",
    pais: String(raw.pais ?? "Desconocido"),
    serie_tematica: String(raw.serie_tematica ?? "Sello postal"),
    anio: String(raw.anio ?? "S/F"),
    valor_facial: String(raw.valor_facial ?? "-"),
    color_impresion: String(raw.color_impresion ?? "-"),
    numero_catalogo: String(raw.numero_catalogo ?? "No identificado"),
    rareza: (["Muy común", "Común", "Escaso", "Raro", "Muy raro"] as const).includes(raw.rareza)
      ? raw.rareza
      : "Común",
    evaluacion_dentado: String(raw.evaluacion_dentado ?? "No apreciable"),
    estado_estimado: states.includes(raw.estado_estimado) ? raw.estado_estimado : "Usado (O)",
    precios_por_estado: {
      "MNH (**)": normRange(raw.precios_por_estado?.["MNH (**)"]),
      "MH (*)": normRange(raw.precios_por_estado?.["MH (*)"]),
      "Sin goma": normRange(raw.precios_por_estado?.["Sin goma"]),
      "Usado (O)": normRange(raw.precios_por_estado?.["Usado (O)"]),
    },
    explicacion: String(raw.explicacion ?? ""),
  };
}

export async function analyzeCard(
  apiKey: string,
  photos: { anverso: string; reverso?: string | null }
): Promise<CardAnalysis> {
  const content: unknown[] = [
    { type: "text", text: CARD_INSTRUCTIONS },
    { type: "text", text: "Imagen 1 — ANVERSO de la carta/cromo:" },
    { type: "image_url", image_url: { url: toDataUrl(photos.anverso) } },
  ];
  if (photos.reverso) {
    content.push(
      { type: "text", text: "Imagen 2 — REVERSO de la carta/cromo (bordes y estado del dorso):" },
      { type: "image_url", image_url: { url: toDataUrl(photos.reverso) } }
    );
  }
  const { text } = await call(apiKey, content, true);
  const raw = JSON.parse(cleanJsonText(text)) as CardAnalysis;
  const states = ["Near Mint (NM)", "Excellent (EX)", "Good (GD)", "Played (PL)"] as const;
  const auths = ["Original aparente", "Posible réplica / Proxy", "No determinable"] as const;
  return {
    tipo_pieza: "carta",
    juego_o_coleccion: String(raw.juego_o_coleccion ?? "Pokémon / Cromo"),
    nombre_carta: String(raw.nombre_carta ?? "Carta coleccionable"),
    expansion_set: String(raw.expansion_set ?? "-"),
    numero_carta: String(raw.numero_carta ?? "-"),
    idioma: String(raw.idioma ?? "-"),
    rareza: String(raw.rareza ?? "Común"),
    autenticidad: auths.includes(raw.autenticidad) ? raw.autenticidad : "No determinable",
    estado_estimado: states.includes(raw.estado_estimado) ? raw.estado_estimado : "Excellent (EX)",
    precios_por_estado: {
      "Near Mint (NM)": normRange(raw.precios_por_estado?.["Near Mint (NM)"]),
      "Excellent (EX)": normRange(raw.precios_por_estado?.["Excellent (EX)"]),
      "Good (GD)": normRange(raw.precios_por_estado?.["Good (GD)"]),
      "Played (PL)": normRange(raw.precios_por_estado?.["Played (PL)"]),
    },
    explicacion: String(raw.explicacion ?? ""),
  };
}

import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

import type { Category } from "@/src/ai";
import type { Light } from "@/src/verdict";
import { storage } from "@/src/utils/storage";
import type { Vertical } from "@/src/vertical";

const ITEMS_KEY = "elyranex_local_items_v1";

export const ORIGINS = ["Mercadillo", "Tienda", "Wallapop", "Otro"] as const;
export const COIN_ORIGINS = [
  "Cambio diario",
  "Mercadillo",
  "Tienda numismática",
  "Intercambio",
  "Herencia / Regalo",
  "Online",
] as const;
export const PLATFORMS = ["Wallapop", "Vinted", "eBay", "Todocolección", "Otro"] as const;

export type Origin = (typeof ORIGINS)[number] | (typeof COIN_ORIGINS)[number];
export type SalePlatform = (typeof PLATFORMS)[number];

export type CoinGrade = "SC" | "EBC" | "MBC" | "BC";
export type StampGrade = "MNH (**)" | "MH (*)" | "Sin goma" | "Usado (O)";
export type CollectionDest = "coleccion" | "repetida_venta";

export type CollectiblePhotos = {
  anverso: string;
  reverso: string;
  canto?: string | null;
};

export type CollectibleData = {
  tipo_pieza: "moneda" | "sello";
  pais: string;
  denominacion: string;
  anio: string;
  ceca?: string;
  metal_o_color: string;
  rareza: string;
  tirada_estimada: string;
  tipo_canto_o_dentado: string;
  peso_g?: string;
  diametro_mm?: string;
  grosor_mm?: string;
  grado: string;
  valor_min: number;
  valor_max: number;
  destino: CollectionDest;
  album: string;
};

export type NewItem = {
  client_id: string;
  vertical?: Vertical;
  nombre: string;
  marca: string;
  modelo_edicion: string;
  estado_visual: string;
  categoria: Category;
  precio_nuevo: number;
  ver: number;
  demanda: "Alta" | "Media" | "Baja";
  explicacion: string;
  semaforo: Light;
  precio_pagado: number;
  origen: Origin;
  fecha_compra: string;
  photo_base64: string | null;
  collectible_photos_base64?: CollectiblePhotos | null;
  collectible_data?: CollectibleData | null;
};

export type Item = Omit<NewItem, "photo_base64" | "collectible_photos_base64"> & {
  id: string;
  vertical: Vertical;
  estado: "En stock" | "Vendido";
  gastos_extra: number;
  fecha_venta: string | null;
  precio_venta: number | null;
  comisiones: number | null;
  plataforma: SalePlatform | null;
  has_photo: boolean;
  pending?: boolean;
  local_photo?: string | null;
  collectible_photos?: CollectiblePhotos | null;
};

async function savePhotoToDisk(id: string, slot: string, base64: string): Promise<string> {
  const clean = base64.replace(/^data:image\/[\w.+-]+;base64,/, "");
  const dataUri = `data:image/jpeg;base64,${clean}`;
  if (Platform.OS === "web" || !FileSystem.documentDirectory) {
    return dataUri;
  }
  try {
    const dir = `${FileSystem.documentDirectory}elyranex_media/`;
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    const fileUri = `${dir}${id}_${slot}.jpg`;
    await FileSystem.writeAsStringAsync(fileUri, clean, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return fileUri;
  } catch {
    return dataUri;
  }
}

async function readItems(): Promise<Item[]> {
  const raw = await storage.getItem(ITEMS_KEY, "[]");
  try {
    const parsed = JSON.parse(typeof raw === "string" ? raw : "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((it) => ({
      ...it,
      vertical: it.vertical === "coleccionismo" ? "coleccionismo" : "reventa",
    }));
  } catch {
    return [];
  }
}

const writeItems = (list: Item[]) => storage.setItem(ITEMS_KEY, JSON.stringify(list));

export const newClientId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export async function createItem(item: NewItem): Promise<{ offline: boolean }> {
  const current = await readItems();
  const { photo_base64, collectible_photos_base64, ...rest } = item;
  const id = item.client_id || newClientId();
  const vertical: Vertical = item.vertical ?? "reventa";

  let savedCollectiblePhotos: CollectiblePhotos | null = null;
  if (collectible_photos_base64) {
    const anverso = await savePhotoToDisk(id, "anverso", collectible_photos_base64.anverso);
    const reverso = await savePhotoToDisk(id, "reverso", collectible_photos_base64.reverso);
    const canto = collectible_photos_base64.canto
      ? await savePhotoToDisk(id, "canto", collectible_photos_base64.canto)
      : null;
    savedCollectiblePhotos = { anverso, reverso, canto };
  }

  const mainBase64 = photo_base64 ?? collectible_photos_base64?.anverso ?? null;
  const localPhoto =
    savedCollectiblePhotos?.anverso ??
    (mainBase64 ? `data:image/jpeg;base64,${mainBase64.replace(/^data:image\/[\w.+-]+;base64,/, "")}` : null);

  const savedItem: Item = {
    ...rest,
    id,
    vertical,
    estado: "En stock",
    gastos_extra: 0,
    fecha_venta: null,
    precio_venta: null,
    comisiones: null,
    plataforma: null,
    has_photo: Boolean(localPhoto),
    pending: false,
    local_photo: localPhoto,
    collectible_photos: savedCollectiblePhotos,
  };

  const ok = await writeItems([savedItem, ...current]);
  if (!ok) throw new Error("No hay suficiente espacio en el teléfono para guardar el artículo.");
  return { offline: false };
}

export async function syncPending(): Promise<number> {
  return 0;
}

export async function fetchItems(vertical?: Vertical): Promise<{ items: Item[]; offline: boolean }> {
  const all = await readItems();
  const items = vertical ? all.filter((i) => i.vertical === vertical) : all;
  return { items, offline: false };
}

export async function getItem(id: string): Promise<Item> {
  const items = await readItems();
  const found = items.find((i) => i.id === id);
  if (!found) throw new Error("Artículo no encontrado");
  return found;
}

export async function addExpense(id: string, amount: number): Promise<Item> {
  const items = await readItems();
  let updated: Item | null = null;
  const next = items.map((i) => {
    if (i.id !== id) return i;
    updated = { ...i, gastos_extra: Math.round((i.gastos_extra + amount) * 100) / 100 };
    return updated;
  });
  await writeItems(next);
  if (!updated) throw new Error("Artículo no encontrado");
  return updated;
}

export async function sellItem(
  id: string,
  body: { precio_venta: number; comisiones: number; plataforma: SalePlatform }
): Promise<Item> {
  const items = await readItems();
  let updated: Item | null = null;
  const next = items.map((i) => {
    if (i.id !== id) return i;
    updated = {
      ...i,
      estado: "Vendido",
      fecha_venta: new Date().toISOString(),
      precio_venta: body.precio_venta,
      comisiones: body.comisiones,
      plataforma: body.plataforma,
    };
    return updated;
  });
  await writeItems(next);
  if (!updated) throw new Error("Artículo no encontrado");
  return updated;
}

export const totalCost = (i: Item) => i.precio_pagado + i.gastos_extra;
export const netProfit = (i: Item) => (i.precio_venta ?? 0) - (i.comisiones ?? 0) - totalCost(i);

export function daysInStock(i: Item): number {
  const end = i.fecha_venta ? new Date(i.fecha_venta).getTime() : Date.now();
  return Math.max(0, Math.floor((end - new Date(i.fecha_compra).getTime()) / 86400000));
}

export const parseEuro = (t: string) => {
  const n = parseFloat(t.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};
export const cleanEuro = (t: string) => t.replace(/[^0-9.,]/g, "").slice(0, 8);
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });

export const OLD_STOCK_DAYS = 45;

export function quickSalePrice(i: Item) {
  const days = daysInStock(i);
  const factor = days > 90 ? 0.65 : days > 60 ? 0.75 : 0.85;
  const discount = Math.round((1 - factor) * 100);
  const raw = Math.round(i.ver * factor);
  const floor = Math.ceil(totalCost(i));
  return { price: Math.max(raw, floor), discount, atCost: raw <= floor };
}

export async function createBackupCode(): Promise<{ code: string; expires_at: string; items: number }> {
  const items = await readItems();
  const payload = JSON.stringify(items);
  return {
    code: payload,
    expires_at: "Sin caducidad (Copia local JSON)",
    items: items.length,
  };
}

export async function restoreBackup(code: string): Promise<{ device_id: string; items: number; merged: number }> {
  const parsed = JSON.parse(code);
  if (!Array.isArray(parsed)) throw new Error("Código de copia no válido");
  const current = await readItems();
  const existingIds = new Set(current.map((i) => i.id));
  const incoming = parsed.filter((i: Item) => i && i.id && !existingIds.has(i.id));
  const mergedList = [...incoming, ...current];
  await writeItems(mergedList);
  return {
    device_id: "local",
    items: mergedList.length,
    merged: incoming.length,
  };
}

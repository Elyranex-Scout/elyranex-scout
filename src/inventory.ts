import type { Category } from "@/src/ai";
import type { Light } from "@/src/verdict";
import { storage } from "@/src/utils/storage";

const ITEMS_KEY = "elyranex_local_items_v1";

export const ORIGINS = ["Mercadillo", "Tienda", "Wallapop", "Otro"] as const;
export const PLATFORMS = ["Wallapop", "Vinted", "eBay", "Otro"] as const;
export type Origin = (typeof ORIGINS)[number];
export type SalePlatform = (typeof PLATFORMS)[number];

export type NewItem = {
  client_id: string;
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
};

export type Item = Omit<NewItem, "photo_base64"> & {
  id: string;
  estado: "En stock" | "Vendido";
  gastos_extra: number;
  fecha_venta: string | null;
  precio_venta: number | null;
  comisiones: number | null;
  plataforma: SalePlatform | null;
  has_photo: boolean;
  pending?: boolean;
  local_photo?: string | null;
};

async function readItems(): Promise<Item[]> {
  const raw = await storage.getItem(ITEMS_KEY, "[]");
  try {
    const parsed = JSON.parse(typeof raw === "string" ? raw : "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const writeItems = (list: Item[]) => storage.setItem(ITEMS_KEY, JSON.stringify(list));

export const newClientId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export async function createItem(item: NewItem): Promise<{ offline: boolean }> {
  const current = await readItems();
  const { photo_base64, ...rest } = item;
  const savedItem: Item = {
    ...rest,
    id: item.client_id || newClientId(),
    estado: "En stock",
    gastos_extra: 0,
    fecha_venta: null,
    precio_venta: null,
    comisiones: null,
    plataforma: null,
    has_photo: Boolean(photo_base64),
    pending: false,
    local_photo: photo_base64 ? `data:image/jpeg;base64,${photo_base64}` : null,
  };
  const ok = await writeItems([savedItem, ...current]);
  if (!ok) throw new Error("No hay suficiente espacio en el teléfono para guardar el artículo.");
  return { offline: false };
}

export async function syncPending(): Promise<number> {
  return 0;
}

export async function fetchItems(): Promise<{ items: Item[]; offline: boolean }> {
  const items = await readItems();
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
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });

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

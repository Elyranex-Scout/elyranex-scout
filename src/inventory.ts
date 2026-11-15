import { api, NetworkError, setDeviceId } from "@/src/api";
import type { Category } from "@/src/ai";
import type { Light } from "@/src/verdict";
import { storage } from "@/src/utils/storage";

const PENDING_KEY = "pending_items";
const CACHE_KEY = "items_cache";

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

async function readList<T>(key: string): Promise<T[]> {
  const raw = await storage.getItem(key, "[]");
  try {
    return JSON.parse(typeof raw === "string" ? raw : "[]") as T[];
  } catch {
    return [];
  }
}
const writeList = (key: string, list: unknown[]) => storage.setItem(key, JSON.stringify(list));

const pendingToItem = (p: NewItem): Item => ({
  ...p,
  id: `pending-${p.client_id}`,
  estado: "En stock",
  gastos_extra: 0,
  fecha_venta: null,
  precio_venta: null,
  comisiones: null,
  plataforma: null,
  has_photo: false,
  pending: true,
  local_photo: p.photo_base64 ? `data:image/jpeg;base64,${p.photo_base64}` : null,
});

export const newClientId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

// Save online; if there is no coverage, queue locally and sync later.
export async function createItem(item: NewItem): Promise<{ offline: boolean }> {
  try {
    await api<Item>("/items", { method: "POST", body: item }, 25000);
    return { offline: false };
  } catch (e) {
    if (!(e instanceof NetworkError)) throw e;
    const pending = await readList<NewItem>(PENDING_KEY);
    const ok = await writeList(PENDING_KEY, [item, ...pending]);
    if (!ok) throw new Error("Sin conexión y sin espacio para guardar en el teléfono.");
    return { offline: true };
  }
}

export async function syncPending(): Promise<number> {
  const pending = await readList<NewItem>(PENDING_KEY);
  if (!pending.length) return 0;
  const left: NewItem[] = [];
  let offline = false;
  for (const p of pending) {
    if (offline) {
      left.push(p);
      continue;
    }
    try {
      await api<Item>("/items", { method: "POST", body: p }, 25000);
    } catch (e) {
      if (e instanceof NetworkError) offline = true;
      left.push(p);
    }
  }
  await writeList(PENDING_KEY, left);
  return left.length;
}

export async function fetchItems(): Promise<{ items: Item[]; offline: boolean }> {
  await syncPending();
  const pending = (await readList<NewItem>(PENDING_KEY)).map(pendingToItem);
  try {
    const items = await api<Item[]>("/items");
    await writeList(CACHE_KEY, items);
    return { items: [...pending, ...items], offline: false };
  } catch (e) {
    if (!(e instanceof NetworkError)) throw e;
    const cache = await readList<Item>(CACHE_KEY);
    return { items: [...pending, ...cache], offline: true };
  }
}

export const getItem = (id: string) => api<Item>(`/items/${id}`);
export const addExpense = (id: string, amount: number) =>
  api<Item>(`/items/${id}/expenses`, { method: "POST", body: { amount } });
export const sellItem = (id: string, body: { precio_venta: number; comisiones: number; plataforma: SalePlatform }) =>
  api<Item>(`/items/${id}/sell`, { method: "POST", body });

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

// Suggested quick-sale price for stale stock: deeper discount the longer it sits, never below total cost.
export function quickSalePrice(i: Item) {
  const days = daysInStock(i);
  const factor = days > 90 ? 0.65 : days > 60 ? 0.75 : 0.85;
  const discount = Math.round((1 - factor) * 100);
  const raw = Math.round(i.ver * factor);
  const floor = Math.ceil(totalCost(i));
  return { price: Math.max(raw, floor), discount, atCost: raw <= floor };
}

export async function createBackupCode() {
  await syncPending();
  return api<{ code: string; expires_at: string; items: number }>("/backup/code", { method: "POST" });
}

export async function restoreBackup(code: string) {
  await syncPending();
  const res = await api<{ device_id: string; items: number; merged: number }>("/backup/restore", {
    method: "POST",
    body: { code },
  });
  await setDeviceId(res.device_id);
  await writeList(CACHE_KEY, []);
  return res;
}

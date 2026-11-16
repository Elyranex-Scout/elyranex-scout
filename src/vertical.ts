import { useEffect, useState } from "react";
import { storage } from "@/src/utils/storage";

export type Vertical = "reventa" | "coleccionismo";

const VERTICAL_KEY = "elyranex_active_vertical_v1";

let currentVertical: Vertical = "reventa";
let initialized = false;
const listeners = new Set<(v: Vertical) => void>();

export async function initVertical(): Promise<Vertical> {
  if (initialized) return currentVertical;
  try {
    const saved = await storage.getItem(VERTICAL_KEY, "reventa");
    if (saved === "reventa" || saved === "coleccionismo") {
      currentVertical = saved;
    }
  } catch {}
  initialized = true;
  return currentVertical;
}

export function getVertical(): Vertical {
  return currentVertical;
}

export async function setVertical(next: Vertical): Promise<void> {
  currentVertical = next;
  initialized = true;
  listeners.forEach((fn) => fn(next));
  try {
    await storage.setItem(VERTICAL_KEY, next);
  } catch {}
}

export function useVertical(): [Vertical, (next: Vertical) => Promise<void>] {
  const [vertical, setLocal] = useState<Vertical>(currentVertical);

  useEffect(() => {
    let active = true;
    initVertical().then((v) => {
      if (active) setLocal(v);
    });
    const handler = (v: Vertical) => {
      if (active) setLocal(v);
    };
    listeners.add(handler);
    return () => {
      active = false;
      listeners.delete(handler);
    };
  }, []);

  return [vertical, setVertical];
}

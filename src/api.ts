import { storage } from "@/src/utils/storage";

export const API = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

let deviceId: string | null = null;

// Anonymous per-device id: scopes this phone's inventory on the server.
export async function getDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  const stored = await storage.secureGet("device_id", "");
  let id: string = typeof stored === "string" ? stored : "";
  if (!id) {
    id = `dev${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    await storage.secureSet("device_id", id);
  }
  deviceId = id;
  return id;
}

export class NetworkError extends Error {}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}, timeoutMs = 20000): Promise<T> {
  const dev = await getDeviceId();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: init.method ?? "GET",
      headers: { "Content-Type": "application/json", "X-Device-Id": dev },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    throw new NetworkError("Sin conexión. Inténtalo cuando tengas cobertura.");
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.detail;
    throw new Error(typeof detail === "string" ? detail : `Error ${res.status}`);
  }
  return data as T;
}

export const photoUrl = (itemId: string, dev: string) => `${API}/items/${itemId}/photo?device=${dev}`;

// Adopt another phone's identity after redeeming a backup code.
export async function setDeviceId(id: string) {
  await storage.secureSet("device_id", id);
  deviceId = id;
}

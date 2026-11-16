import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";

const MAX_BYTES = 300 * 1024;
const STEPS: [number, number][] = [
  [1000, 0.6],
  [800, 0.5],
  [640, 0.45],
  [480, 0.4],
];

// Compress the in-memory photo to a JPEG <= 300KB. Returns raw base64 (no data: prefix).
export async function compressPhoto(uri: string): Promise<string> {
  for (const [width, compress] of STEPS) {
    const ctx = ImageManipulator.manipulate(uri);
    ctx.resize({ width });
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ compress, format: SaveFormat.JPEG, base64: true });
    if (Platform.OS !== "web" && out.uri.startsWith("file:")) {
      try {
        new File(out.uri).delete();
      } catch {}
    }
    const b64 = (out.base64 ?? (out.uri.startsWith("data:") ? out.uri : "")).replace(/^data:image\/[\w.+-]+;base64,/, "");
    if (b64 && b64.length * 0.75 <= MAX_BYTES) return b64;
  }
  throw new Error("No se pudo comprimir la foto");
}

// Crops the center guide area and keeps 960px resolution for crisp coin/stamp/card details.
export async function cropCollectibleHD(uri: string, mode: "square" | "edge" = "square"): Promise<string> {
  try {
    const probe = ImageManipulator.manipulate(uri);
    const meta = await probe.renderAsync();
    const w = meta.width || 1000;
    const h = meta.height || 1000;

    const cropW = mode === "edge" ? Math.round(w * 0.85) : Math.round(Math.min(w, h) * 0.6);
    const cropH = mode === "edge" ? Math.round(h * 0.24) : cropW;
    const originX = Math.max(0, Math.round((w - cropW) / 2));
    const originY = Math.max(0, Math.round((h - cropH) / 2));

    const ctx = ImageManipulator.manipulate(uri);
    ctx.crop({ originX, originY, width: cropW, height: cropH });
    ctx.resize({ width: 960 });
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ compress: 0.9, format: SaveFormat.JPEG, base64: true });
    if (Platform.OS !== "web" && out.uri.startsWith("file:")) {
      try {
        new File(out.uri).delete();
      } catch {}
    }
    const b64 = (out.base64 ?? (out.uri.startsWith("data:") ? out.uri : "")).replace(/^data:image\/[\w.+-]+;base64,/, "");
    if (b64) return `data:image/jpeg;base64,${b64}`;
  } catch {}
  const fallback = await compressPhoto(uri);
  return `data:image/jpeg;base64,${fallback}`;
}

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

// Rotates a photo by the given degrees so coins, stamps and cards sit straight (0 deg) in the album.
export async function straightenPhoto(uri: string, degrees: number): Promise<string> {
  const cleanDeg = Math.round(Number(degrees) || 0);
  if (Math.abs(cleanDeg) < 3 || Math.abs(cleanDeg) > 180) return uri;
  try {
    const ctx = ImageManipulator.manipulate(uri);
    ctx.rotate(cleanDeg);
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
  return uri;
}

// Crops and auto-centers the object inside the guide circle/frame at 960px HD.
export async function cropCollectibleHD(uri: string, mode: "square" | "edge" = "square"): Promise<string> {
  try {
    const probe = ImageManipulator.manipulate(uri);
    const meta = await probe.renderAsync();
    const w = meta.width || 1000;
    const h = meta.height || 1000;

    const cropW = mode === "edge" ? Math.round(w * 0.84) : Math.round(Math.min(w, h) * 0.56);
    const cropH = mode === "edge" ? Math.round(h * 0.22) : cropW;
    const originX = Math.max(0, Math.round((w - cropW) / 2));
    const originY = Math.max(0, Math.round((h - cropH) / 2));

    const ctx = ImageManipulator.manipulate(uri);
    ctx.crop({ originX, originY, width: cropW, height: cropH });
    ctx.resize({ width: 640 });
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

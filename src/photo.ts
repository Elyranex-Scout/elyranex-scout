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

// Rotates a coin photo to 12 o'clock based on detected clock position (1..12) and re-centers the square crop.
export async function straightenCoinByClock(uri: string, clockHour: number): Promise<string> {
  const h = Math.round(Number(clockHour) || 12);
  if (h < 1 || h > 11) return uri;
  const degrees = ((12 - h) * 30) % 360;
  if (degrees === 0) return uri;
  try {
    const rotCtx = ImageManipulator.manipulate(uri);
    rotCtx.rotate(degrees);
    const rotRef = await rotCtx.renderAsync();
    const rw = rotRef.width || 640;
    const rh = rotRef.height || 640;

    // Re-crop center 640px box so rotated corners do not leave dark borders
    const targetSide = Math.min(rw, rh, 640);
    const originX = Math.max(0, Math.round((rw - targetSide) / 2));
    const originY = Math.max(0, Math.round((rh - targetSide) / 2));

    const cropCtx = ImageManipulator.manipulate(rotRef.uri);
    cropCtx.crop({ originX, originY, width: targetSide, height: targetSide });
    cropCtx.resize({ width: 640 });
    const finalRef = await cropCtx.renderAsync();
    const out = await finalRef.saveAsync({ compress: 0.88, format: SaveFormat.JPEG, base64: true });

    if (Platform.OS !== "web") {
      try {
        if (rotRef.uri.startsWith("file:")) new File(rotRef.uri).delete();
        if (out.uri.startsWith("file:")) new File(out.uri).delete();
      } catch {}
    }
    const b64 = (out.base64 ?? (out.uri.startsWith("data:") ? out.uri : "")).replace(/^data:image\/[\w.+-]+;base64,/, "");
    if (b64) return `data:image/jpeg;base64,${b64}`;
  } catch {}
  return uri;
}

// Crops the center guide area and keeps 640px resolution for crisp coin/stamp/card details.
export async function cropCollectibleHD(uri: string, mode: "square" | "edge" = "square", zoomFactor = 1): Promise<string> {
  try {
    const probe = ImageManipulator.manipulate(uri);
    const meta = await probe.renderAsync();
    const w = meta.width || 1000;
    const h = meta.height || 1000;

    const z = Math.max(1, zoomFactor);
    const cropW = mode === "edge" ? Math.round((w * 0.84) / z) : Math.round((Math.min(w, h) * 0.56) / z);
    const cropH = mode === "edge" ? Math.round((h * 0.38) / z) : cropW;
    const originX = Math.max(0, Math.round((w - cropW) / 2));
    const originY = Math.max(0, Math.round((h - cropH) / 2));

    const ctx = ImageManipulator.manipulate(uri);
    ctx.crop({ originX, originY, width: cropW, height: cropH });
    ctx.resize({ width: 448 });
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ compress: 0.82, format: SaveFormat.JPEG, base64: true });

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
// Opens the device photo gallery (or native file picker) and returns a compressed/cropped data URI.
export function pickGalleryImage(hdSquare = false): Promise<string | null> {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        const rawUri = typeof reader.result === "string" ? reader.result : "";
        if (!rawUri) {
          resolve(null);
          return;
        }
        try {
          if (hdSquare) {
            // For gallery photos of coins/stamps/cards, resize to 640px preserving full image without tight camera crop
            const ctx = ImageManipulator.manipulate(rawUri);
            ctx.resize({ width: 448 });
            const ref = await ctx.renderAsync();
            const out = await ref.saveAsync({ compress: 0.82, format: SaveFormat.JPEG, base64: true });

            const b64 = (out.base64 ?? (out.uri.startsWith("data:") ? out.uri : "")).replace(/^data:image\/[\w.+-]+;base64,/, "");
            resolve(b64 ? `data:image/jpeg;base64,${b64}` : rawUri);
          } else {
            const b64 = await compressPhoto(rawUri);
            resolve(`data:image/jpeg;base64,${b64}`);
          }
        } catch {
          resolve(rawUri);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

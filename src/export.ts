import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Linking, Platform } from "react-native";

import { API, getDeviceId } from "@/src/api";

export type ExportFormat = "xlsx" | "csv";

const MIME: Record<ExportFormat, { mimeType: string; UTI: string }> = {
  xlsx: { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", UTI: "org.openxmlformats.spreadsheetml.sheet" },
  csv: { mimeType: "text/csv", UTI: "public.comma-separated-values-text" },
};

// Downloads the full database export. Web: browser download. Native: save to cache + share sheet.
export async function exportData(fmt: ExportFormat): Promise<void> {
  const dev = await getDeviceId();
  const url = `${API}/export?fmt=${fmt}&device=${encodeURIComponent(dev)}`;
  if (Platform.OS === "web") {
    await Linking.openURL(url);
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const target = new File(Paths.cache, `elyranex-scout-${stamp}.${fmt}`);
  let file: File;
  try {
    file = await File.downloadFileAsync(url, target, { idempotent: true });
  } catch {
    throw new Error("No se pudo descargar. Comprueba tu conexión.");
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error("Compartir no está disponible en este dispositivo.");
  await Sharing.shareAsync(file.uri, { ...MIME[fmt], dialogTitle: "Exportar Elyranex Scout" });
}

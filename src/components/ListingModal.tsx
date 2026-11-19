import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";

import { generateListing, type GeneratedListing } from "@/src/ai";
import { Icon } from "@/src/components/Icon";
import { loadAiKey } from "@/src/settings";
import { makeStyles, useTheme } from "@/src/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  itemData: {
    nombre: string;
    marca?: string;
    modelo?: string;
    estado?: string;
    precio?: number;
    detalles?: string;
    esColeccionismo?: boolean;
  } | null;
};

export function ListingModal({ visible, onClose, itemData }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [listing, setListing] = useState<GeneratedListing | null>(null);
  const [copied, setCopied] = useState<string>("");

  useEffect(() => {
    if (!visible || !itemData) return;
    let active = true;
    setLoading(true);
    setError("");
    setListing(null);
    setCopied("");

    (async () => {
      try {
        const key = await loadAiKey();
        if (!key) throw new Error("Configura tu API Key de Groq primero.");
        const res = await generateListing(key, itemData);
        if (active) setListing(res);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "No se pudo generar el anuncio.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [visible, itemData]);

  const copyText = async (label: string, text: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.head}>
            <Icon name="creation" size={22} color={colors.brandPrimary} />
            <Text style={styles.title}>Anuncio Automático IA</Text>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.brandPrimary} />
              <Text style={styles.sub}>Redactando título y descripción…</Text>
            </View>
          ) : error ? (
            <Text style={styles.err}>{error}</Text>
          ) : listing ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
              <Text style={styles.badge}>Recomendado: {listing.plataforma_sugerida}</Text>

              <View style={styles.box}>
                <View style={styles.boxTop}>
                  <Text style={styles.label}>TÍTULO</Text>
                  <Pressable onPress={() => copyText("Título copiado", listing.titulo)} style={styles.copyChip}>
                    <Text style={styles.copyChipText}>Copiar</Text>
                  </Pressable>
                </View>
                <Text style={styles.valTitle}>{listing.titulo}</Text>
              </View>

              <View style={styles.box}>
                <View style={styles.boxTop}>
                  <Text style={styles.label}>DESCRIPCIÓN</Text>
                  <Pressable onPress={() => copyText("Descripción copiada", listing.descripcion)} style={styles.copyChip}>
                    <Text style={styles.copyChipText}>Copiar</Text>
                  </Pressable>
                </View>
                <Text style={styles.valDesc}>{listing.descripcion}</Text>
              </View>

              <Pressable
                onPress={() => copyText("Anuncio completo copiado", `${listing.titulo}\n\n${listing.descripcion}`)}
                style={styles.copyAllBtn}
              >
                <Text style={styles.copyAllText}>{copied ? `✓ ${copied}` : "COPIAR TÍTULO Y DESCRIPCIÓN"}</Text>
              </Pressable>
            </ScrollView>
          ) : null}

          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>CERRAR</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  card: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: "88%", gap: 12, borderTopWidth: 1, borderColor: c.borderStrong },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: c.onSurface, fontSize: 19, fontWeight: "900" },
  center: { paddingVertical: 32, alignItems: "center", gap: 10 },
  sub: { color: c.muted, fontSize: 14, fontWeight: "700" },
  err: { color: c.error, fontSize: 14, fontWeight: "800" },
  body: { gap: 12, paddingBottom: 8 },
  badge: { alignSelf: "flex-start", backgroundColor: c.surfaceSecondary, color: c.brandPrimary, fontSize: 12, fontWeight: "900", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: c.brandPrimary },
  box: { backgroundColor: c.surfaceSecondary, borderRadius: 12, padding: 12, gap: 6, borderWidth: 1, borderColor: c.border },
  boxTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: c.muted, fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  copyChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: c.brandPrimary },
  copyChipText: { color: c.onBrandPrimary, fontSize: 11, fontWeight: "900" },
  valTitle: { color: c.onSurface, fontSize: 16, fontWeight: "900" },
  valDesc: { color: c.onSurface, fontSize: 14, lineHeight: 20 },
  copyAllBtn: { height: 50, borderRadius: 12, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  copyAllText: { color: c.onBrandPrimary, fontSize: 14, fontWeight: "900" },
  closeBtn: { height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  closeText: { color: c.onSurface, fontSize: 14, fontWeight: "900" },
}));

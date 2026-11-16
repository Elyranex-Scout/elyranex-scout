import { Icon } from "@/src/components/Icon";
import { useState } from "react";
import { Image, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import type { CardAnalysis, CoinAnalysis, StampAnalysis } from "@/src/ai";
import {
  COIN_ORIGINS,
  cleanEuro,
  parseEuro,
  type CoinGrade,
  type CollectiblePhotos,
  type CollectionDest,
  type Origin,
  type StampGrade,
} from "@/src/inventory";
import { makeStyles, useTheme } from "@/src/theme";

const COIN_GRADES: CoinGrade[] = ["SC", "EBC", "MBC", "BC"];
const STAMP_GRADES: StampGrade[] = ["MNH (**)", "MH (*)", "Sin goma", "Usado (O)"];
const CARD_GRADES = ["Near Mint (NM)", "Excellent (EX)", "Good (GD)", "Played (PL)"] as const;

const COIN_ALBUMS = ["Euros", "Pesetas", "Moneda Antigua", "Extranjera", "Conmemorativas"];
const STAMP_ALBUMS = ["Filatelia España", "Filatelia Mundial", "Temática", "Clásicos"];
const CARD_ALBUMS = ["Pokémon TCG", "Magic / Yu-Gi-Oh!", "Fútbol / Deportes", "Cromos Vintage"];

export type CollectibleAnalysis = CoinAnalysis | StampAnalysis | CardAnalysis;

type Props = {
  result: CollectibleAnalysis;
  photos: CollectiblePhotos;
  asking: number | null;
  saving: boolean;
  onDiscard: () => void;
  onSave: (payload: {
    grade: string;
    valMin: number;
    valMax: number;
    destino: CollectionDest;
    album: string;
    precioPagado: number;
    origen: Origin;
  }) => Promise<void>;
};

export function CollectibleResultView({ result, photos, asking, saving, onDiscard, onSave }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const kind = result.tipo_pieza;

  const defaultAlbums = kind === "moneda" ? COIN_ALBUMS : kind === "sello" ? STAMP_ALBUMS : CARD_ALBUMS;
  const gradesList = kind === "moneda" ? COIN_GRADES : kind === "sello" ? STAMP_GRADES : CARD_GRADES;

  const [grade, setGrade] = useState<string>(
    kind === "moneda" ? result.grado_estimado : result.estado_estimado
  );
  const [saveOpen, setSaveOpen] = useState(false);
  const [destino, setDestino] = useState<CollectionDest>("coleccion");
  const [album, setAlbum] = useState<string>(defaultAlbums.at(0)!);
  const [priceText, setPriceText] = useState<string>(asking ? String(asking) : "0");
  const [origen, setOrigen] = useState<Origin>(COIN_ORIGINS.at(0)!);
  const [err, setErr] = useState("");

  const range: [number, number] =
    kind === "moneda"
      ? result.precios_por_grado[grade as CoinGrade] ?? [Number(0), Number(0)]
      : kind === "sello"
      ? result.precios_por_estado[grade as StampGrade] ?? [Number(0), Number(0)]
      : result.precios_por_estado[grade as (typeof CARD_GRADES)[number]] ?? [Number(0), Number(0)];

  const minVal = range.at(0) ?? 0;
  const maxVal = range.at(1) ?? minVal;

  const photoSlots =
    kind === "moneda"
      ? [
          { label: "Anverso", uri: photos.anverso },
          { label: "Reverso", uri: photos.reverso },
          ...(photos.canto ? [{ label: "Canto", uri: photos.canto }] : []),
        ]
      : kind === "carta"
      ? [
          { label: "Anverso", uri: photos.anverso },
          ...(photos.reverso ? [{ label: "Reverso", uri: photos.reverso }] : []),
        ]
      : [{ label: "Anverso (Sello)", uri: photos.anverso }];

  const handleConfirmSave = async () => {
    const parsed = priceText.trim() ? parseEuro(priceText) : 0;
    if (Number.isNaN(parsed) || parsed < 0) {
      setErr("Introduce un importe válido (puede ser 0 €)");
      return;
    }
    setErr("");
    await onSave({
      grade,
      valMin: minVal,
      valMax: maxVal,
      destino,
      album: album.trim() || defaultAlbums.at(0)!,
      precioPagado: parsed,
      origen,
    });
  };
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerBadge}>
          <Icon name={kind === "moneda" ? "coins" : kind === "sello" ? "stamp" : "layers"} size={18} color={colors.brandPrimary} />
          <Text style={styles.headerBadgeText}>
            {kind === "moneda" ? "NUMISMÁTICA" : kind === "sello" ? "FILATELIA" : "CARTAS / CROMOS"} · {result.rareza.toUpperCase()}
          </Text>
        </View>

        <Text style={styles.title}>
          {kind === "moneda"
            ? `${result.denominacion} · ${result.pais}`
            : kind === "sello"
            ? result.serie_tematica
            : result.nombre_carta}
        </Text>
        <Text style={styles.subtitle}>
          {kind === "moneda"
            ? `Año ${result.anio} · Ceca: ${result.ceca}`
            : kind === "sello"
            ? `${result.pais} · Año ${result.anio} · Facial: ${result.valor_facial}`
            : `${result.juego_o_coleccion} · ${result.expansion_set} (${result.numero_carta})`}
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
          {photoSlots.map((slot) => (
            <View key={slot.label} style={styles.photoCard}>
              <Image source={{ uri: slot.uri }} style={styles.photoImg} resizeMode="cover" />
              <Text style={styles.photoLabel}>{slot.label}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.priceCard}>
          <Text style={styles.sectionLabel}>
            {kind === "moneda" ? "GRADO DE CONSERVACIÓN" : "ESTADO DE LA PIEZA"}
          </Text>
          <View style={styles.gradeRow}>
            {gradesList.map((g) => {
              const active = grade === g;
              return (
                <Pressable key={g} onPress={() => setGrade(g)} style={[styles.gradeBtn, active && styles.gradeBtnActive]}>
                  <Text style={[styles.gradeText, active && styles.gradeTextActive]} numberOfLines={1}>{g}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.valBox}>
            <Text style={styles.valTitle}>Valoración estimada ({grade})</Text>
            <Text style={styles.valAmount}>
              {minVal === maxVal ? `${minVal.toFixed(2)} €` : `${minVal.toFixed(2)} € – ${maxVal.toFixed(2)} €`}
            </Text>
            {asking !== null && asking > 0 ? (
              <Text style={styles.askingNote}>
                Piden: {asking.toFixed(2)} € {maxVal >= asking ? "· En precio de mercado" : "· Por encima de tasación"}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.specsCard}>
          <Text style={styles.sectionLabel}>DATOS DE CATÁLOGO</Text>
          {kind === "moneda" ? (
            <>
              <Row label="Metal / Aleación" value={result.metal} />
              <Row label="Tipo de canto" value={result.tipo_canto} />
              <Row label="Tirada estimada" value={result.tirada_estimada} />
              <Row label="Medidas físicas" value={`${result.especificaciones.peso_g} · Ø ${result.especificaciones.diametro_mm} · ${result.especificaciones.grosor_mm}`} />
            </>
          ) : kind === "sello" ? (
            <>
              <Row label="Nº Catálogo" value={result.numero_catalogo} />
              <Row label="Color impresión" value={result.color_impresion} />
              <Row label="Dentado / Centrado" value={result.evaluacion_dentado} />
            </>
          ) : (
            <>
              <Row label="Autenticidad" value={result.autenticidad} />
              <Row label="Idioma" value={result.idioma} />
              <Row label="Rareza / Acabado" value={result.rareza} />
            </>
          )}
        </View>

        <View style={styles.specsCard}>
          <Text style={styles.sectionLabel}>DICTAMEN DEL EXPERTO</Text>
          <Text style={styles.explanation}>{result.explicacion}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable onPress={onDiscard} style={styles.btnGhost}>
          <Icon name="camera-retake" size={20} color={colors.onSurface} />
          <Text style={styles.btnGhostText}>NUEVO</Text>
        </Pressable>
        <Pressable onPress={() => setSaveOpen(true)} style={styles.btnPrimary}>
          <Icon name="content-save" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.btnPrimaryText}>GUARDAR EN ÁLBUM</Text>
        </Pressable>
      </View>
      <Modal visible={saveOpen} transparent animationType="slide" onRequestClose={() => setSaveOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Guardar en Coleccionismo</Text>
            <Text style={styles.fieldLabel}>Destino de la pieza</Text>
            <View style={styles.destRow}>
              <Pressable onPress={() => setDestino("coleccion")} style={[styles.destBtn, destino === "coleccion" && styles.destBtnActive]}>
                <Text style={[styles.destText, destino === "coleccion" && styles.destTextActive]}>Mi Colección</Text>
              </Pressable>
              <Pressable onPress={() => setDestino("repetida_venta")} style={[styles.destBtn, destino === "repetida_venta" && styles.destBtnActive]}>
                <Text style={[styles.destText, destino === "repetida_venta" && styles.destTextActive]}>Repetida / Venta</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Álbum / Carpeta</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {defaultAlbums.map((alb) => (
                <Pressable key={alb} onPress={() => setAlbum(alb)} style={[styles.chip, album === alb && styles.chipActive]}>
                  <Text style={[styles.chipText, album === alb && styles.chipTextActive]}>{alb}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput value={album} onChangeText={setAlbum} placeholder="O escribe el nombre del álbum..." placeholderTextColor={colors.muted} style={styles.input} />

            <Text style={styles.fieldLabel}>Coste pagado (€) · 0 si es cambio diario</Text>
            <TextInput value={priceText} onChangeText={(t) => setPriceText(cleanEuro(t))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.muted} style={styles.input} />

            <Text style={styles.fieldLabel}>Procedencia</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {COIN_ORIGINS.map((orig) => (
                <Pressable key={orig} onPress={() => setOrigen(orig)} style={[styles.chip, origen === orig && styles.chipActive]}>
                  <Text style={[styles.chipText, origen === orig && styles.chipTextActive]}>{orig}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {err ? <Text style={styles.errText}>{err}</Text> : null}

            <View style={styles.modalActions}>
              <Pressable onPress={() => setSaveOpen(false)} style={styles.btnGhost}>
                <Text style={styles.btnGhostText}>CANCELAR</Text>
              </Pressable>
              <Pressable onPress={handleConfirmSave} disabled={saving} style={styles.btnPrimary}>
                <Text style={styles.btnPrimaryText}>{saving ? "GUARDANDO..." : "CONFIRMAR"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.specRow}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  scroll: { padding: 16, paddingBottom: 28, gap: 14 },
  headerBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.brandPrimary },
  headerBadgeText: { color: c.brandPrimary, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  title: { color: c.onSurface, fontSize: 22, fontWeight: "900" },
  subtitle: { color: c.muted, fontSize: 14, fontWeight: "700", marginTop: -8 },
  photoRow: { gap: 10, paddingVertical: 4 },
  photoCard: { width: 140, borderRadius: 12, overflow: "hidden", backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.borderStrong },
  photoImg: { width: 140, height: 140 },
  photoLabel: { color: c.onSurface, fontSize: 12, fontWeight: "800", textAlign: "center", paddingVertical: 6 },
  priceCard: { backgroundColor: c.surfaceSecondary, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.borderStrong, gap: 10 },
  sectionLabel: { color: c.muted, fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  gradeRow: { flexDirection: "row", gap: 6 },
  gradeBtn: { flex: 1, paddingVertical: 9, paddingHorizontal: 4, borderRadius: 8, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", backgroundColor: c.surface },
  gradeBtnActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  gradeText: { color: c.onSurface, fontSize: 11, fontWeight: "800" },
  gradeTextActive: { color: c.onBrandPrimary, fontWeight: "900" },
  valBox: { alignItems: "center", paddingTop: 4, gap: 2 },
  valTitle: { color: c.muted, fontSize: 12, fontWeight: "700" },
  valAmount: { color: c.brandPrimary, fontSize: 26, fontWeight: "900" },
  askingNote: { color: c.onSurfaceTertiary, fontSize: 12, fontWeight: "700" },
  specsCard: { backgroundColor: c.surfaceSecondary, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border, gap: 8 },
  specRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  specLabel: { color: c.muted, fontSize: 13, fontWeight: "700" },
  specValue: { color: c.onSurface, fontSize: 13, fontWeight: "800", flexShrink: 1, textAlign: "right" },
  explanation: { color: c.onSurface, fontSize: 14, lineHeight: 20 },
  footer: { flexDirection: "row", gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: c.borderStrong, backgroundColor: c.surface },
  btnGhost: { flex: 0.8, height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: c.borderStrong, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  btnGhostText: { color: c.onSurface, fontSize: 14, fontWeight: "900" },
  btnPrimary: { flex: 1.4, height: 52, borderRadius: 12, backgroundColor: c.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  btnPrimaryText: { color: c.onBrandPrimary, fontSize: 14, fontWeight: "900" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, gap: 10, borderTopWidth: 1, borderColor: c.borderStrong },
  modalTitle: { color: c.onSurface, fontSize: 18, fontWeight: "900" },
  fieldLabel: { color: c.muted, fontSize: 12, fontWeight: "800", marginTop: 2 },
  destRow: { flexDirection: "row", gap: 8 },
  destBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center" },
  destBtnActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  destText: { color: c.onSurface, fontSize: 13, fontWeight: "800" },
  destTextActive: { color: c.onBrandPrimary, fontWeight: "900" },
  chipRow: { gap: 6, paddingVertical: 2 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceSecondary },
  chipActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { color: c.onSurface, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: c.onBrandPrimary, fontWeight: "900" },
  input: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceSecondary, color: c.onSurface, paddingHorizontal: 12, fontSize: 15, fontWeight: "700" },
  errText: { color: c.error, fontSize: 13, fontWeight: "700" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 6 },
}));


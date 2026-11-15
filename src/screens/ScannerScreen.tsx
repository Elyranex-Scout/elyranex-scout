import { Icon } from "@/src/components/Icon";
import { BottomTabBarHeightContext } from "expo-router/tabs";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { File } from "expo-file-system";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useContext, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Platform, Pressable, Text, TextInput, Vibration, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/src/components/AppHeader";
import { BuyModal } from "@/src/components/scanner/BuyModal";
import { PermissionGate } from "@/src/components/scanner/PermissionGate";
import { ResultView } from "@/src/components/scanner/ResultView";
import { analyzeBarcode, analyzePhoto, analyzeText, type Analysis } from "@/src/ai";
import { createItem, newClientId, type Origin } from "@/src/inventory";
import { usesNativeTabs } from "@/src/navigation";
import { compressPhoto } from "@/src/photo";
import { DEFAULT_MIN_PROFIT, loadAiKey, loadMinProfit } from "@/src/settings";
import { makeStyles, useTheme } from "@/src/theme";
import { computeVerdict, type Verdict } from "@/src/verdict";

type Mode = "photo" | "barcode" | "manual";
type Phase = "camera" | "analyzing" | "result" | "error";

const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] as const;

export default function ScannerScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const busy = useRef(false);

  const [focused, setFocused] = useState(true);
  const [mode, setMode] = useState<Mode>("photo");
  const [phase, setPhase] = useState<Phase>("camera");
  const [askingText, setAskingText] = useState("");
  const [manualText, setManualText] = useState("");
  const [minProfit, setMinProfit] = useState(DEFAULT_MIN_PROFIT);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [needsKey, setNeedsKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyError, setBuyError] = useState("");
  const [toast, setToast] = useState("");

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      loadMinProfit().then(setMinProfit);
      return () => setFocused(false);
    }, []),
  );

  const asking = askingText ? Math.min(99999, parseFloat(askingText.replace(",", ".")) || 0) : null;

  const reset = () => {
    setPhotoUri(null);
    setAnalysis(null);
    setVerdict(null);
    setErrorMsg("");
    setNeedsKey(false);
    setPhase("camera");
    busy.current = false;
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  };

  const run = async (job: (key: string) => Promise<Analysis>) => {
    const key = await loadAiKey();
    if (!key) {
      setNeedsKey(true);
      setErrorMsg("Añade tu API Key de Groq en Configuración para analizar artículos.");
      setPhase("error");
      return;
    }
    setPhase("analyzing");
    try {
      const [a, min] = await Promise.all([job(key), loadMinProfit()]);
      setMinProfit(min);
      setAnalysis(a);
      setVerdict(computeVerdict(a, asking, min));
      setPhase("result");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Error al conectar con Groq.");
      setPhase("error");
    }
  };

  const takePhoto = async () => {
    if (busy.current || !cameraRef.current) return;
    busy.current = true;
    try {
      const pic = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.4, shutterSound: false });
      const base64 = (pic.base64 ?? (pic.uri.startsWith("data:") ? pic.uri : "")).replace(/^data:image\/[\w.+-]+;base64,/, "");
      if (Platform.OS !== "web" && pic.uri.startsWith("file:")) {
        try {
          new File(pic.uri).delete();
        } catch {}
      }
      if (!base64) throw new Error("No se pudo capturar la foto.");
      const dataUri = `data:image/jpeg;base64,${base64}`;
      setPhotoUri(dataUri);
      let small = base64;
      try {
        small = await compressPhoto(dataUri);
      } catch {}
      await run((key) => analyzePhoto(key, small));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "No se pudo capturar la foto.");
      setPhase("error");
    }
  };

  const onBarcode = (r: BarcodeScanningResult) => {
    if (busy.current || phase !== "camera") return;
    busy.current = true;
    Vibration.vibrate(60);
    run((key) => analyzeBarcode(key, r.data, r.type));
  };

  const analyzeManual = () => {
    const clean = manualText.trim();
    if (busy.current || !clean) return;
    busy.current = true;
    Keyboard.dismiss();
    run((key) => analyzeText(key, clean));
  };

  const onVerdictShown = () => {
    if (verdict?.light === "green") Vibration.vibrate([0, 180, 120, 180]);
  };

  const onBuy = () => {
    setBuyError("");
    setBuyOpen(true);
  };

  const confirmBuy = async (price: number, origen: Origin) => {
    if (!analysis || !verdict) return;
    setSaving(true);
    setBuyError("");
    try {
      let photo: string | null = null;
      if (photoUri) {
        try {
          photo = await compressPhoto(photoUri);
        } catch {
          photo = null;
        }
      }
      const { offline } = await createItem({
        client_id: newClientId(),
        nombre: analysis.nombre,
        marca: analysis.marca,
        modelo_edicion: analysis.modelo_edicion,
        estado_visual: analysis.estado,
        categoria: analysis.categoria,
        precio_nuevo: analysis.precio_nuevo,
        ver: analysis.ver,
        demanda: analysis.demanda,
        explicacion: analysis.explicacion,
        semaforo: verdict.light,
        precio_pagado: price,
        origen,
        fecha_compra: new Date().toISOString(),
        photo_base64: photo,
      });
      setBuyOpen(false);
      reset();
      setAskingText("");
      setManualText("");
      showToast(offline ? "Sin cobertura: guardado en el móvil, se sincronizará" : "Guardado en Inventario");
    } catch (e) {
      setBuyError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

if (phase === "result" && analysis && verdict) {
    return (
      <View style={styles.root}>
        <View style={{ height: insets.top, backgroundColor: colors.surface }} />
        <ResultView
          analysis={analysis}
          verdict={verdict}
          asking={asking}
          photoUri={photoUri}
          saving={false}
          onDiscard={reset}
          onBuy={onBuy}
          onMount={onVerdictShown}
        />
        <BuyModal
          visible={buyOpen}
          defaultPrice={askingText}
          saving={saving}
          error={buyError}
          onCancel={() => setBuyOpen(false)}
          onConfirm={confirmBuy}
        />
      </View>
    );
  }

  const granted = permission?.granted;

  return (
    <View style={styles.root} testID="scanner-screen">
      <AppHeader section="Escáner" />
      {mode !== "manual" && !permission ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      ) : mode !== "manual" && !granted ? (
        <PermissionGate canAskAgain={permission!.canAskAgain} onRequest={requestPermission} />
      ) : (
        <View style={styles.cameraWrap}>
          {mode !== "manual" ? (
            <>
              {focused ? (
                <CameraView
                  ref={cameraRef}
                  style={styles.camera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
                  onBarcodeScanned={mode === "barcode" && phase === "camera" ? onBarcode : undefined}
                  testID="scanner-camera"
                />
              ) : null}
              <View style={styles.finder} pointerEvents="none">
                <View style={[styles.frame, mode === "barcode" && styles.frameBarcode]}>
                  <View style={[styles.corner, styles.tl]} />
                  <View style={[styles.corner, styles.tr]} />
                  <View style={[styles.corner, styles.bl]} />
                  <View style={[styles.corner, styles.br]} />
                </View>
              </View>
            </>
          ) : (
            <View style={styles.manualBody}>
              <View style={styles.manualCard}>
                <View style={styles.manualHeader}>
                  <Icon name="text-box-search-outline" size={22} color={colors.brandPrimary} />
                  <Text style={styles.manualTitle}>Tasación manual por texto</Text>
                </View>
                <Text style={styles.manualSubtitle}>
                  Escribe marca, modelo, edición y estado del artículo para obtener su ficha de tasación.
                </Text>
                <View style={styles.manualInputWrap}>
                  <TextInput
                    testID="scanner-manual-text-input"
                    value={manualText}
                    onChangeText={setManualText}
                    placeholder='Ej: "Nintendo Switch OLED blanca con caja y cargador"'
                    placeholderTextColor={colors.muted}
                    multiline
                    maxLength={220}
                    style={styles.manualInput}
                  />
                  {manualText ? (
                    <Pressable
                      testID="scanner-manual-text-clear"
                      onPress={() => setManualText("")}
                      style={styles.manualClear}
                      hitSlop={8}
                    >
                      <Icon name="close-circle" size={20} color={colors.muted} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          )}

          <View style={[styles.modeSwitch, { backgroundColor: `${colors.surface}B3` }]} testID="scanner-mode-switch">
            {(
              [
                { id: "photo", label: "Foto IA", icon: "creation" },
                { id: "barcode", label: "Código", icon: "barcode" },
                { id: "manual", label: "Texto", icon: "pencil-outline" },
              ] as const
            ).map((m) => {
              const active = mode === m.id;
              return (
                <Pressable
                  key={m.id}
                  testID={`scanner-mode-${m.id}`}
                  onPress={() => {
                    setMode(m.id);
                    busy.current = false;
                  }}
                  hitSlop={{ top: 6, bottom: 6 }}
                  style={[styles.modeBtn, active && styles.modeBtnActive]}
                >
                  <Icon name={m.icon} size={16} color={active ? colors.onBrandPrimary : colors.onSurface} />
                  <Text style={[styles.modeLabel, active && styles.modeLabelActive]} numberOfLines={1}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <KeyboardStickyView
            offset={{ closed: 0, opened: usesNativeTabs ? insets.bottom : tabBarHeight }}
            style={[styles.panel, { paddingBottom: bottomChrome + 10 }]}
          >
            <View style={styles.rule} testID="scanner-green-light-rule">
              <View style={styles.dot} />
              <Text style={styles.ruleText} numberOfLines={1}>
                Luz Verde desde <Text style={styles.ruleValue}>{minProfit} €</Text> de beneficio
              </Text>
            </View>
            <View style={styles.actionRow}>
              <View style={styles.priceBox}>
                <TextInput
                  testID="scanner-asking-price-input"
                  value={askingText}
                  onChangeText={(t) => setAskingText(t.replace(/[^0-9.,]/g, "").slice(0, 7))}
                  placeholder="¿Cuánto pide?"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  accessibilityLabel="¿Cuánto pide el vendedor? (€)"
                  style={[styles.priceInput, !askingText && styles.priceInputEmpty]}
                />
                {askingText ? (
                  <Pressable testID="scanner-asking-price-clear" onPress={() => setAskingText("")} style={styles.clear} hitSlop={8}>
                    <Icon name="close-circle" size={18} color={colors.muted} />
                  </Pressable>
                ) : null}
                <Text style={styles.priceEuro}>€</Text>
              </View>
              {mode === "photo" ? (
                <Pressable
                  testID="scanner-capture-button"
                  onPress={takePhoto}
                  style={({ pressed }) => [styles.shutter, pressed && styles.pressed]}
                >
                  <Icon name="camera-iris" size={26} color={colors.onBrandPrimary} />
                  <Text style={styles.shutterText} numberOfLines={1}>ANALIZAR</Text>
                </Pressable>
              ) : mode === "manual" ? (
                <Pressable
                  testID="scanner-manual-analyze-button"
                  onPress={analyzeManual}
                  disabled={!manualText.trim()}
                  style={({ pressed }) => [
                    styles.shutter,
                    !manualText.trim() && styles.shutterDisabled,
                    pressed && manualText.trim() && styles.pressed,
                  ]}
                >
                  <Icon name="magnify" size={26} color={colors.onBrandPrimary} />
                  <Text style={styles.shutterText} numberOfLines={1}>ANALIZAR</Text>
                </Pressable>
              ) : (
                <View style={styles.scanningHint} testID="scanner-barcode-hint">
                  <ActivityIndicator color={colors.brandPrimary} />
                  <Text style={styles.scanningText} numberOfLines={1}>Buscando código…</Text>
                </View>
              )}
            </View>
          </KeyboardStickyView>

          {phase === "analyzing" || phase === "error" ? (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.overlay} testID={`scanner-${phase}`}>
              {phase === "analyzing" ? (
                <>
                  <ActivityIndicator color={colors.brandPrimary} size="large" />
                  <Text style={styles.overlayTitle}>Analizando con Groq…</Text>
                  <Text style={styles.overlayText}>Identificando y tasando el artículo</Text>
                </>
              ) : (
                <>
                  <Icon name="alert-octagon" size={56} color={colors.error} />
                  <Text style={styles.overlayTitle}>No se pudo analizar</Text>
                  <Text style={styles.overlayText} testID="scanner-error-message">{errorMsg}</Text>
                  {needsKey ? (
                    <Pressable testID="scanner-open-settings" onPress={() => { reset(); router.push("/settings"); }} style={styles.overlayBtn}>
                      <Text style={styles.overlayBtnText}>IR A CONFIGURACIÓN</Text>
                    </Pressable>
                  ) : null}
                  <Pressable testID="scanner-error-retry" onPress={reset} style={styles.overlayBtnGhost}>
                    <Text style={styles.overlayBtnGhostText}>REINTENTAR</Text>
                  </Pressable>
                </>
              )}
            </Animated.View>
          ) : null}
        </View>
      )}
      {toast ? (
        <View style={[styles.toast, { bottom: bottomChrome + 16 }]}>
          <Icon name="check-circle" size={22} color={colors.onBrandPrimary} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}
const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  cameraWrap: { flex: 1, position: "relative" },
  camera: { flex: 1 },
  finder: {
    position: "absolute",
    top: 72,
    left: 24,
    right: 24,
    bottom: 136,
    alignItems: "center",
    justifyContent: "center",
  },
  frame: { width: "100%", height: "80%", position: "relative" },
  frameBarcode: { height: "42%" },
  corner: { position: "absolute", width: 28, height: 28, borderColor: c.brandPrimary, borderWidth: 4 },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 12 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 12 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 12 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 12 },
  manualBody: { flex: 1, paddingTop: 76, paddingHorizontal: 16, backgroundColor: c.surface },
  manualCard: {
    backgroundColor: c.surfaceContainerLow ?? c.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    padding: 16,
    gap: 10,
  },
  manualHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  manualTitle: { color: c.onSurface, fontSize: 18, fontWeight: "900" },
  manualSubtitle: { color: c.onSurfaceTertiary, fontSize: 14, lineHeight: 20 },
  manualInputWrap: { position: "relative", marginTop: 4 },
  manualInput: {
    minHeight: 112,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.borderStrong,
    backgroundColor: c.surface,
    color: c.onSurface,
    fontSize: 16,
    padding: 12,
    paddingRight: 36,
    textAlignVertical: "top",
  },
  manualClear: { position: "absolute", top: 10, right: 10 },
  modeSwitch: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    height: 40,
    borderRadius: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 4,
  },
  modeBtnActive: { backgroundColor: c.brandPrimary },
  modeLabel: { color: c.onSurface, fontSize: 13, fontWeight: "800" },
  modeLabelActive: { color: c.onBrandPrimary },
  panel: {
    backgroundColor: c.surface,
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: c.borderStrong,
  },
  rule: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.brandPrimary },
  ruleText: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "700" },
  ruleValue: { color: c.brandPrimary, fontWeight: "900" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  priceBox: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.borderStrong,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  priceInput: { flex: 1, color: c.onSurface, fontSize: 22, fontWeight: "900" },
  priceInputEmpty: { fontSize: 16, fontWeight: "700" },
  clear: { marginRight: 4 },
  priceEuro: { color: c.onSurfaceTertiary, fontSize: 20, fontWeight: "900" },
  shutter: {
    flex: 1.15,
    height: 56,
    borderRadius: 12,
    backgroundColor: c.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  shutterDisabled: { opacity: 0.45 },
  shutterText: { color: c.onBrandPrimary, fontSize: 19, fontWeight: "900", letterSpacing: 1 },
  scanningHint: {
    flex: 1.15,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  scanningText: { color: c.brandPrimary, fontSize: 15, fontWeight: "900", flexShrink: 1 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  overlayTitle: { color: c.onSurface, fontSize: 24, fontWeight: "900", textAlign: "center" },
  overlayText: { color: c.onSurfaceTertiary, fontSize: 16, textAlign: "center", lineHeight: 22 },
  overlayBtn: {
    alignSelf: "stretch",
    height: 64,
    borderRadius: 12,
    backgroundColor: c.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  overlayBtnText: { color: c.onBrandPrimary, fontSize: 18, fontWeight: "900" },
  overlayBtnGhost: {
    alignSelf: "stretch",
    height: 64,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  overlayBtnGhostText: { color: c.onSurface, fontSize: 16, fontWeight: "900" },
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    borderRadius: 12,
    backgroundColor: c.brandPrimary,
  },
  toastText: { color: c.onBrandPrimary, fontSize: 17, fontWeight: "900" },
}));

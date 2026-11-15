import { Icon } from "@/src/components/Icon";
import { BottomTabBarHeightContext } from "expo-router/tabs";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { File } from "expo-file-system";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useContext, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, TextInput, Vibration, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/src/components/AppHeader";
import { BuyModal } from "@/src/components/scanner/BuyModal";
import { PermissionGate } from "@/src/components/scanner/PermissionGate";
import { ResultView } from "@/src/components/scanner/ResultView";
import { analyzeBarcode, analyzePhoto, type Analysis } from "@/src/ai";
import { createItem, newClientId, type Origin } from "@/src/inventory";
import { usesNativeTabs } from "@/src/navigation";
import { compressPhoto } from "@/src/photo";
import { DEFAULT_MIN_PROFIT, loadAiKey, loadMinProfit } from "@/src/settings";
import { makeStyles, useTheme } from "@/src/theme";
import { computeVerdict, type Verdict } from "@/src/verdict";

type Mode = "photo" | "barcode";
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
  const [minProfit, setMinProfit] = useState(DEFAULT_MIN_PROFIT);
  // Photo kept ONLY in memory (data URI) while the result is on screen.
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
      // Zero-trash: remove the temp file the camera wrote; keep the image only in RAM.
      if (Platform.OS !== "web" && pic.uri.startsWith("file:")) {
        try {
          new File(pic.uri).delete();
        } catch {}
      }
      if (!base64) throw new Error("No se pudo capturar la foto.");
      const dataUri = `data:image/jpeg;base64,${base64}`;
      setPhotoUri(dataUri);
      // Send a small copy (≤300KB, in memory) so Groq answers fast even with poor coverage.
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
      // Only now: compress the in-memory photo to ≤300KB for storage.
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
      {!permission ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      ) : !granted ? (
        <PermissionGate canAskAgain={permission.canAskAgain} onRequest={requestPermission} />
      ) : (
        <View style={styles.cameraWrap}>
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

          <View style={[styles.modeSwitch, { backgroundColor: `${colors.surface}B3` }]} testID="scanner-mode-switch">
            {(
              [
                { id: "photo", label: "Foto IA", icon: "creation" },
                { id: "barcode", label: "Código de barras", icon: "barcode" },
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
                    <Text style={styles.overlayBtnGhostText}>DESCARTAR / NUEVO ESCANEO</Text>
                  </Pressable>
                </>
              )}
            </Animated.View>
          ) : null}
        </View>
      )}

      {toast ? (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.toast, { top: insets.top + 84 }]} testID="scanner-toast">
          <Icon name="check-circle" size={22} color={colors.onBrandPrimary} />
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const C = 36;
const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1 },
  cameraWrap: { flex: 1, backgroundColor: c.surface, overflow: "hidden" },
  camera: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  modeSwitch: {
    position: "absolute",
    top: 10,
    left: 12,
    right: 12,
    height: 36,
    flexDirection: "row",
    padding: 3,
    gap: 3,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  modeBtn: {
    flex: 1,
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  modeBtnActive: { backgroundColor: c.brandPrimary },
  modeLabel: { color: c.onSurface, fontSize: 13, fontWeight: "900" },
  modeLabelActive: { color: c.onBrandPrimary },
  finder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 52, paddingBottom: 12 },
  frame: { width: "80%", aspectRatio: 0.8, maxHeight: "90%" },
  frameBarcode: { aspectRatio: 1.8 },
  corner: { position: "absolute", width: C, height: C, borderColor: c.brandPrimary },
  tl: { top: 0, left: 0, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 6 },
  tr: { top: 0, right: 0, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 6 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 6 },
  br: { bottom: 0, right: 0, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 6 },
  finderText: {
    color: c.onSurface,
    fontSize: 13,
    fontWeight: "800",
    backgroundColor: c.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  panel: {
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
    backgroundColor: c.surface,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  priceBox: {
    width: 136,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.borderStrong,
    backgroundColor: c.surfaceTertiary,
    paddingHorizontal: 10,
  },
  priceInput: { flex: 1, minWidth: 0, height: "100%", color: c.onSurface, fontSize: 24, fontWeight: "900", padding: 0 },
  priceInputEmpty: { fontSize: 13, fontWeight: "700" },
  priceEuro: { color: c.brandPrimary, fontSize: 20, fontWeight: "900", marginLeft: 4 },
  clear: { width: 24, height: 44, alignItems: "center", justifyContent: "center" },
  rule: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.success },
  ruleText: { color: c.muted, fontSize: 12, fontWeight: "600", flex: 1 },
  ruleValue: { color: c.brandPrimary, fontWeight: "900" },
  shutter: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    backgroundColor: c.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  shutterText: { color: c.onBrandPrimary, fontSize: 20, fontWeight: "900", letterSpacing: 1 },
  scanningHint: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  scanningText: { color: c.brandPrimary, fontSize: 16, fontWeight: "900", flexShrink: 1 },
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

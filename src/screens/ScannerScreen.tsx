import { Icon } from "@/src/components/Icon";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { File } from "expo-file-system";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Image, Keyboard, Platform, Pressable, Text, TextInput, Vibration, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/src/components/AppHeader";
import { BuyModal } from "@/src/components/scanner/BuyModal";
import { CollectibleResultView, type CollectibleAnalysis } from "@/src/components/scanner/CollectibleResultView";
import { PermissionGate } from "@/src/components/scanner/PermissionGate";
import { ResultView } from "@/src/components/scanner/ResultView";
import { analyzeBarcode, analyzeCard, analyzeCoin, analyzePhoto, analyzeStamp, analyzeText, type Analysis } from "@/src/ai";
import { createItem, newClientId, type CollectiblePhotos, type CollectionDest, type Origin } from "@/src/inventory";
import { usesNativeTabs } from "@/src/navigation";
import { compressPhoto } from "@/src/photo";
import { DEFAULT_MIN_PROFIT, loadAiKey, loadMinProfit } from "@/src/settings";
import { makeStyles, useTheme } from "@/src/theme";
import { computeVerdict, type Verdict } from "@/src/verdict";
import { useVertical } from "@/src/vertical";

type Mode = "photo" | "barcode" | "manual";
type CollectibleKind = "moneda" | "sello" | "carta" | "manual";
type Phase = "camera" | "analyzing" | "result" | "error";

const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] as const;
const ZOOM_LEVELS = [0, 0.25, 0.5] as const;
const ZOOM_LABELS = ["1x", "1.5x", "2x"] as const;

export default function ScannerScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [vertical] = useVertical();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const busy = useRef(false);

  const [focused, setFocused] = useState(true);
  const [mode, setMode] = useState<Mode>("photo");
  const [cKind, setCKind] = useState<CollectibleKind>("moneda");
  const [phase, setPhase] = useState<Phase>("camera");
  const [askingText, setAskingText] = useState("");
  const [manualText, setManualText] = useState("");
  const [minProfit, setMinProfit] = useState(DEFAULT_MIN_PROFIT);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const [cPhotos, setCPhotos] = useState<string[]>([]);
  const [cResult, setCResult] = useState<CollectibleAnalysis | null>(null);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [torch, setTorch] = useState(false);
  const [stampHorizontal, setStampHorizontal] = useState(false);

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
      return () => {
        setFocused(false);
        setTorch(false);
      };
    }, []),
  );

  const asking = askingText ? Math.min(99999, parseFloat(askingText.replace(",", ".")) || 0) : null;
  const isCollectible = vertical === "coleccionismo";
  const isManual = isCollectible ? cKind === "manual" : mode === "manual";

  const reset = () => {
    setPhotoUri(null);
    setAnalysis(null);
    setVerdict(null);
    setCPhotos([]);
    setCResult(null);
    setErrorMsg("");
    setNeedsKey(false);
    setPhase("camera");
    busy.current = false;
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  };
  const runReventa = async (job: (key: string) => Promise<Analysis>) => {
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

  const runCollectible = async (job: (key: string) => Promise<CollectibleAnalysis>) => {
    const key = await loadAiKey();
    if (!key) {
      setNeedsKey(true);
      setErrorMsg("Añade tu API Key de Groq en Configuración para analizar piezas.");
      setPhase("error");
      return;
    }
    setTorch(false);
    setPhase("analyzing");
    try {
      const res = await job(key);
      setCResult(res);
      setPhase("result");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Error al analizar la pieza.");
      setPhase("error");
    }
  };

  const grabCompressedPhoto = async (): Promise<string> => {
    if (!cameraRef.current) throw new Error("Cámara no disponible.");
    const pic = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.55, shutterSound: false });
    const base64 = (pic.base64 ?? (pic.uri.startsWith("data:") ? pic.uri : "")).replace(/^data:image\/[\w.+-]+;base64,/, "");
    if (Platform.OS !== "web" && pic.uri.startsWith("file:")) {
      try {
        new File(pic.uri).delete();
      } catch {}
    }
    if (!base64) throw new Error("No se pudo capturar la foto.");
    const dataUri = `data:image/jpeg;base64,${base64}`;
    try {
      const small = await compressPhoto(dataUri);
      return small.startsWith("data:") ? small : `data:image/jpeg;base64,${small}`;
    } catch {
      return dataUri;
    }
  };

  const takePhoto = async () => {
    if (busy.current || !cameraRef.current) return;
    busy.current = true;
    try {
      const dataUri = await grabCompressedPhoto();
      if (!isCollectible) {
        setPhotoUri(dataUri);
        await runReventa((key) => analyzePhoto(key, dataUri));
        return;
      }

      const nextList = [...cPhotos, dataUri];
      setCPhotos(nextList);

      if (cKind === "sello") {
        await runCollectible((key) => analyzeStamp(key, dataUri));
      } else if (cKind === "moneda" && nextList.length >= 3) {
        await runCollectible((key) =>
          analyzeCoin(key, { anverso: nextList.at(0)!, reverso: nextList.at(1)!, canto: nextList.at(2)! })
        );
      } else if (cKind === "carta" && nextList.length >= 2) {
        await runCollectible((key) =>
          analyzeCard(key, { anverso: nextList.at(0)!, reverso: nextList.at(1)! })
        );
      } else {
        busy.current = false;
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "No se pudo capturar la foto.");
      setPhase("error");
    }
  };

  const analyzeCardOnePhoto = async () => {
    if (busy.current || cPhotos.length < 1) return;
    busy.current = true;
    await runCollectible((key) => analyzeCard(key, { anverso: cPhotos.at(0)! }));
  };

  const onBarcode = (r: BarcodeScanningResult) => {
    if (busy.current || phase !== "camera" || isCollectible) return;
    busy.current = true;
    Vibration.vibrate(60);
    runReventa((key) => analyzeBarcode(key, r.data, r.type));
  };

  const analyzeManual = () => {
    const clean = manualText.trim();
    if (busy.current || !clean) return;
    busy.current = true;
    Keyboard.dismiss();
    runReventa((key) => analyzeText(key, clean));
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
      await createItem({
        client_id: newClientId(),
        vertical: "reventa",
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
      showToast("Guardado en Inventario");
    } catch (e) {
      setBuyError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const confirmSaveCollectible = async (payload: {
    grade: string;
    valMin: number;
    valMax: number;
    destino: CollectionDest;
    album: string;
    precioPagado: number;
    origen: Origin;
  }) => {
    if (!cResult || cPhotos.length < 1) return;
    setSaving(true);
    try {
      const photosObj: CollectiblePhotos = {
        anverso: cPhotos.at(0)!,
        reverso: cPhotos.at(1) ?? cPhotos.at(0)!,
        canto: cPhotos.at(2) ?? null,
      };
      const avgVal = Math.round(((payload.valMin + payload.valMax) / 2) * 100) / 100;
      const nombre =
        cResult.tipo_pieza === "moneda"
          ? `${cResult.denominacion} ${cResult.pais} (${cResult.anio})`
          : cResult.tipo_pieza === "sello"
          ? `${cResult.serie_tematica} (${cResult.anio})`
          : `${cResult.nombre_carta} (${cResult.numero_carta})`;
      const marca =
        cResult.tipo_pieza === "moneda"
          ? cResult.pais
          : cResult.tipo_pieza === "sello"
          ? cResult.pais
          : cResult.juego_o_coleccion;
      const modelo =
        cResult.tipo_pieza === "moneda"
          ? `Ceca ${cResult.ceca} · ${cResult.metal}`
          : cResult.tipo_pieza === "sello"
          ? `Cat. ${cResult.numero_catalogo} · Facial ${cResult.valor_facial}`
          : `${cResult.expansion_set} · ${cResult.rareza}`;

      await createItem({
        client_id: newClientId(),
        vertical: "coleccionismo",
        nombre,
        marca,
        modelo_edicion: modelo,
        estado_visual: payload.grade,
        categoria: "Coleccionismo",
        precio_nuevo: payload.valMax,
        ver: avgVal,
        demanda: cResult.rareza.includes("Rar") ? "Alta" : "Media",
        explicacion: cResult.explicacion,
        semaforo: payload.valMax >= payload.precioPagado ? "green" : "yellow",
        precio_pagado: payload.precioPagado,
        origen: payload.origen,
        fecha_compra: new Date().toISOString(),
        photo_base64: null,
        collectible_photos_base64: photosObj,
        collectible_data: {
          tipo_pieza: cResult.tipo_pieza,
          pais: cResult.tipo_pieza === "carta" ? cResult.juego_o_coleccion : cResult.pais,
          denominacion: nombre,
          anio: cResult.tipo_pieza === "carta" ? cResult.expansion_set : cResult.anio,
          ceca: cResult.tipo_pieza === "moneda" ? cResult.ceca : undefined,
          metal_o_color:
            cResult.tipo_pieza === "moneda"
              ? cResult.metal
              : cResult.tipo_pieza === "sello"
              ? cResult.color_impresion
              : cResult.rareza,
          rareza: cResult.rareza,
          tirada_estimada: cResult.tipo_pieza === "moneda" ? cResult.tirada_estimada : "-",
          tipo_canto_o_dentado:
            cResult.tipo_pieza === "moneda"
              ? cResult.tipo_canto
              : cResult.tipo_pieza === "sello"
              ? cResult.evaluacion_dentado
              : cResult.autenticidad,
          peso_g: cResult.tipo_pieza === "moneda" ? cResult.especificaciones.peso_g : undefined,
          diametro_mm: cResult.tipo_pieza === "moneda" ? cResult.especificaciones.diametro_mm : undefined,
          grosor_mm: cResult.tipo_pieza === "moneda" ? cResult.especificaciones.grosor_mm : undefined,
          grado: payload.grade,
          valor_min: payload.valMin,
          valor_max: payload.valMax,
          destino: payload.destino,
          album: payload.album,
        },
      });
      reset();
      setAskingText("");
      showToast(`Guardado en ${payload.album}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };
  if (phase === "result" && isCollectible && cResult && cPhotos.length > 0) {
    return (
      <View style={styles.root}>
        <View style={{ height: insets.top, backgroundColor: colors.surface }} />
        <CollectibleResultView
          result={cResult}
          photos={{ anverso: cPhotos.at(0)!, reverso: cPhotos.at(1) ?? cPhotos.at(0)!, canto: cPhotos.at(2) ?? null }}
          asking={asking}
          saving={saving}
          onDiscard={reset}
          onSave={confirmSaveCollectible}
        />
      </View>
    );
  }

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
          onBuy={() => { setBuyError(""); setBuyOpen(true); }}
          onMount={() => { if (verdict?.light === "green") Vibration.vibrate([0, 180, 120, 180]); }}
        />
        <BuyModal visible={buyOpen} defaultPrice={askingText} saving={saving} error={buyError} onCancel={() => setBuyOpen(false)} onConfirm={confirmBuy} />
      </View>
    );
  }

  const stepPrompt =
    cKind === "moneda"
      ? cPhotos.length === 0
        ? "Paso 1/3 · Encuadra el ANVERSO (Cara)"
        : cPhotos.length === 1
        ? "Paso 2/3 · Gira y encuadra el REVERSO (Cruz)"
        : "Paso 3/3 · Encuadra el CANTO (Borde)"
      : cKind === "sello"
      ? "Encuadra el ANVERSO del sello (dentado visible)"
      : cPhotos.length === 0
      ? "Paso 1/2 · Encuadra el ANVERSO de la carta"
      : "Paso 2/2 · Encuadra el REVERSO (o analiza ya)";

  const shutterLabel = !isCollectible
    ? "ANALIZAR"
    : cKind === "sello"
    ? "ANALIZAR"
    : cKind === "moneda"
    ? `FOTO ${cPhotos.length + 1}/3`
    : `FOTO ${cPhotos.length + 1}/2`;

  const granted = permission?.granted;

  return (
    <View style={styles.root} testID="scanner-screen">
      <AppHeader section={isCollectible ? "Coleccionismo" : "Escáner"} />
      {!isManual && !permission ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : !isManual && !granted ? (
        <PermissionGate canAskAgain={permission!.canAskAgain} onRequest={requestPermission} />
      ) : (
        <View style={styles.cameraWrap}>
          {!isManual ? (
            <>
              {focused ? (
                <CameraView
                  ref={cameraRef}
                  style={styles.camera}
                  facing="back"
                  zoom={ZOOM_LEVELS.at(zoomIdx) ?? 0}
                  enableTorch={torch}
                  barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
                  onBarcodeScanned={!isCollectible && mode === "barcode" && phase === "camera" ? onBarcode : undefined}
                />
              ) : null}

              <View style={styles.finder} pointerEvents="none">
                {isCollectible && cKind === "moneda" && cPhotos.length < 2 ? (
                  <View style={styles.coinCircle}>
                    <View style={styles.coinInnerRing} />
                  </View>
                ) : isCollectible && cKind === "moneda" && cPhotos.length === 2 ? (
                  <View style={styles.coinEdgeGuide} />
                ) : isCollectible && cKind === "sello" ? (
                  <View style={[styles.stampGuide, stampHorizontal && styles.stampGuideHoriz]} />
                ) : isCollectible && cKind === "carta" ? (
                  <View style={styles.cardGuide} />
                ) : (
                  <View style={[styles.frame, !isCollectible && mode === "barcode" && styles.frameBarcode]}>
                    <View style={[styles.corner, styles.tl]} />
                    <View style={[styles.corner, styles.tr]} />
                    <View style={[styles.corner, styles.bl]} />
                    <View style={[styles.corner, styles.br]} />
                  </View>
                )}
              </View>

              <View style={styles.macroTools}>
                <Pressable onPress={() => setZoomIdx((z) => (z + 1) % ZOOM_LEVELS.length)} style={styles.toolBtn}>
                  <Icon name="zoom-in" size={18} color={colors.onSurface} />
                  <Text style={styles.toolText}>{ZOOM_LABELS.at(zoomIdx)}</Text>
                </Pressable>
                <Pressable onPress={() => setTorch((t) => !t)} style={[styles.toolBtn, torch && styles.toolBtnActive]}>
                  <Icon name={torch ? "flashlight" : "flashlight-off"} size={18} color={torch ? colors.onBrandPrimary : colors.onSurface} />
                </Pressable>
                {isCollectible && cKind === "sello" ? (
                  <Pressable onPress={() => setStampHorizontal((h) => !h)} style={styles.toolBtn}>
                    <Icon name="camera-retake" size={18} color={colors.onSurface} />
                    <Text style={styles.toolText}>{stampHorizontal ? "Horiz." : "Vert."}</Text>
                  </Pressable>
                ) : null}
              </View>

              {isCollectible ? (
                <View style={[styles.stepBanner, { backgroundColor: `${colors.surface}D9` }]}>
                  <Text style={styles.stepText}>{stepPrompt}</Text>
                  {cPhotos.length > 0 ? (
                    <View style={styles.thumbRow}>
                      {cPhotos.map((uri, i) => (
                        <Image key={i} source={{ uri }} style={styles.thumbImg} />
                      ))}
                      <Pressable onPress={() => { setCPhotos([]); busy.current = false; }} style={styles.retakeChip}>
                        <Text style={styles.retakeChipText}>Reiniciar</Text>
                      </Pressable>
                      {cKind === "carta" && cPhotos.length === 1 ? (
                        <Pressable onPress={analyzeCardOnePhoto} style={styles.fastAnalyzeChip}>
                          <Text style={styles.fastAnalyzeText}>Analizar ya (1 foto)</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.manualBody}>
              <View style={styles.manualCard}>
                <View style={styles.manualHeader}>
                  <Icon name="text-box-outline" size={22} color={colors.brandPrimary} />
                  <Text style={styles.manualTitle}>
                    {isCollectible ? "Consulta por texto (Moneda / Sello / Carta)" : "Tasación manual por texto"}
                  </Text>
                </View>
                <Text style={styles.manualSubtitle}>
                  {isCollectible
                    ? 'Ej: "Moneda 5 pesetas 1949 estrella 19-51" o "Charizard Base Set 4/102"'
                    : 'Ej: "Nintendo Switch OLED blanca con caja y cargador"'}
                </Text>
                <View style={styles.manualInputWrap}>
                  <TextInput
                    value={manualText}
                    onChangeText={setManualText}
                    placeholder="Escribe los detalles aquí..."
                    placeholderTextColor={colors.muted}
                    multiline
                    maxLength={220}
                    style={styles.manualInput}
                  />
                  {manualText ? (
                    <Pressable onPress={() => setManualText("")} style={styles.manualClear} hitSlop={8}>
                      <Icon name="close-circle" size={20} color={colors.muted} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          )}
          {!isCollectible ? (
            <View style={[styles.modeSwitch, { backgroundColor: `${colors.surface}B3` }]}>
              {(
                [
                  { id: "photo", label: "Foto IA", icon: "creation" },
                  { id: "barcode", label: "Código", icon: "barcode" },
                  { id: "manual", label: "Texto", icon: "pencil-outline" },
                ] as const
              ).map((m) => {
                const active = mode === m.id;
                return (
                  <Pressable key={m.id} onPress={() => { setMode(m.id); busy.current = false; }} style={[styles.modeBtn, active && styles.modeBtnActive]}>
                    <Icon name={m.icon} size={16} color={active ? colors.onBrandPrimary : colors.onSurface} />
                    <Text style={[styles.modeLabel, active && styles.modeLabelActive]} numberOfLines={1}>{m.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={[styles.modeSwitch, { backgroundColor: `${colors.surface}CC` }]}>
              {(
                [
                  { id: "moneda", label: "Moneda", icon: "coins" },
                  { id: "sello", label: "Sello", icon: "stamp" },
                  { id: "carta", label: "Carta", icon: "layers" },
                  { id: "manual", label: "Texto", icon: "pencil-outline" },
                ] as const
              ).map((k) => {
                const active = cKind === k.id;
                return (
                  <Pressable key={k.id} onPress={() => { setCKind(k.id); setCPhotos([]); busy.current = false; }} style={[styles.modeBtn, active && styles.modeBtnActive]}>
                    <Icon name={k.icon} size={15} color={active ? colors.onBrandPrimary : colors.onSurface} />
                    <Text style={[styles.modeLabel, active && styles.modeLabelActive]} numberOfLines={1}>{k.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={[styles.panel, { paddingBottom: bottomChrome + 10 }]}>
            {!isCollectible ? (
              <View style={styles.rule}>
                <View style={styles.dot} />
                <Text style={styles.ruleText} numberOfLines={1}>
                  Luz Verde desde <Text style={styles.ruleValue}>{minProfit} €</Text> de beneficio
                </Text>
              </View>
            ) : null}
            <View style={styles.actionRow}>
              <View style={styles.priceBox}>
                <TextInput
                  value={askingText}
                  onChangeText={(t) => setAskingText(t.replace(/[^0-9.,]/g, "").slice(0, 7))}
                  placeholder="¿Cuánto pide?"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  style={[styles.priceInput, !askingText && styles.priceInputEmpty]}
                />
                {askingText ? (
                  <Pressable onPress={() => setAskingText("")} style={styles.clear} hitSlop={8}>
                    <Icon name="close-circle" size={18} color={colors.muted} />
                  </Pressable>
                ) : null}
                <Text style={styles.priceEuro}>€</Text>
              </View>
              {isManual ? (
                <Pressable onPress={analyzeManual} disabled={!manualText.trim()} style={({ pressed }) => [styles.shutter, !manualText.trim() && styles.shutterDisabled, pressed && manualText.trim() && styles.pressed]}>
                  <Icon name="magnify" size={22} color={colors.onBrandPrimary} />
                  <Text style={styles.shutterText} numberOfLines={1}>ANALIZAR</Text>
                </Pressable>
              ) : isCollectible || mode === "photo" ? (
                <Pressable onPress={takePhoto} style={({ pressed }) => [styles.shutter, pressed && styles.pressed]}>
                  <Icon name="camera-iris" size={24} color={colors.onBrandPrimary} />
                  <Text style={styles.shutterText} numberOfLines={1}>{shutterLabel}</Text>
                </Pressable>
              ) : (
                <View style={styles.scanningHint}>
                  <ActivityIndicator color={colors.brandPrimary} />
                  <Text style={styles.scanningText} numberOfLines={1}>Buscando código…</Text>
                </View>
              )}
            </View>
          </View>

          {phase === "analyzing" || phase === "error" ? (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.overlay}>
              {phase === "analyzing" ? (
                <>
                  <ActivityIndicator color={colors.brandPrimary} size="large" />
                  <Text style={styles.overlayTitle}>Analizando con Groq…</Text>
                  <Text style={styles.overlayText}>{isCollectible ? "Examinando detalles y catálogo" : "Identificando y tasando el artículo"}</Text>
                </>
              ) : (
                <>
                  <Icon name="alert-octagon" size={56} color={colors.error} />
                  <Text style={styles.overlayTitle}>No se pudo analizar</Text>
                  <Text style={styles.overlayText}>{errorMsg}</Text>
                  {needsKey ? (
                    <Pressable onPress={() => { reset(); router.push("/settings"); }} style={styles.overlayBtn}>
                      <Text style={styles.overlayBtnText}>IR A CONFIGURACIÓN</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={reset} style={styles.overlayBtnGhost}>
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
  finder: { position: "absolute", top: 68, left: 24, right: 24, bottom: 136, alignItems: "center", justifyContent: "center" },
  frame: { width: "100%", height: "80%", position: "relative" },
  frameBarcode: { height: "42%" },
  coinCircle: { width: 230, height: 230, borderRadius: 115, borderWidth: 3, borderColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  coinInnerRing: { width: 204, height: 204, borderRadius: 102, borderWidth: 1, borderColor: "rgba(255,255,255,0.45)", borderStyle: "dashed" },
  coinEdgeGuide: { width: "86%", height: 58, borderRadius: 12, borderWidth: 3, borderColor: c.brandPrimary, backgroundColor: "rgba(0,0,0,0.2)" },
  stampGuide: { width: 190, height: 240, borderRadius: 8, borderWidth: 3, borderColor: c.brandPrimary, backgroundColor: "rgba(0,0,0,0.25)" },
  stampGuideHoriz: { width: 250, height: 185 },
  cardGuide: { width: 215, height: 300, borderRadius: 14, borderWidth: 3, borderColor: c.brandPrimary },
  macroTools: { position: "absolute", right: 12, top: 68, gap: 8 },
  toolBtn: { height: 40, paddingHorizontal: 10, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.65)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  toolBtnActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  toolText: { color: "#FFF", fontSize: 12, fontWeight: "900" },
  stepBanner: { position: "absolute", bottom: 10, left: 12, right: 12, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: c.borderStrong, gap: 6 },
  stepText: { color: c.onSurface, fontSize: 13, fontWeight: "900", textAlign: "center" },
  thumbRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" },
  thumbImg: { width: 38, height: 38, borderRadius: 6, borderWidth: 1, borderColor: c.brandPrimary },
  retakeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.borderStrong },
  retakeChipText: { color: c.onSurface, fontSize: 11, fontWeight: "800" },
  fastAnalyzeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: c.brandPrimary },
  fastAnalyzeText: { color: c.onBrandPrimary, fontSize: 11, fontWeight: "900" },
  corner: { position: "absolute", width: 28, height: 28, borderColor: c.brandPrimary, borderWidth: 4 },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 12 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 12 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 12 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 12 },
  manualBody: { flex: 1, paddingTop: 76, paddingHorizontal: 16, backgroundColor: c.surface },
  manualCard: { backgroundColor: c.surfaceContainerLow ?? c.surface, borderRadius: 16, borderWidth: 1.5, borderColor: c.borderStrong, padding: 16, gap: 10 },
  manualHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  manualTitle: { color: c.onSurface, fontSize: 17, fontWeight: "900", flex: 1 },
  manualSubtitle: { color: c.onSurfaceTertiary, fontSize: 13, lineHeight: 19 },
  manualInputWrap: { position: "relative", marginTop: 4 },
  manualInput: { minHeight: 112, borderRadius: 12, borderWidth: 2, borderColor: c.borderStrong, backgroundColor: c.surface, color: c.onSurface, fontSize: 16, padding: 12, paddingRight: 36, textAlignVertical: "top" },
  manualClear: { position: "absolute", top: 10, right: 10 },
  modeSwitch: { position: "absolute", top: 12, left: 12, right: 12, flexDirection: "row", borderRadius: 12, padding: 4, gap: 4 },
  modeBtn: { flex: 1, height: 40, borderRadius: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 4 },
  modeBtnActive: { backgroundColor: c.brandPrimary },
  modeLabel: { color: c.onSurface, fontSize: 12, fontWeight: "800" },
  modeLabelActive: { color: c.onBrandPrimary },
  panel: { backgroundColor: c.surface, paddingHorizontal: 14, paddingTop: 10, gap: 8, borderTopWidth: 1, borderTopColor: c.borderStrong },
  rule: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.brandPrimary },
  ruleText: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "700" },
  ruleValue: { color: c.brandPrimary, fontWeight: "900" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  priceBox: { flex: 1, height: 56, borderRadius: 12, borderWidth: 2, borderColor: c.borderStrong, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
  priceInput: { flex: 1, color: c.onSurface, fontSize: 22, fontWeight: "900" },
  priceInputEmpty: { fontSize: 16, fontWeight: "700" },
  clear: { marginRight: 4 },
  priceEuro: { color: c.onSurfaceTertiary, fontSize: 20, fontWeight: "900" },
  shutter: { flex: 1.15, height: 56, borderRadius: 12, backgroundColor: c.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 8 },
  shutterDisabled: { opacity: 0.45 },
  shutterText: { color: c.onBrandPrimary, fontSize: 16, fontWeight: "900", letterSpacing: 0.5 },
  scanningHint: { flex: 1.15, height: 56, borderRadius: 12, borderWidth: 2, borderColor: c.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  scanningText: { color: c.brandPrimary, fontSize: 15, fontWeight: "900", flexShrink: 1 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  overlayTitle: { color: c.onSurface, fontSize: 24, fontWeight: "900", textAlign: "center" },
  overlayText: { color: c.onSurfaceTertiary, fontSize: 16, textAlign: "center", lineHeight: 22 },
  overlayBtn: { alignSelf: "stretch", height: 64, borderRadius: 12, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", marginTop: 8 },
  overlayBtnText: { color: c.onBrandPrimary, fontSize: 18, fontWeight: "900" },
  overlayBtnGhost: { alignSelf: "stretch", height: 64, borderRadius: 12, borderWidth: 2, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  overlayBtnGhostText: { color: c.onSurface, fontSize: 16, fontWeight: "900" },
  toast: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 10, padding: 16, borderRadius: 12, backgroundColor: c.brandPrimary },
  toastText: { color: c.onBrandPrimary, fontSize: 17, fontWeight: "900" },
}));

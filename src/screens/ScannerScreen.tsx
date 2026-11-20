import { Icon } from "@/src/components/Icon";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { File } from "expo-file-system";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { compressPhoto, cropCollectibleHD, pickGalleryImage, straightenCoinByClock } from "@/src/photo";
import { DEFAULT_MIN_PROFIT, loadAiKey, loadMinProfit } from "@/src/settings";
import { makeStyles, useTheme } from "@/src/theme";
import { computeVerdict, type Verdict } from "@/src/verdict";
import { useVertical } from "@/src/vertical";

type Mode = "photo" | "barcode" | "manual";
type CollectibleKind = "moneda" | "sello" | "carta" | "manual";
type Phase = "camera" | "analyzing" | "result" | "error";
type FrameQuality = { ready: boolean; hint: string };

const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] as const;
const ZOOM_SCALES = [1.2, 1.45, 1.7, 2.0] as const;
const ZOOM_LABELS = ["1,2x", "1,4x", "1,7x", "2x"] as const;

const REF_POINTS = [
  { x: "26%", y: "28%" }, { x: "52%", y: "20%" }, { x: "76%", y: "32%" },
  { x: "22%", y: "55%" }, { x: "50%", y: "50%" }, { x: "78%", y: "58%" },
  { x: "30%", y: "78%" }, { x: "66%", y: "76%" },
];
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
  const [zoomIdx, setZoomIdx] = useState(1);
  const [softLight, setSoftLight] = useState(false);
  const [stampHorizontal, setStampHorizontal] = useState(false);
  const [focusPulse, setFocusPulse] = useState(false);
  const [afOn, setAfOn] = useState(true);
  const [frameQuality, setFrameQuality] = useState<FrameQuality>({
    ready: false,
    hint: "Haz coincidir la moneda dentro del círculo",
  });
  const [scanStep, setScanStep] = useState(0);
  const [autoSnap, setAutoSnap] = useState(true);
  const greenHoldUntil = useRef(0);
  const greenStreak = useRef(0);
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
      };
    }, []),
  );

  const asking = askingText ? Math.min(99999, parseFloat(askingText.replace(",", ".")) || 0) : null;
  const isCollectible = vertical === "coleccionismo";
  const isManual = isCollectible ? cKind === "manual" : mode === "manual";
  useEffect(() => {
    if (phase !== "analyzing") return;
    const t = setInterval(() => setScanStep((s) => (s + 1) % REF_POINTS.length), 260);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (!isCollectible || isManual || phase !== "camera" || !focused) return;
    if (Platform.OS !== "web" || typeof document === "undefined") {
      setFrameQuality({ ready: true, hint: "Centrada y lista para capturar" });
      return;
    }

    greenHoldUntil.current = 0;
    greenStreak.current = 0;

    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const timer = setInterval(() => {
      if (busy.current) return;
      const video = document.querySelector("video") as HTMLVideoElement | null;
      if (!video || video.readyState < 2 || !ctx) return;

      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 640;
      const side = Math.round(Math.min(vw, vh) * 0.56);
      const sx = Math.max(0, Math.round((vw - side) / 2));
      const sy = Math.max(0, Math.round((vh - side) / 2));

      ctx.drawImage(video, sx, sy, side, side, 0, 0, 96, 96);
      const img = ctx.getImageData(0, 0, 96, 96).data;

      let sharpTotal = 0;
      let sharpCount = 0;
      let bgLuma = 0;
      let bgCount = 0;
      const qLuma = new Array(4).fill(0);
      const qCount = new Array(4).fill(0);

      for (let y = 2; y < 94; y += 2) {
        for (let x = 2; x < 94; x += 2) {
          const i = (y * 96 + x) * 4;
          const luma = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
          const dx = x - 48;
          const dy = y - 48;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 32) {
            const iR = (y * 96 + (x + 2)) * 4;
            const iD = ((y + 2) * 96 + x) * 4;
            const lR = 0.299 * img[iR] + 0.587 * img[iR + 1] + 0.114 * img[iR + 2];
            const lD = 0.299 * img[iD] + 0.587 * img[iD + 1] + 0.114 * img[iD + 2];
            sharpTotal += Math.abs(luma - lR) + Math.abs(luma - lD);
            sharpCount++;

            if (dist >= 10) {
              const q = dy < 0 ? (dx < 0 ? 0 : 1) : (dx < 0 ? 2 : 3);
              qLuma[q] += luma;
              qCount[q]++;
            }
          } else if (dist >= 40 && dist <= 47) {
            bgLuma += luma;
            bgCount++;
          }
        }
      }

      const avgSharp = sharpCount ? sharpTotal / sharpCount : 0;
      const avgBg = bgCount ? bgLuma / bgCount : 0;
      const now = Date.now();

            if (cKind === "moneda" && cPhotos.length === 2) {
        const edgeOk = avgSharp >= 8.5 || now < greenHoldUntil.current;
        if (avgSharp >= 8.5) greenHoldUntil.current = now + 1200;
        setFrameQuality({
          ready: edgeOk,
          hint: edgeOk
            ? "¡Canto enfocado! Pulsa el botón de abajo para capturar"
            : "Sujeta la moneda de canto dentro del rectángulo",
        });
        return;
      }

      const diffs = [
        qCount.at(0) ? Math.abs(qLuma.at(0) / qCount.at(0) - avgBg) : 0,
        qCount.at(1) ? Math.abs(qLuma.at(1) / qCount.at(1) - avgBg) : 0,
        qCount.at(2) ? Math.abs(qLuma.at(2) / qCount.at(2) - avgBg) : 0,
        qCount.at(3) ? Math.abs(qLuma.at(3) / qCount.at(3) - avgBg) : 0,
      ];
      const activeQuadrants = diffs.filter((d) => d >= 11).length;
      const isGoodNow = activeQuadrants >= 3 && avgSharp >= 9.0;

      if (isGoodNow) {
        greenHoldUntil.current = now + 1500;
        greenStreak.current += 1;
      } else if (now >= greenHoldUntil.current) {
        greenStreak.current = 0;
      }

      const stabilized = isGoodNow || now < greenHoldUntil.current;

      if (stabilized) {
        setFrameQuality({
          ready: true,
          hint: autoSnap
            ? "Enfocada · Capturando automáticamente..."
            : "¡Enfocada! Pulsa el botón de abajo para capturar",
        });
                if (autoSnap && greenStreak.current >= 4) {
          greenStreak.current = 0;
          takePhoto(true);
        }
      } else if (activeQuadrants < 2 && avgSharp < 10) {
        setFrameQuality({ ready: false, hint: "Haz coincidir la moneda dentro del círculo" });
      } else if (activeQuadrants < 3) {
        setFrameQuality({ ready: false, hint: "Centra la pieza en el aro" });
      } else {
        setFrameQuality({ ready: false, hint: "Enfocando · Mantén firme 1 segundo" });
      }
    }, 280);

    return () => clearInterval(timer);
  }, [isCollectible, isManual, phase, focused, cKind, cPhotos.length, autoSnap]);

    const triggerRefocus = () => {
    if (Platform.OS !== "web") Vibration.vibrate(25);
    setFocusPulse(true);
    setAfOn(false);
    setTimeout(() => setAfOn(true), 120);
    setTimeout(() => setFocusPulse(false), 650);
    if (Platform.OS === "web" && typeof document !== "undefined") {
      try {
        const video = document.querySelector("video") as HTMLVideoElement | null;
        const stream = video?.srcObject as MediaStream | null;
        const track = stream?.getVideoTracks?.().at(0);
        if (track && typeof track.applyConstraints === "function") {
          track.applyConstraints({ advanced: [{ focusMode: "single-shot" } as any] })
            .then(() =>
              setTimeout(() => {
                track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }).catch(() => {});
              }, 350)
            )
            .catch(() => {
              track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }).catch(() => {});
            });
        }
      } catch {}
    }
  };

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

  const runCollectible = async (
    photosToAnalyze: string[],
    job: (key: string) => Promise<CollectibleAnalysis>
  ) => {
    const key = await loadAiKey();
    if (!key) {
      setNeedsKey(true);
      setErrorMsg("Añade tu API Key de Groq en Configuración para analizar piezas.");
      setPhase("error");
      return;
    }
    setPhase("analyzing");
    try {
      const res = await job(key);
      if (res.tipo_pieza === "moneda" && photosToAnalyze.length >= 2) {
        const straightAnv = await straightenCoinByClock(photosToAnalyze.at(0)!, res.rotacion_anverso ?? 12);
        const straightRev = await straightenCoinByClock(photosToAnalyze.at(1)!, res.rotacion_reverso ?? 12);
        const updated = [straightAnv, straightRev, ...(photosToAnalyze.at(2) ? [photosToAnalyze.at(2)!] : [])];
        setCPhotos(updated);
      }
      setCResult(res);
      setPhase("result");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Error al analizar la pieza.");
      setPhase("error");
    }
  };
   useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const scale = ZOOM_SCALES.at(zoomIdx) ?? 1;
    try {
      const video = document.querySelector("video") as HTMLVideoElement | null;
      const stream = video?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks?.().at(0);
      if (track && typeof track.applyConstraints === "function") {
        const caps = typeof track.getCapabilities === "function" ? (track.getCapabilities() as any) : null;
        const adv: any[] = [{ focusMode: "continuous" }];
        if (caps?.zoom) {
          const clamped = Math.min(caps.zoom.max, Math.max(caps.zoom.min, scale));
          adv.push({ zoom: clamped });
        }
        track.applyConstraints({
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: adv,
        }).catch(() => {});
      }
    } catch {}
  }, [zoomIdx, phase]);

  const capturePhoto = async (cropMode?: "square" | "edge"): Promise<string> => {
    if (!cameraRef.current) throw new Error("Cámara no disponible.");
    const pic = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.85, shutterSound: false });
    const base64 = (pic.base64 ?? (pic.uri.startsWith("data:") ? pic.uri : "")).replace(/^data:image\/[\w.+-]+;base64,/, "");
    if (Platform.OS !== "web" && pic.uri.startsWith("file:")) {
      try {
        new File(pic.uri).delete();
      } catch {}
    }
    if (!base64) throw new Error("No se pudo capturar la foto.");
    const dataUri = `data:image/jpeg;base64,${base64}`;
    if (cropMode) {
      return await cropCollectibleHD(dataUri, cropMode, ZOOM_SCALES.at(zoomIdx) ?? 1);
    }
    try {
      const small = await compressPhoto(dataUri);
      return small.startsWith("data:") ? small : `data:image/jpeg;base64,${small}`;
    } catch {
      return dataUri;
    }
  };

    const takePhoto = async (force = false) => {
    if (busy.current || !cameraRef.current) return;
    if (isCollectible && !force && !frameQuality.ready) {
      triggerRefocus();
      showToast(frameQuality.hint);
      return;
    }
    busy.current = true;

    try {
      if (!isCollectible) {
        const dataUri = await capturePhoto();
        setPhotoUri(dataUri);
        await runReventa((key) => analyzePhoto(key, dataUri));
        return;
      }

      const isEdgeStep = cKind === "moneda" && cPhotos.length === 2;
      const croppedUri = await capturePhoto(isEdgeStep ? "edge" : "square");
      const nextList = [...cPhotos, croppedUri];
            setCPhotos(nextList);
      greenStreak.current = 0;
      greenHoldUntil.current = 0;
      setAutoSnap(false);

      if (cKind === "sello") {
        await runCollectible(nextList, (key) => analyzeStamp(key, croppedUri));
      } else if (cKind === "moneda" && nextList.length >= 3) {
        await runCollectible(nextList, (key) =>
          analyzeCoin(key, { anverso: nextList.at(0)!, reverso: nextList.at(1)!, canto: nextList.at(2)! })
        );
      } else if (cKind === "carta" && nextList.length >= 2) {
        await runCollectible(nextList, (key) =>
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
    await runCollectible(cPhotos, (key) => analyzeCard(key, { anverso: cPhotos.at(0)! }));
  };

      const pickFromGallery = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const pickedUri = await pickGalleryImage(isCollectible);
      if (!pickedUri) {
        busy.current = false;
        return;
      }
      if (!isCollectible) {
        setPhotoUri(pickedUri);
        await runReventa((key) => analyzePhoto(key, pickedUri));
        return;
      }

      const nextList = [...cPhotos, pickedUri];
      setCPhotos(nextList);

      if (cKind === "sello") {
        await runCollectible(nextList, (key) => analyzeStamp(key, pickedUri));
      } else if (cKind === "moneda" && nextList.length >= 3) {
        await runCollectible(nextList, (key) =>
          analyzeCoin(key, { anverso: nextList.at(0)!, reverso: nextList.at(1)!, canto: nextList.at(2)! })
        );
      } else if (cKind === "carta" && nextList.length >= 2) {
        await runCollectible(nextList, (key) =>
          analyzeCard(key, { anverso: nextList.at(0)!, reverso: nextList.at(1)! })
        );
      } else {
        busy.current = false;
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "No se pudo cargar la imagen.");
      setPhase("error");
    }
  };

      const pickNativeCamera = async () => {
    if (busy.current) return;
    if (Platform.OS !== "web" || typeof document === "undefined") {
      await takePhoto();
      return;
    }

    busy.current = true;
    try {
      const pickedUri = await new Promise<string | null>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.setAttribute("capture", "environment");
        input.onchange = async () => {
          const file = input.files?.at(0);
          if (!file) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onload = async () => {
            const rawDataUrl = typeof reader.result === "string" ? reader.result : null;
            if (!rawDataUrl) {
              resolve(null);
              return;
            }
            try {
              if (isCollectible) {
                const isEdgeStep = cKind === "moneda" && cPhotos.length === 2;
                const cropped = await cropCollectibleHD(rawDataUrl, isEdgeStep ? "edge" : "square", 1);
                resolve(cropped);
              } else {
                const small = await compressPhoto(rawDataUrl);
                resolve(small.startsWith("data:") ? small : `data:image/jpeg;base64,${small}`);
              }
            } catch {
              resolve(rawDataUrl);
            }
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        };

        input.oncancel = () => resolve(null);
        input.click();
      });

      if (!pickedUri) {
        busy.current = false;
        return;
      }

      if (!isCollectible) {
        setPhotoUri(pickedUri);
        await runReventa((key) => analyzePhoto(key, pickedUri));
        return;
      }

      const nextList = [...cPhotos, pickedUri];
      setCPhotos(nextList);

      if (cKind === "sello") {
        await runCollectible(nextList, (key) => analyzeStamp(key, pickedUri));
      } else if (cKind === "moneda" && nextList.length >= 3) {
        await runCollectible(nextList, (key) =>
          analyzeCoin(key, { anverso: nextList.at(0)!, reverso: nextList.at(1)!, canto: nextList.at(2)! })
        );
      } else if (cKind === "carta" && nextList.length >= 2) {
        await runCollectible(nextList, (key) =>
          analyzeCard(key, { anverso: nextList.at(0)!, reverso: nextList.at(1)! })
        );
      } else {
        busy.current = false;
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "No se pudo abrir la cámara nativa.");
      setPhase("error");
    }
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
          onMount={() => { if (verdict?.light === "green") Vibration.vibrate(); }}
        />
        <BuyModal visible={buyOpen} defaultPrice={askingText} saving={saving} error={buyError} onCancel={() => setBuyOpen(false)} onConfirm={confirmBuy} />
      </View>
    );
  }
    const guideHeadline =
    cKind === "moneda"
      ? cPhotos.length === 0
        ? "1/3 · ANVERSO (Cara)"
        : cPhotos.length === 1
        ? "2/3 · REVERSO (Cruz)"
        : "3/3 · Sujeta la moneda de canto dentro del rectángulo"
      : cKind === "sello"
      ? "Encuadra el ANVERSO del sello"
      : cPhotos.length === 0
      ? "1/2 · ANVERSO de la carta"
      : "2/2 · REVERSO de la carta";

    const shutterLabel = !isCollectible
    ? "ANALIZAR"
    : cKind === "sello"
    ? "ANALIZAR"
    : cKind === "moneda"
    ? `${cPhotos.length + 1}/3`
    : `${cPhotos.length + 1}/2`;

  const ringColor = !isCollectible || frameQuality.ready ? "#22C55E" : "#EF4444";
  const shutterLocked = isCollectible && !isManual && !frameQuality.ready;
  const granted = permission?.granted;

  return (
    <View style={styles.root} testID="scanner-screen">
      <AppHeader section={isCollectible ? "Coleccionismo" : "Escáner"} />

      <View style={styles.topBar}>
        {!isCollectible ? (
          <View style={styles.modeSwitch}>
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
                  <Icon name={m.icon} size={15} color={active ? colors.onBrandPrimary : colors.onSurface} />
                  <Text style={[styles.modeLabel, active && styles.modeLabelActive]} numberOfLines={1}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.modeSwitch}>
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
                  <Icon name={k.icon} size={14} color={active ? colors.onBrandPrimary : colors.onSurface} />
                  <Text style={[styles.modeLabel, active && styles.modeLabelActive]} numberOfLines={1}>{k.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {isCollectible && !isManual ? (
          <View style={[styles.coachBanner, { borderColor: ringColor }]}>
            <Text style={styles.coachTitle}>{guideHeadline}</Text>
            <Text style={[styles.coachSub, { color: ringColor }]}>{frameQuality.hint}</Text>
          </View>
        ) : null}
      </View>

      {!isManual && !permission ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : !isManual && !granted ? (
        <PermissionGate canAskAgain={permission!.canAskAgain} onRequest={requestPermission} />
      ) : (
        <View style={styles.cameraWrap}>
          {!isManual ? (
            <>
              {focused ? (
                                <View style={[styles.camera, { transform: [{ scale: ZOOM_SCALES.at(zoomIdx) ?? 1 }] }]}>
                  <CameraView
                    ref={cameraRef}
                    style={styles.camera}
                    facing="back"
                    zoom={0}
                    barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
                    onBarcodeScanned={!isCollectible && mode === "barcode" && phase === "camera" ? onBarcode : undefined}
                  />
                </View>

              ) : null}

              <Pressable onPress={triggerRefocus} style={styles.finder}>
                {isCollectible && cKind === "moneda" && cPhotos.length < 2 ? (
                  <View style={[styles.coinCircle, { borderColor: ringColor }, focusPulse && styles.focusFlash]}>
                    <View style={[styles.coinInnerRing, { borderColor: ringColor }]} />
                    <View style={[styles.crossH, { backgroundColor: ringColor }]} />
                    <View style={[styles.crossV, { backgroundColor: ringColor }]} />
                  </View>
                ) : isCollectible && cKind === "moneda" && cPhotos.length === 2 ? (
                  <View style={[styles.coinEdgeGuide, { borderColor: ringColor }, focusPulse && styles.focusFlash]} />
                ) : isCollectible && cKind === "sello" ? (
                  <View style={[styles.stampGuide, { borderColor: ringColor }, stampHorizontal && styles.stampGuideHoriz, focusPulse && styles.focusFlash]} />
                ) : isCollectible && cKind === "carta" ? (
                  <View style={[styles.cardGuide, { borderColor: ringColor }, focusPulse && styles.focusFlash]} />
                ) : (
                  <View style={[styles.frame, !isCollectible && mode === "barcode" && styles.frameBarcode]}>
                    <View style={[styles.corner, styles.tl]} />
                    <View style={[styles.corner, styles.tr]} />
                    <View style={[styles.corner, styles.bl]} />
                    <View style={[styles.corner, styles.br]} />
                  </View>
                )}
              </Pressable>

                            <>
                {isCollectible ? (
                  <Pressable onPress={() => setAutoSnap((a) => !a)} style={[styles.cornerTool, styles.cornerTopLeft, autoSnap && styles.toolBtnActive]}>
                    <Icon name="camera-iris" size={16} color={autoSnap ? colors.onBrandPrimary : "#FFF"} />
                    <Text style={[styles.toolText, autoSnap && { color: colors.onBrandPrimary }]}>Auto</Text>
                  </Pressable>
                ) : null}

                <Pressable onPress={() => setZoomIdx((z) => (z + 1) % ZOOM_SCALES.length)} style={[styles.cornerTool, styles.cornerTopRight]}>
                  <Icon name="magnify" size={16} color="#FFF" />
                  <Text style={[styles.toolText]}>{ZOOM_LABELS.at(zoomIdx)}</Text>
                </Pressable>

                <Pressable onPress={() => setSoftLight((s) => !s)} style={[styles.cornerTool, styles.cornerBottomRight, softLight && styles.toolBtnActive]}>
                  <Icon name="flash" size={17} color={softLight ? colors.onBrandPrimary : "#FFF"} />
                </Pressable>

                {isCollectible && cKind === "sello" ? (
                  <Pressable onPress={() => setStampHorizontal((h) => !h)} style={[styles.cornerTool, styles.cornerBottomLeft]}>
                    <Icon name="camera-retake" size={16} color="#FFF" />
                    <Text style={styles.toolText}>{stampHorizontal ? "Hor." : "Ver."}</Text>
                  </Pressable>
                ) : null}
              </>

              {isCollectible && cKind !== "sello" ? (
                <View style={styles.slotStrip}>
                  {(cKind === "moneda" ? ["Anverso", "Reverso", "Canto"] : ["Anverso", "Reverso"]).map((lbl, idx) => {
                    const uri = cPhotos.at(idx);
                    const activeSlot = cPhotos.length === idx;
                    return (
                      <View key={lbl} style={[styles.slotBox, activeSlot && styles.slotBoxActive]}>
                        {uri ? <Image source={{ uri }} style={styles.slotImg} /> : <Text style={styles.slotNum}>{idx + 1}</Text>}
                        <Text style={styles.slotLabel}>{lbl}</Text>
                      </View>
                    );
                  })}
                  {cPhotos.length > 0 ? (
                    <Pressable onPress={() => { setCPhotos([]); busy.current = false; }} style={styles.slotReset}>
                      <Icon name="close" size={16} color="#FFF" />
                    </Pressable>
                  ) : null}
                  {cKind === "carta" && cPhotos.length === 1 ? (
                    <Pressable onPress={analyzeCardOnePhoto} style={styles.fastAnalyzeChip}>
                      <Text style={styles.fastAnalyzeText}>Analizar ya</Text>
                    </Pressable>
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
                    ? 'Ej: "Moneda 5 céntimos euro España 2025 M" o "Charizard Base Set 4/102"'
                    : 'Ej: "Nintendo Switch OLED blanca con caja y cargador"'}
                </Text>
                <View style={styles.manualInputWrap}>
                  <TextInput value={manualText} onChangeText={setManualText} placeholder="Escribe los detalles aquí..." placeholderTextColor={colors.muted} multiline maxLength={220} style={styles.manualInput} />
                  {manualText ? (
                    <Pressable onPress={() => setManualText("")} style={styles.manualClear} hitSlop={8}>
                      <Icon name="close-circle" size={20} color={colors.muted} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          )}
          <View style={[styles.panel, { paddingBottom: bottomChrome + 10 }]}>
            {!isCollectible ? (
              <View style={styles.rule}>
                <View style={styles.dot} />
                <Text style={styles.ruleText} numberOfLines={1}>Luz Verde desde <Text style={styles.ruleValue}>{minProfit} €</Text> de beneficio</Text>
              </View>
            ) : null}
                                    <View style={styles.actionRow}>
              {!isManual && (isCollectible || mode === "photo") ? (
                <>
                  <Pressable onPress={pickFromGallery} style={styles.galleryBtn} hitSlop={6}>
                    <Icon name="image" size={20} color={colors.brandPrimary} />
                  </Pressable>
                  <Pressable onPress={pickNativeCamera} style={styles.galleryBtn} hitSlop={6}>
                    <Icon name="camera" size={20} color={colors.brandPrimary} />
                  </Pressable>
                </>
              ) : null}

              <View style={styles.priceBox}>
                <TextInput value={askingText} onChangeText={(t) => setAskingText(t.replace(/[^0-9.,]/g, "").slice(0, 7))} placeholder="¿Cuánto pide?" placeholderTextColor={colors.muted} keyboardType="decimal-pad" returnKeyType="done" style={[styles.priceInput, !askingText && styles.priceInputEmpty]} />
                {askingText ? (
                  <Pressable onPress={() => setAskingText("")} style={styles.clear} hitSlop={8}><Icon name="close-circle" size={18} color={colors.muted} /></Pressable>
                ) : null}
                <Text style={styles.priceEuro}>€</Text>
              </View>
              {isManual ? (
                <Pressable onPress={analyzeManual} disabled={!manualText.trim()} style={({ pressed }) => [styles.shutter, !manualText.trim() && styles.shutterDisabled, pressed && manualText.trim() && styles.pressed]}>
                  <Icon name="magnify" size={20} color={colors.onBrandPrimary} />
                  <Text style={styles.shutterText} numberOfLines={1}>ANALIZAR</Text>
                </Pressable>
                            ) : isCollectible || mode === "photo" ? (
                <Pressable onPress={() => takePhoto(true)} style={({ pressed }) => [styles.shutter, shutterLocked && styles.shutterLocked, pressed && !shutterLocked && styles.pressed]}>
                  <Icon name="camera" size={20} color={colors.onBrandPrimary} />
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
                  {isCollectible && cPhotos.length > 0 ? (
                    <View style={styles.pointsRow}>
                      {cPhotos.slice(0, 2).map((uri, idx) => (
                        <View key={idx} style={styles.pointCard}>
                          <Image source={{ uri }} style={styles.pointImg} />
                          {REF_POINTS.map((pt, pIdx) => (
                            <View
                              key={pIdx}
                              style={[
                                styles.refDot,
                                { left: pt.x as any, top: pt.y as any },
                                pIdx === scanStep && styles.refDotActive,
                              ]}
                            />
                          ))}
                        </View>
                      ))}
                    </View>
                  ) : (
                    <ActivityIndicator color={colors.brandPrimary} size="large" />
                  )}
                  <Text style={styles.overlayTitle}>Analizando rasgos…</Text>
                  <Text style={styles.overlayText}>{isCollectible ? "Verificando leyenda, ceca, relieves y estado" : "Identificando y tasando el artículo"}</Text>
                </>
              ) : (
                <>
                  <Icon name="alert-octagon" size={56} color={colors.error} />
                  <Text style={styles.overlayTitle}>No se pudo analizar</Text>
                  <Text style={styles.overlayText}>{errorMsg}</Text>
                  {needsKey ? (
                    <Pressable onPress={() => { reset(); router.push("/settings"); }} style={styles.overlayBtn}><Text style={styles.overlayBtnText}>IR A CONFIGURACIÓN</Text></Pressable>
                  ) : null}
                  <Pressable onPress={reset} style={styles.overlayBtnGhost}><Text style={styles.overlayBtnGhostText}>REINTENTAR</Text></Pressable>
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
  topBar: { backgroundColor: c.surface, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: c.border, zIndex: 20 },
  modeSwitch: { flexDirection: "row", backgroundColor: c.surfaceSecondary, borderRadius: 10, padding: 3, gap: 4 },
  modeBtn: { flex: 1, height: 36, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 2 },
  modeBtnActive: { backgroundColor: c.brandPrimary },
  modeLabel: { color: c.onSurface, fontSize: 11, fontWeight: "800" },
  modeLabelActive: { color: c.onBrandPrimary, fontWeight: "900" },
  coachBanner: { backgroundColor: c.surfaceSecondary, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  coachTitle: { color: c.onSurface, fontSize: 12, fontWeight: "900", textAlign: "center", lineHeight: 16 },
  coachSub: { fontSize: 11, fontWeight: "800", textAlign: "center", lineHeight: 15, marginTop: 2 },
  cameraWrap: { flex: 1, position: "relative" },
  camera: { flex: 1 },
  finder: { position: "absolute", top: 12, left: 20, right: 20, bottom: 76, alignItems: "center", justifyContent: "center" },
  frame: { width: "100%", height: "82%", position: "relative" },
  frameBarcode: { height: "42%" },
  coinCircle: { width: 205, height: 205, borderRadius: 103, borderWidth: 3.5, alignItems: "center", justifyContent: "center" },
  coinInnerRing: { width: 178, height: 178, borderRadius: 89, borderWidth: 1, borderStyle: "dashed", opacity: 0.75 },
  crossH: { position: "absolute", width: 22, height: 2 },
  crossV: { position: "absolute", width: 2, height: 22 },
  focusFlash: { borderColor: "#FFFFFF", transform: [{ scale: 0.96 }] },
  coinEdgeGuide: { width: "86%", height: 54, borderRadius: 12, borderWidth: 3.5, backgroundColor: "rgba(0,0,0,0.2)" },
  stampGuide: { width: 175, height: 220, borderRadius: 8, borderWidth: 3.5, backgroundColor: "rgba(0,0,0,0.25)" },
  stampGuideHoriz: { width: 230, height: 170 },
  cardGuide: { width: 195, height: 270, borderRadius: 14, borderWidth: 3.5 },
  cornerTool: { position: "absolute", zIndex: 10, minWidth: 46, height: 36, paddingHorizontal: 8, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.68)", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  cornerTopLeft: { top: 10, left: 10 },
  cornerTopRight: { top: 10, right: 10 },
  cornerBottomRight: { bottom: 10, right: 10 },
  cornerBottomLeft: { bottom: 10, left: 10 },
  toolBtn: { height: 38, paddingHorizontal: 9, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  toolBtnActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  toolText: { color: "#FFF", fontSize: 11, fontWeight: "900" },
  slotStrip: { position: "absolute", bottom: 8, left: 12, right: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  slotBox: { width: 58, height: 56, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.72)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  slotBoxActive: { borderColor: c.brandPrimary, borderWidth: 2 },
  slotImg: { width: 58, height: 38 },
  slotNum: { color: "#FFF", fontSize: 15, fontWeight: "900" },
  slotLabel: { color: "#FFF", fontSize: 9, fontWeight: "800", marginTop: 1 },
  slotReset: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  fastAnalyzeChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: c.brandPrimary },
  fastAnalyzeText: { color: c.onBrandPrimary, fontSize: 11, fontWeight: "900" },
  corner: { position: "absolute", width: 28, height: 28, borderColor: c.brandPrimary, borderWidth: 4 },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 12 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 12 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 12 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 12 },
  manualBody: { flex: 1, paddingTop: 16, paddingHorizontal: 16, backgroundColor: c.surface },
  manualCard: { backgroundColor: c.surfaceContainerLow ?? c.surface, borderRadius: 16, borderWidth: 1.5, borderColor: c.borderStrong, padding: 16, gap: 10 },
  manualHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  manualTitle: { color: c.onSurface, fontSize: 17, fontWeight: "900", flex: 1 },
  manualSubtitle: { color: c.onSurfaceTertiary, fontSize: 13, lineHeight: 19 },
  manualInputWrap: { position: "relative", marginTop: 4 },
  manualInput: { minHeight: 112, borderRadius: 12, borderWidth: 2, borderColor: c.borderStrong, backgroundColor: c.surface, color: c.onSurface, fontSize: 16, padding: 12, paddingRight: 36, textAlignVertical: "top" },
  manualClear: { position: "absolute", top: 10, right: 10 },
  panel: { backgroundColor: c.surface, paddingHorizontal: 14, paddingTop: 10, gap: 8, borderTopWidth: 1, borderTopColor: c.borderStrong },
  rule: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.brandPrimary },
  ruleText: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "700" },
  ruleValue: { color: c.brandPrimary, fontWeight: "900" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  priceBox: { flex: 1, minWidth: 0, height: 44, borderRadius: 10, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", paddingHorizontal: 8 },
  priceInput: { flex: 1, minWidth: 0, color: c.onSurface, fontSize: 20, fontWeight: "900" },
  priceInputEmpty: { fontSize: 13, fontWeight: "700" },
  clear: { marginRight: 2 },
  priceEuro: { color: c.onSurfaceTertiary, fontSize: 17, fontWeight: "900" },
  galleryBtn: { width: 40, height: 44, borderRadius: 10, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  shutter: { height: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flexShrink: 0 },
  shutterDisabled: { opacity: 0.45 },
  shutterLocked: { backgroundColor: "#EF4444", opacity: 0.65 },
  shutterText: { color: c.onBrandPrimary, fontSize: 16, fontWeight: "900", letterSpacing: 0.5 },
  scanningHint: { flex: 1.15, height: 56, borderRadius: 12, borderWidth: 2, borderColor: c.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  scanningText: { color: c.brandPrimary, fontSize: 15, fontWeight: "900", flexShrink: 1 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
  pointsRow: { flexDirection: "row", gap: 14, marginBottom: 8 },
  pointCard: { width: 136, height: 136, borderRadius: 68, overflow: "hidden", borderWidth: 2, borderColor: c.brandPrimary, position: "relative" },
  pointImg: { width: 136, height: 136 },
  refDot: { position: "absolute", width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.75)", borderWidth: 1, borderColor: c.brandPrimary },
  refDotActive: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#22C55E", borderWidth: 2, borderColor: "#FFF" },
  overlayTitle: { color: c.onSurface, fontSize: 24, fontWeight: "900", textAlign: "center" },
  overlayText: { color: c.onSurfaceTertiary, fontSize: 16, textAlign: "center", lineHeight: 22 },
  overlayBtn: { alignSelf: "stretch", height: 64, borderRadius: 12, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", marginTop: 8 },
  overlayBtnText: { color: c.onBrandPrimary, fontSize: 18, fontWeight: "900" },
  overlayBtnGhost: { alignSelf: "stretch", height: 64, borderRadius: 12, borderWidth: 2, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  overlayBtnGhostText: { color: c.onSurface, fontSize: 16, fontWeight: "900" },
  toast: { position: "absolute", left: 16, right: 16, bottom: 88, zIndex: 50, backgroundColor: c.brandPrimary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  toastText: { color: c.onBrandPrimary, fontSize: 17, fontWeight: "900" },
}));

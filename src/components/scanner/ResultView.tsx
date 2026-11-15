import { Icon } from "@/src/components/Icon";
import { Image } from "expo-image";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Analysis } from "@/src/ai";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { euro, type Verdict } from "@/src/verdict";

type Props = {
  analysis: Analysis;
  verdict: Verdict;
  asking: number | null;
  photoUri: string | null;
  saving: boolean;
  onDiscard: () => void;
  onBuy: () => void;
  onMount?: () => void;
};

export function ResultView({ analysis, verdict, asking, photoUri, saving, onDiscard, onBuy, onMount }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  useEffect(() => {
    onMount?.();
    // run once when the verdict appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const banner = {
    green: { bg: colors.success, fg: colors.onSuccess, icon: "check-decagram" as const, title: "¡CHOLLO! COMPRAR", sub: `Paga como máximo ${euro(verdict.maxPay)}` },
    amber: { bg: colors.warning, fg: colors.onWarning, icon: "handshake" as const, title: "NEGOCIAR", sub: `Pagar máximo ${euro(verdict.maxPay)}` },
    red: { bg: colors.error, fg: colors.onError, icon: "close-octagon" as const, title: "NO COMPRAR", sub: "Sin margen o baja demanda" },
  }[verdict.light];

  const subtitle = [analysis.marca, analysis.modelo_edicion].filter((s) => s && s !== "Desconocido").join(" · ");

  return (
    <View style={styles.root} testID="scan-result">
      <Animated.View entering={ZoomIn.duration(220)} style={[styles.banner, { backgroundColor: banner.bg }]} testID={`verdict-banner-${verdict.light}`}>
        <Icon name={banner.icon} size={44} color={banner.fg} />
        <View style={styles.bannerText}>
          <Text style={[styles.bannerTitle, { color: banner.fg }]} testID="verdict-title">{banner.title}</Text>
          <Text style={[styles.bannerSub, { color: banner.fg }]} testID="verdict-subtitle">{banner.sub}</Text>
        </View>
      </Animated.View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomChrome + 16 }]}>
        <Animated.View entering={FadeInDown.delay(60)} style={styles.titleRow}>
          {photoUri ? <Image source={{ uri: photoUri }} style={styles.thumb} contentFit="cover" testID="result-photo" /> : null}
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={2} testID="result-name">{analysis.nombre}</Text>
            {subtitle ? <Text style={styles.meta} numberOfLines={2}>{subtitle}</Text> : null}
            <View style={styles.chips}>
              <Text style={styles.chip} testID="result-category">{analysis.categoria}</Text>
              <Text style={styles.chip} testID="result-demand">Demanda {analysis.demanda}</Text>
              {analysis.estado ? <Text style={styles.chip}>{analysis.estado}</Text> : null}
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120)} style={styles.cards}>
          <View style={styles.card} testID="card-new-price">
            <Text style={styles.cardLabel}>PRECIO NUEVO</Text>
            <Text style={styles.cardValue}>{euro(analysis.precio_nuevo)}</Text>
          </View>
          <View style={[styles.card, styles.cardAccent]} testID="card-resale-price">
            <Text style={styles.cardLabel}>PRECIO REVENTA</Text>
            <Text style={[styles.cardValue, styles.accent]}>{euro(analysis.ver)}</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160)} style={styles.profitRow} testID="result-profit">
          <Text style={styles.profitLabel}>
            {verdict.assumedPrice ? "Beneficio si pagas el máximo" : `Beneficio pagando ${euro(asking ?? 0)}`}
          </Text>
          <Text style={[styles.profitValue, { color: verdict.profit >= 5 ? colors.brandPrimary : colors.error }]}>
            {euro(verdict.profit)}
          </Text>
        </Animated.View>

        <Text style={styles.explain} testID="result-explanation">{analysis.explicacion}</Text>

        <Pressable
          testID="result-buy-save-button"
          onPress={onBuy}
          disabled={saving}
          style={({ pressed }) => [styles.buy, pressed && styles.pressed]}
        >
          {saving ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <Icon name="cart-check" size={30} color={colors.onBrandPrimary} />
              <Text style={styles.buyText}>COMPRAR Y GUARDAR</Text>
            </>
          )}
        </Pressable>
        <Pressable
          testID="result-discard-button"
          onPress={onDiscard}
          style={({ pressed }) => [styles.discard, pressed && styles.pressed]}
        >
          <Icon name="camera-retake" size={26} color={colors.onSurface} />
          <Text style={styles.discardText}>DESCARTAR / NUEVO ESCANEO</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  banner: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 20, paddingVertical: 24 },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 32, fontWeight: "900", letterSpacing: 0.5 },
  bannerSub: { fontSize: 18, fontWeight: "800", marginTop: 2 },
  content: { padding: 16, gap: 16 },
  titleRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  thumb: { width: 72, height: 72, borderRadius: 12, borderWidth: 1, borderColor: c.border },
  flex: { flex: 1, gap: 4 },
  name: { color: c.onSurface, fontSize: 22, fontWeight: "900" },
  meta: { color: c.onSurfaceTertiary, fontSize: 14, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: {
    color: c.onSurface,
    fontSize: 13,
    fontWeight: "800",
    backgroundColor: c.surfaceTertiary,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: "hidden",
  },
  cards: { flexDirection: "row", gap: 12 },
  card: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
    gap: 6,
  },
  cardAccent: { borderColor: c.brandPrimary, borderWidth: 2 },
  cardLabel: { color: c.muted, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  cardValue: { color: c.onSurface, fontSize: 30, fontWeight: "900" },
  accent: { color: c.brandPrimary },
  profitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
  },
  profitLabel: { color: c.onSurfaceSecondary, fontSize: 15, fontWeight: "700", flex: 1 },
  profitValue: { fontSize: 24, fontWeight: "900" },
  explain: { color: c.onSurfaceTertiary, fontSize: 15, lineHeight: 21 },
  buy: {
    height: 76,
    borderRadius: 12,
    backgroundColor: c.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  buyText: { color: c.onBrandPrimary, fontSize: 22, fontWeight: "900", letterSpacing: 1 },
  discard: {
    height: 64,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.borderStrong,
    backgroundColor: c.surfaceSecondary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  discardText: { color: c.onSurface, fontSize: 17, fontWeight: "900", letterSpacing: 0.5 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
}));

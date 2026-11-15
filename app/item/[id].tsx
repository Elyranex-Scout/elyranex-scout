import { Icon } from "@/src/components/Icon";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getDeviceId, photoUrl } from "@/src/api";
import { EuroInput } from "@/src/components/EuroInput";
import { OptionGrid } from "@/src/components/OptionGrid";
import {
  addExpense,
  daysInStock,
  fmtDate,
  getItem,
  netProfit,
  parseEuro,
  PLATFORMS,
  sellItem,
  totalCost,
  type Item,
  type SalePlatform,
} from "@/src/inventory";
import { makeStyles, useTheme } from "@/src/theme";
import { euro } from "@/src/verdict";

export default function ItemDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [item, setItem] = useState<Item | null>(null);
  const [dev, setDev] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [expense, setExpense] = useState("");
  const [selling, setSelling] = useState(false);
  const [salePrice, setSalePrice] = useState("");
  const [fees, setFees] = useState("");
  const [platform, setPlatform] = useState<SalePlatform | null>(null);
  const [busy, setBusy] = useState<"expense" | "sell" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    Promise.all([getItem(id), getDeviceId()])
      .then(([it, d]) => {
        setItem(it);
        setDev(d);
      })
      .catch((e) => setLoadErr(e instanceof Error ? e.message : "No se pudo cargar."));
  }, [id]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/inventory"));

  const onExpense = async () => {
    const n = parseEuro(expense);
    if (!expense || Number.isNaN(n) || n <= 0) return setError("Introduce un gasto mayor que 0 €.");
    setError("");
    setBusy("expense");
    try {
      setItem(await addExpense(id, n));
      setExpense("");
      setNotice(`Gasto de ${euro(n)} añadido`);
      setTimeout(() => setNotice(""), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el gasto.");
    } finally {
      setBusy(null);
    }
  };

  const onSell = async () => {
    const p = parseEuro(salePrice);
    const f = fees ? parseEuro(fees) : 0;
    if (!salePrice || Number.isNaN(p)) return setError("Introduce el precio de venta final.");
    if (Number.isNaN(f)) return setError("Las comisiones no son válidas.");
    if (!platform) return setError("Elige la plataforma de venta.");
    setError("");
    setBusy("sell");
    try {
      setItem(await sellItem(id, { precio_venta: p, comisiones: f, plataforma: platform }));
      setSelling(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar como vendido.");
    } finally {
      setBusy(null);
    }
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable testID="item-back-button" onPress={back} style={styles.iconBtn} accessibilityLabel="Volver">
        <Icon name="arrow-left" size={28} color={colors.onSurface} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>Artículo</Text>
    </View>
  );

  if (!item) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.center}>
          {loadErr ? <Text style={styles.error} testID="item-load-error">{loadErr}</Text> : <ActivityIndicator color={colors.brandPrimary} size="large" />}
        </View>
      </View>
    );
  }

  const sold = item.estado === "Vendido";
  const days = daysInStock(item);
  const profit = netProfit(item);
  const previewProfit = salePrice ? (parseEuro(salePrice) || 0) - (parseEuro(fees) || 0) - totalCost(item) : null;

  return (
    <View style={styles.root} testID="item-detail">
      {header}
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={styles.top}>
          {item.has_photo && dev ? (
            <Image source={{ uri: photoUrl(item.id, dev) }} style={styles.photo} contentFit="cover" cachePolicy="memory-disk" testID="item-photo" />
          ) : (
            <View style={[styles.photo, styles.photoEmpty]}>
              <Icon name="image-off-outline" size={36} color={colors.muted} />
            </View>
          )}
          <View style={styles.flex}>
            <Text style={styles.name} testID="item-name">{item.nombre}</Text>
            <View style={styles.tags}>
              <Text style={styles.tag}>{item.categoria}</Text>
              <Text style={[styles.tag, sold ? styles.tagSold : styles.tagStock]} testID="item-status">{item.estado}</Text>
            </View>
            <Text style={styles.meta}>
              {item.origen} · {fmtDate(item.fecha_compra)}
            </Text>
            <Text style={[styles.meta, !sold && days > 45 && styles.old]} testID="item-days">
              {days} días {sold ? "hasta venderse" : "en stock"}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Row label="Precio pagado" value={euro(item.precio_pagado)} />
          <Row label="Gastos extra" value={euro(item.gastos_extra)} testID="item-extra-costs" />
          <View style={styles.divider} />
          <Row label="Coste total" value={euro(totalCost(item))} strong testID="item-total-cost" />
          <Row label="Reventa estimada (VER)" value={euro(item.ver)} accent />
        </View>

        {sold ? (
          <View style={styles.card} testID="item-sale-summary">
            <Row label="Precio de venta" value={euro(item.precio_venta ?? 0)} />
            <Row label="Comisiones / envío" value={`− ${euro(item.comisiones ?? 0)}`} />
            <Row label="Plataforma" value={item.plataforma ?? "—"} />
            <Row label="Fecha de venta" value={item.fecha_venta ? fmtDate(item.fecha_venta) : "—"} />
            <View style={styles.divider} />
            <View style={styles.rowLine}>
              <Text style={styles.bigLabel}>BENEFICIO NETO</Text>
              <Text style={[styles.bigValue, { color: profit >= 0 ? colors.success : colors.error }]} testID="item-net-profit">
                {euro(profit)}
              </Text>
            </View>
          </View>
        ) : selling ? (
          <View style={styles.section} testID="item-sell-form">
            <EuroInput label="Precio de venta final (€)" value={salePrice} onChange={setSalePrice} testID="sell-price-input" autoFocus />
            <EuroInput label="Comisiones/Envío a mi cargo (€)" value={fees} onChange={setFees} testID="sell-fees-input" />
            <Text style={styles.label}>Plataforma</Text>
            <OptionGrid options={PLATFORMS} value={platform} onChange={setPlatform} testPrefix="sell-platform" />
            {previewProfit !== null ? (
              <Text style={[styles.preview, { color: previewProfit >= 0 ? colors.success : colors.error }]} testID="sell-profit-preview">
                Beneficio neto: {euro(Math.round(previewProfit * 100) / 100)}
              </Text>
            ) : null}
            {error ? <Text style={styles.error} testID="item-error">{error}</Text> : null}
            <Pressable testID="sell-confirm-button" onPress={onSell} disabled={busy === "sell"} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
              {busy === "sell" ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>CONFIRMAR VENTA</Text>}
            </Pressable>
            <Pressable testID="sell-cancel-button" onPress={() => { setSelling(false); setError(""); }} style={styles.ghost}>
              <Text style={styles.ghostText}>CANCELAR</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.section}>
            <EuroInput label="Gastos extra (€) · reparación / embalaje" value={expense} onChange={setExpense} testID="expense-input" />
            <Pressable testID="expense-add-button" onPress={onExpense} disabled={busy === "expense"} style={({ pressed }) => [styles.outline, pressed && styles.pressed]}>
              {busy === "expense" ? (
                <ActivityIndicator color={colors.brandPrimary} />
              ) : (
                <>
                  <Icon name="plus-circle" size={24} color={colors.brandPrimary} />
                  <Text style={styles.outlineText}>AÑADIR GASTO</Text>
                </>
              )}
            </Pressable>
            {notice ? <Text style={styles.notice} testID="item-notice">{notice}</Text> : null}
            {error ? <Text style={styles.error} testID="item-error">{error}</Text> : null}
            <Pressable testID="mark-sold-button" onPress={() => { setSelling(true); setError(""); }} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
              <Icon name="cash-check" size={28} color={colors.onBrandPrimary} />
              <Text style={styles.ctaText}>MARCAR COMO VENDIDO</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

function Row({ label, value, strong, accent, testID }: { label: string; value: string; strong?: boolean; accent?: boolean; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.rowLine}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowStrong, accent && styles.rowAccent]} testID={testID}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  iconBtn: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: c.onSurface, fontSize: 22, fontWeight: "900", flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  content: { padding: 16, gap: 16 },
  top: { flexDirection: "row", gap: 12 },
  photo: { width: 110, height: 110, borderRadius: 12, backgroundColor: c.surfaceTertiary },
  photoEmpty: { alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, gap: 6 },
  name: { color: c.onSurface, fontSize: 22, fontWeight: "900" },
  tags: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tag: {
    color: c.onSurface,
    fontSize: 12,
    fontWeight: "800",
    backgroundColor: c.surfaceTertiary,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: "hidden",
  },
  tagStock: { backgroundColor: c.brandTertiary, color: c.onBrandTertiary },
  tagSold: { backgroundColor: c.onSurface, color: c.surface },
  meta: { color: c.muted, fontSize: 14, fontWeight: "600" },
  old: { color: c.error, fontWeight: "900" },
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
    gap: 10,
  },
  divider: { height: 1, backgroundColor: c.divider },
  rowLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  rowLabel: { color: c.onSurfaceTertiary, fontSize: 15, fontWeight: "600", flex: 1 },
  rowValue: { color: c.onSurface, fontSize: 17, fontWeight: "800" },
  rowStrong: { fontSize: 20, fontWeight: "900" },
  rowAccent: { color: c.brandPrimary, fontWeight: "900" },
  bigLabel: { color: c.onSurface, fontSize: 15, fontWeight: "900", letterSpacing: 1 },
  bigValue: { fontSize: 28, fontWeight: "900" },
  section: { gap: 12 },
  label: { color: c.onSurface, fontSize: 16, fontWeight: "800" },
  preview: { fontSize: 18, fontWeight: "900" },
  error: { color: c.error, fontSize: 15, fontWeight: "700" },
  notice: { color: c.success, fontSize: 15, fontWeight: "800" },
  outline: {
    height: 60,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  outlineText: { color: c.brandPrimary, fontSize: 18, fontWeight: "900" },
  cta: {
    height: 76,
    borderRadius: 12,
    backgroundColor: c.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 8,
  },
  ctaText: { color: c.onBrandPrimary, fontSize: 21, fontWeight: "900", letterSpacing: 1 },
  ghost: { height: 56, borderRadius: 12, borderWidth: 2, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  ghostText: { color: c.onSurface, fontSize: 16, fontWeight: "900" },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
}));

import { Icon } from "@/src/components/Icon";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getDeviceId, photoUrl } from "@/src/api";
import { AppHeader } from "@/src/components/AppHeader";
import { CATEGORIES, type Category } from "@/src/ai";
import { daysInStock, fetchItems, netProfit, OLD_STOCK_DAYS, totalCost, type Item } from "@/src/inventory";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { euro } from "@/src/verdict";

type Status = "En stock" | "Vendido";

export default function InventoryScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const [items, setItems] = useState<Item[]>([]);
  const [dev, setDev] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status>("En stock");
  const [category, setCategory] = useState<Category | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      const [res, d] = await Promise.all([fetchItems(), getDeviceId()]);
      setDev(d);
      setItems(res.items);
      setOffline(res.offline);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el inventario.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const visible = useMemo(
    () => items.filter((i) => i.estado === status && (!category || i.categoria === category)),
    [items, status, category],
  );
  const counts = useMemo(
    () => ({
      "En stock": items.filter((i) => i.estado === "En stock").length,
      Vendido: items.filter((i) => i.estado === "Vendido").length,
    }),
    [items],
  );
  const pendingCount = items.filter((i) => i.pending).length;
  const oldCount = items.filter((i) => i.estado === "En stock" && !i.pending && daysInStock(i) > OLD_STOCK_DAYS).length;

  const open = (i: Item) => {
    if (i.pending) {
      setToast("Pendiente de sincronizar. Conéctate para editarlo.");
      setTimeout(() => setToast(""), 2200);
      return;
    }
    router.push({ pathname: "/item/[id]", params: { id: i.id } });
  };

  const renderItem = ({ item }: { item: Item }) => {
    const days = daysInStock(item);
    const old = item.estado === "En stock" && days > 45;
    const src = item.local_photo ?? (item.has_photo && dev ? photoUrl(item.id, dev) : null);
    const profit = netProfit(item);
    return (
      <Pressable
        testID={`inventory-item-${item.id}`}
        onPress={() => open(item)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        {src ? (
          <Image source={{ uri: src }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" transition={150} />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Icon name="image-off-outline" size={26} color={colors.muted} />
          </View>
        )}
        <View style={styles.rowBody}>
          <Text style={styles.rowName} numberOfLines={1}>{item.nombre}</Text>
          <View style={styles.tagRow}>
            <Text style={styles.tag}>{item.categoria}</Text>
            {item.pending ? <Text style={[styles.tag, styles.tagPending]}>Sin sincronizar</Text> : null}
          </View>
          <Text style={styles.prices} numberOfLines={1}>
            Compra <Text style={styles.strong}>{euro(totalCost(item))}</Text>
            {item.estado === "Vendido" ? (
              <> · Venta <Text style={styles.strong}>{euro(item.precio_venta ?? 0)}</Text></>
            ) : (
              <> · Reventa <Text style={styles.accent}>{euro(item.ver)}</Text></>
            )}
          </Text>
        </View>
        {item.estado === "En stock" ? (
          <View style={[styles.days, old && styles.daysOld]} testID={`inventory-days-${item.id}`}>
            <Text style={[styles.daysNum, old && styles.daysNumOld]}>{days}</Text>
            <Text style={[styles.daysLbl, old && styles.daysNumOld]}>días</Text>
          </View>
        ) : (
          <View style={styles.days}>
            <Text style={[styles.profit, { color: profit >= 0 ? colors.success : colors.error }]} numberOfLines={1}>
              {profit >= 0 ? "+" : ""}{euro(profit)}
            </Text>
            <Text style={styles.daysLbl}>neto</Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.root} testID="inventory-screen">
      <AppHeader section="Inventario" />
      <View style={styles.filters}>
        <View style={styles.segment}>
          {(["En stock", "Vendido"] as const).map((s) => (
            <Pressable
              key={s}
              testID={`inventory-filter-${s === "En stock" ? "stock" : "sold"}`}
              onPress={() => setStatus(s)}
              style={[styles.segBtn, status === s && styles.segBtnActive]}
            >
              <Text style={[styles.segText, status === s && styles.segTextActive]}>
                {s === "En stock" ? "En stock" : "Vendidos"} ({counts[s]})
              </Text>
            </Pressable>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipContent}>
          {[null, ...CATEGORIES].map((c) => {
            const active = category === c;
            return (
              <Pressable
                key={c ?? "all"}
                testID={`inventory-category-${(c ?? "todas").toLowerCase()}`}
                onPress={() => setCategory(c)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c ?? "Todas"}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {oldCount ? (
          <Pressable
            testID="inventory-old-stock-alert"
            onPress={() => router.push("/old-stock")}
            style={({ pressed }) => [styles.oldAlert, pressed && styles.pressed]}
          >
            <Icon name="clock-alert" size={22} color={colors.onError} />
            <Text style={styles.oldAlertText}>
              {oldCount} artículo(s) con más de {OLD_STOCK_DAYS} días · Ver precio sugerido
            </Text>
            <Icon name="chevron-right" size={24} color={colors.onError} />
          </Pressable>
        ) : null}
        {offline || pendingCount ? (
          <View style={styles.banner} testID="inventory-offline-banner">
            <Icon name="cloud-off-outline" size={18} color={colors.onWarning} />
            <Text style={styles.bannerText}>
              {offline ? "Sin conexión · mostrando datos guardados" : `${pendingCount} pendiente(s) de sincronizar`}
            </Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center} testID="inventory-error">
          <Text style={styles.emptyTitle}>{error}</Text>
          <Pressable testID="inventory-retry" onPress={load} style={styles.retry}>
            <Text style={styles.retryText}>REINTENTAR</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: bottomChrome + 24 }, !visible.length && styles.flexGrow]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />
          }
          ListEmptyComponent={
            <View style={styles.empty} testID="inventory-empty-state">
              <View style={styles.iconBox}>
                <Icon name="package-variant-closed" size={48} color={colors.brandPrimary} />
              </View>
              <Text style={styles.emptyTitle}>
                {status === "En stock" ? "Nada en stock" : "Aún no has vendido nada"}
              </Text>
              <Text style={styles.emptyText}>
                {status === "En stock"
                  ? "Escanea un artículo y pulsa COMPRAR Y GUARDAR."
                  : "Marca un artículo como vendido para verlo aquí."}
              </Text>
            </View>
          }
        />
      )}

      {toast ? (
        <View style={[styles.toast, { bottom: bottomChrome + 16 }]} testID="inventory-toast">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  filters: { paddingTop: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: 8 },
  segment: {
    flexDirection: "row",
    marginHorizontal: 16,
    padding: 4,
    gap: 4,
    borderRadius: 12,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
  },
  segBtn: { flex: 1, height: 48, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  segBtnActive: { backgroundColor: c.brandPrimary },
  segText: { color: c.onSurface, fontSize: 16, fontWeight: "900" },
  segTextActive: { color: c.onBrandPrimary },
  chipRow: { height: 56, flexGrow: 0 },
  chipContent: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  chip: {
    height: 36,
    flexShrink: 0,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    backgroundColor: c.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: c.onSurface, borderColor: c.onSurface },
  chipText: { color: c.onSurface, fontSize: 14, fontWeight: "800" },
  chipTextActive: { color: c.surface },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: c.warning,
  },
  bannerText: { color: c.onWarning, fontSize: 14, fontWeight: "800", flex: 1 },
  oldAlert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: c.error,
  },
  oldAlertText: { color: c.onError, fontSize: 14, fontWeight: "900", flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  list: { padding: 16, gap: 8 },
  flexGrow: { flexGrow: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
  },
  pressed: { opacity: 0.85 },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: c.surfaceTertiary },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, gap: 4 },
  rowName: { color: c.onSurface, fontSize: 17, fontWeight: "800" },
  tagRow: { flexDirection: "row", gap: 6 },
  tag: {
    color: c.onSurface,
    fontSize: 11,
    fontWeight: "800",
    backgroundColor: c.surfaceTertiary,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: "hidden",
  },
  tagPending: { backgroundColor: c.warning, color: c.onWarning },
  prices: { color: c.muted, fontSize: 13, fontWeight: "600" },
  strong: { color: c.onSurface, fontWeight: "900" },
  accent: { color: c.brandPrimary, fontWeight: "900" },
  days: {
    minWidth: 60,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: "center",
  },
  daysOld: { backgroundColor: c.error, borderColor: c.error },
  daysNum: { color: c.onSurface, fontSize: 22, fontWeight: "900" },
  daysNumOld: { color: c.onError },
  daysLbl: { color: c.muted, fontSize: 11, fontWeight: "800" },
  profit: { fontSize: 15, fontWeight: "900" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 },
  iconBox: {
    width: 96,
    height: 96,
    borderRadius: 20,
    backgroundColor: c.brandTertiary,
    borderWidth: 1,
    borderColor: c.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: c.onSurface, fontSize: 20, fontWeight: "900", textAlign: "center" },
  emptyText: { color: c.onSurfaceTertiary, fontSize: 15, textAlign: "center", lineHeight: 21 },
  retry: { height: 56, paddingHorizontal: 32, borderRadius: 12, backgroundColor: c.brandPrimary, justifyContent: "center" },
  retryText: { color: c.onBrandPrimary, fontSize: 18, fontWeight: "900" },
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: c.warning,
  },
  toastText: { color: c.onWarning, fontSize: 15, fontWeight: "900" },
}));

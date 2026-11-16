import { Icon } from "@/src/components/Icon";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getDeviceId, photoUrl } from "@/src/api";
import { AppHeader } from "@/src/components/AppHeader";
import { CATEGORIES, type Category } from "@/src/ai";
import { daysInStock, deleteItem, fetchItems, netProfit, OLD_STOCK_DAYS, totalCost, type CollectionDest, type Item } from "@/src/inventory";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { euro } from "@/src/verdict";
import { useVertical } from "@/src/vertical";

type Status = "En stock" | "Vendido";
type ColFilter = "todas" | CollectionDest;

export default function InventoryScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [vertical] = useVertical();

  const [items, setItems] = useState<Item[]>([]);
  const [dev, setDev] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status>("En stock");
  const [category, setCategory] = useState<Category | null>(null);
  const [colFilter, setColFilter] = useState<ColFilter>("todas");
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const [inspectItem, setInspectItem] = useState<Item | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      const [res, d] = await Promise.all([fetchItems(vertical), getDeviceId()]);
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
  }, [vertical]);

  useFocusEffect(
    useCallback(() => {
      setSelectedAlbum(null);
      load();
    }, [load]),
  );

  const isCollectible = vertical === "coleccionismo";

  const albums = useMemo(() => {
    if (!isCollectible) return [];
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.collectible_data?.album) set.add(i.collectible_data.album);
    });
    return Array.from(set);
  }, [items, isCollectible]);

  const visible = useMemo(() => {
    if (!isCollectible) {
      return items.filter((i) => i.estado === status && (!category || i.categoria === category));
    }
    return items.filter((i) => {
      const dest = i.collectible_data?.destino ?? "coleccion";
      const alb = i.collectible_data?.album ?? "";
      if (colFilter !== "todas" && dest !== colFilter) return false;
      if (selectedAlbum && alb !== selectedAlbum) return false;
      return true;
    });
  }, [items, isCollectible, status, category, colFilter, selectedAlbum]);

  const colSummary = useMemo(() => {
    const totalVal = visible.reduce((acc, i) => acc + (i.ver || 0), 0);
    const totalPaid = visible.reduce((acc, i) => acc + totalCost(i), 0);
    return { count: visible.length, totalVal, totalPaid };
  }, [visible]);

  const counts = useMemo(
    () => ({
      "En stock": items.filter((i) => i.estado === "En stock").length,
      Vendido: items.filter((i) => i.estado === "Vendido").length,
    }),
    [items],
  );
  const pendingCount = items.filter((i) => i.pending).length;
  const oldCount = !isCollectible
    ? items.filter((i) => i.estado === "En stock" && !i.pending && daysInStock(i) > OLD_STOCK_DAYS).length
    : 0;
  const open = (i: Item) => {
    if (isCollectible) {
      setInspectItem(i);
      return;
    }
    if (i.pending) {
      setToast("Pendiente de sincronizar. Conéctate para editarlo.");
      setTimeout(() => setToast(""), 2200);
      return;
    }
    router.push({ pathname: "/item/[id]", params: { id: i.id } });
  };

  const renderItem = ({ item }: { item: Item }) => {
    const days = daysInStock(item);
    const old = !isCollectible && item.estado === "En stock" && days > 45;
    const src = item.local_photo ?? (item.has_photo && dev ? photoUrl(item.id, dev) : null);
    const profit = netProfit(item);
    const cData = item.collectible_data;

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
            {isCollectible && cData ? (
              <>
                <Text style={styles.tag}>{cData.album}</Text>
                <Text style={[styles.tag, cData.destino === "repetida_venta" && styles.tagRepeat]}>
                  {cData.destino === "repetida_venta" ? "Repetida" : "Colección"}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.tag}>{item.categoria}</Text>
                {item.pending ? <Text style={[styles.tag, styles.tagPending]}>Sin sincronizar</Text> : null}
              </>
            )}
          </View>
          {isCollectible && cData ? (
            <Text style={styles.prices} numberOfLines={1}>
              Coste <Text style={styles.strong}>{euro(totalCost(item))}</Text> · Tasación{" "}
              <Text style={styles.accent}>
                {cData.valor_min === cData.valor_max ? euro(cData.valor_min) : `${euro(cData.valor_min)}–${euro(cData.valor_max)}`}
              </Text>
            </Text>
          ) : (
            <Text style={styles.prices} numberOfLines={1}>
              Compra <Text style={styles.strong}>{euro(totalCost(item))}</Text>
              {item.estado === "Vendido" ? (
                <> · Venta <Text style={styles.strong}>{euro(item.precio_venta ?? 0)}</Text></>
              ) : (
                <> · Reventa <Text style={styles.accent}>{euro(item.ver)}</Text></>
              )}
            </Text>
          )}
        </View>
        {isCollectible && cData ? (
          <View style={styles.gradeBadge}>
            <Text style={styles.gradeBadgeText} numberOfLines={1}>{cData.grado}</Text>
            <Text style={styles.daysLbl}>{cData.tipo_pieza}</Text>
          </View>
        ) : item.estado === "En stock" ? (
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
      <AppHeader section={isCollectible ? "Mis Álbumes" : "Inventario"} />

      {isCollectible ? (
        <View style={styles.filters}>
          <View style={styles.colSummaryCard}>
            <View style={styles.colStat}>
              <Text style={styles.colStatLabel}>VALOR ESTIMADO</Text>
              <Text style={styles.colStatValue}>{euro(colSummary.totalVal)}</Text>
            </View>
            <View style={styles.colStat}>
              <Text style={styles.colStatLabel}>COSTE PAGADO</Text>
              <Text style={styles.colStatSub}>{euro(colSummary.totalPaid)}</Text>
            </View>
            <View style={styles.colStat}>
              <Text style={styles.colStatLabel}>PIEZAS</Text>
              <Text style={styles.colStatSub}>{colSummary.count}</Text>
            </View>
          </View>

          <View style={styles.segment}>
            {(
              [
                { id: "todas", label: "Todas" },
                { id: "coleccion", label: "Mi Colección" },
                { id: "repetida_venta", label: "Repetidas" },
              ] as const
            ).map((tab) => (
              <Pressable
                key={tab.id}
                onPress={() => setColFilter(tab.id)}
                style={[styles.segBtn, colFilter === tab.id && styles.segBtnActive]}
              >
                <Text style={[styles.segText, colFilter === tab.id && styles.segTextActive]}>{tab.label}</Text>
              </Pressable>
            ))}
          </View>

          {albums.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipContent}>
              {[null, ...albums].map((alb) => {
                const active = selectedAlbum === alb;
                return (
                  <Pressable
                    key={alb ?? "all-albums"}
                    onPress={() => setSelectedAlbum(alb)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{alb ?? "Todos los álbumes"}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </View>
      ) : (
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
      )}

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
                <Icon name={isCollectible ? "coins" : "package-variant-closed"} size={48} color={colors.brandPrimary} />
              </View>
              <Text style={styles.emptyTitle}>
                {isCollectible ? "Álbum vacío" : status === "En stock" ? "Nada en stock" : "Aún no has vendido nada"}
              </Text>
              <Text style={styles.emptyText}>
                {isCollectible
                  ? "Escanea una moneda, sello o carta y pulsa GUARDAR EN ÁLBUM."
                  : status === "En stock"
                  ? "Escanea un artículo y pulsa COMPRAR Y GUARDAR."
                  : "Marca un artículo como vendido para verlo aquí."}
              </Text>
            </View>
          }
        />
      )}
      <Modal visible={Boolean(inspectItem)} transparent animationType="slide" onRequestClose={() => setInspectItem(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {inspectItem ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
                <Text style={styles.modalTitle}>{inspectItem.nombre}</Text>
                <Text style={styles.modalSub}>{inspectItem.modelo_edicion}</Text>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modalPhotos}>
                  {[
                    { label: "Anverso", uri: inspectItem.collectible_photos?.anverso ?? inspectItem.local_photo },
                    { label: "Reverso", uri: inspectItem.collectible_photos?.reverso },
                    { label: "Canto", uri: inspectItem.collectible_photos?.canto },
                  ]
                    .filter((p) => Boolean(p.uri))
                    .map((p) => (
                      <View key={p.label} style={styles.modalPhotoCard}>
                        <Image source={{ uri: p.uri! }} style={styles.modalPhotoImg} contentFit="cover" />
                        <Text style={styles.modalPhotoLbl}>{p.label}</Text>
                      </View>
                    ))}
                </ScrollView>

                {inspectItem.collectible_data ? (
                  <View style={styles.modalSpecs}>
                    <Text style={styles.specLine}>Álbum: <Text style={styles.strong}>{inspectItem.collectible_data.album}</Text></Text>
                    <Text style={styles.specLine}>Grado / Estado: <Text style={styles.strong}>{inspectItem.collectible_data.grado}</Text></Text>
                    <Text style={styles.specLine}>Rareza: <Text style={styles.strong}>{inspectItem.collectible_data.rareza}</Text></Text>
                    <Text style={styles.specLine}>Canto / Detalle: <Text style={styles.strong}>{inspectItem.collectible_data.tipo_canto_o_dentado}</Text></Text>
                    <Text style={styles.specLine}>
                      Valoración: <Text style={styles.accent}>{euro(inspectItem.collectible_data.valor_min)} – {euro(inspectItem.collectible_data.valor_max)}</Text>
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.modalExp}>{inspectItem.explicacion}</Text>

                                <View style={styles.modalBtnRow}>
                  <Pressable
                    onPress={async () => {
                      const idToRemove = inspectItem.id;
                      setInspectItem(null);
                      await deleteItem(idToRemove);
                      load();
                      setToast("Pieza eliminada del álbum");
                      setTimeout(() => setToast(""), 2200);
                    }}
                    style={styles.deleteModalBtn}
                  >
                    <Icon name="delete" size={18} color={colors.onError} />
                    <Text style={styles.deleteModalText}>ELIMINAR</Text>
                  </Pressable>
                  <Pressable onPress={() => setInspectItem(null)} style={styles.closeModalBtn}>
                    <Text style={styles.closeModalText}>CERRAR</Text>
                  </Pressable>
                </View>

              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

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
  colSummaryCard: { flexDirection: "row", marginHorizontal: 16, padding: 12, borderRadius: 12, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.brandPrimary, justifyContent: "space-between" },
  colStat: { alignItems: "center", flex: 1 },
  colStatLabel: { color: c.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  colStatValue: { color: c.brandPrimary, fontSize: 18, fontWeight: "900", marginTop: 2 },
  colStatSub: { color: c.onSurface, fontSize: 17, fontWeight: "900", marginTop: 2 },
  segment: { flexDirection: "row", marginHorizontal: 16, padding: 4, gap: 4, borderRadius: 12, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  segBtn: { flex: 1, height: 44, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  segBtnActive: { backgroundColor: c.brandPrimary },
  segText: { color: c.onSurface, fontSize: 14, fontWeight: "900" },
  segTextActive: { color: c.onBrandPrimary },
  chipRow: { height: 48, flexGrow: 0 },
  chipContent: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  chip: { height: 34, flexShrink: 0, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: c.borderStrong, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: c.onSurface, borderColor: c.onSurface },
  chipText: { color: c.onSurface, fontSize: 13, fontWeight: "800" },
  chipTextActive: { color: c.surface },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: c.warning },
  bannerText: { color: c.onWarning, fontSize: 14, fontWeight: "800", flex: 1 },
  oldAlert: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, minHeight: 48, paddingHorizontal: 12, borderRadius: 8, backgroundColor: c.error },
  oldAlertText: { color: c.onError, fontSize: 14, fontWeight: "900", flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  list: { padding: 16, gap: 8 },
  flexGrow: { flexGrow: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 12, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  pressed: { opacity: 0.85 },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: c.surfaceTertiary },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, gap: 4 },
  rowName: { color: c.onSurface, fontSize: 16, fontWeight: "800" },
  tagRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tag: { color: c.onSurface, fontSize: 11, fontWeight: "800", backgroundColor: c.surfaceTertiary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden" },
  tagPending: { backgroundColor: c.warning, color: c.onWarning },
  tagRepeat: { backgroundColor: c.brandPrimary, color: c.onBrandPrimary },
  prices: { color: c.muted, fontSize: 13, fontWeight: "600" },
  strong: { color: c.onSurface, fontWeight: "900" },
  accent: { color: c.brandPrimary, fontWeight: "900" },
  gradeBadge: { minWidth: 64, paddingHorizontal: 6, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: c.brandPrimary, alignItems: "center" },
  gradeBadgeText: { color: c.brandPrimary, fontSize: 13, fontWeight: "900" },
  days: { minWidth: 60, paddingHorizontal: 6, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center" },
  daysOld: { backgroundColor: c.error, borderColor: c.error },
  daysNum: { color: c.onSurface, fontSize: 22, fontWeight: "900" },
  daysNumOld: { color: c.onError },
  daysLbl: { color: c.muted, fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  profit: { fontSize: 15, fontWeight: "900" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 },
  iconBox: { width: 96, height: 96, borderRadius: 20, backgroundColor: c.brandTertiary, borderWidth: 1, borderColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: c.onSurface, fontSize: 20, fontWeight: "900", textAlign: "center" },
  emptyText: { color: c.onSurfaceTertiary, fontSize: 15, textAlign: "center", lineHeight: 21 },
  retry: { height: 56, paddingHorizontal: 32, borderRadius: 12, backgroundColor: c.brandPrimary, justifyContent: "center" },
  retryText: { color: c.onBrandPrimary, fontSize: 18, fontWeight: "900" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: "86%", borderTopWidth: 1, borderColor: c.borderStrong },
  modalScroll: { gap: 12, paddingBottom: 16 },
  modalTitle: { color: c.onSurface, fontSize: 20, fontWeight: "900" },
  modalSub: { color: c.muted, fontSize: 13, fontWeight: "700", marginTop: -8 },
  modalPhotos: { gap: 10 },
  modalPhotoCard: { width: 120, borderRadius: 10, overflow: "hidden", backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.borderStrong },
  modalPhotoImg: { width: 120, height: 120 },
  modalPhotoLbl: { color: c.onSurface, fontSize: 11, fontWeight: "800", textAlign: "center", paddingVertical: 5 },
  modalSpecs: { backgroundColor: c.surfaceSecondary, borderRadius: 12, padding: 12, gap: 6, borderWidth: 1, borderColor: c.border },
  specLine: { color: c.muted, fontSize: 13, fontWeight: "700" },
  modalExp: { color: c.onSurface, fontSize: 14, lineHeight: 20 },
  modalBtnRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  deleteModalBtn: { flex: 0.9, height: 50, borderRadius: 12, backgroundColor: c.error, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  deleteModalText: { color: c.onError, fontSize: 14, fontWeight: "900" },
  closeModalBtn: { flex: 1.1, height: 50, borderRadius: 12, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  closeModalText: { color: c.onBrandPrimary, fontSize: 15, fontWeight: "900" },

  toast: { position: "absolute", left: 16, right: 16, padding: 16, borderRadius: 12, backgroundColor: c.warning },
  toastText: { color: c.onWarning, fontSize: 15, fontWeight: "900" },
}));

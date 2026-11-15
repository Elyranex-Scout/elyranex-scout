import { Icon } from "@/src/components/Icon";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getDeviceId, photoUrl } from "@/src/api";
import { daysInStock, fetchItems, OLD_STOCK_DAYS, quickSalePrice, totalCost, type Item } from "@/src/inventory";
import { makeStyles, useTheme } from "@/src/theme";
import { euro } from "@/src/verdict";

export default function OldStockScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [dev, setDev] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      Promise.all([fetchItems(), getDeviceId()])
        .then(([r, d]) => {
          setItems(r.items);
          setDev(d);
          setError("");
        })
        .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar."))
        .finally(() => setLoading(false));
    }, []),
  );

  const old = useMemo(
    () =>
      items
        .filter((i) => i.estado === "En stock" && !i.pending && daysInStock(i) > OLD_STOCK_DAYS)
        .sort((a, b) => daysInStock(b) - daysInStock(a)),
    [items],
  );
  const tiedUp = old.reduce((s, i) => s + totalCost(i), 0);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/inventory"));

  return (
    <View style={styles.root} testID="old-stock-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="old-stock-back-button" onPress={back} style={styles.iconBtn} accessibilityLabel="Volver">
          <Icon name="arrow-left" size={28} color={colors.onSurface} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>Stock viejo</Text>
          <Text style={styles.subtitle}>Más de {OLD_STOCK_DAYS} días sin vender</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText} testID="old-stock-error">{error}</Text>
        </View>
      ) : (
        <FlatList
          data={old}
          keyExtractor={(i) => i.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }, !old.length && styles.grow]}
          ListHeaderComponent={
            old.length ? (
              <View style={styles.summary} testID="old-stock-summary">
                <Text style={styles.summaryNum}>{old.length}</Text>
                <Text style={styles.summaryText}>
                  artículo(s) parados · <Text style={styles.summaryStrong}>{euro(tiedUp)}</Text> de dinero inmovilizado
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty} testID="old-stock-empty">
              <Icon name="check-decagram" size={56} color={colors.brandPrimary} />
              <Text style={styles.emptyTitle}>Todo en movimiento</Text>
              <Text style={styles.emptyText}>Ningún artículo lleva más de {OLD_STOCK_DAYS} días en stock.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const s = quickSalePrice(item);
            const days = daysInStock(item);
            return (
              <Pressable
                testID={`old-stock-item-${item.id}`}
                onPress={() => router.push({ pathname: "/item/[id]", params: { id: item.id } })}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              >
                <View style={styles.cardTop}>
                  {item.has_photo && dev ? (
                    <Image source={{ uri: photoUrl(item.id, dev) }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <Icon name="image-off-outline" size={24} color={colors.muted} />
                    </View>
                  )}
                  <View style={styles.flex}>
                    <Text style={styles.name} numberOfLines={1}>{item.nombre}</Text>
                    <Text style={styles.meta}>
                      {item.categoria} · Coste {euro(totalCost(item))} · VER {euro(item.ver)}
                    </Text>
                  </View>
                  <View style={styles.days}>
                    <Text style={styles.daysNum}>{days}</Text>
                    <Text style={styles.daysLbl}>días</Text>
                  </View>
                </View>
                <View style={styles.suggest} testID={`old-stock-suggested-${item.id}`}>
                  <View style={styles.flex}>
                    <Text style={styles.suggestLabel}>PRECIO SUGERIDO PARA VENTA RÁPIDA</Text>
                    <Text style={styles.suggestHint}>
                      {s.atCost ? "Recupera lo invertido y libera espacio" : `−${s.discount}% sobre el VER`}
                    </Text>
                  </View>
                  <Text style={styles.suggestPrice}>{euro(s.price)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
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
  flex: { flex: 1 },
  title: { color: c.onSurface, fontSize: 22, fontWeight: "900" },
  subtitle: { color: c.muted, fontSize: 13, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { color: c.error, fontSize: 16, fontWeight: "800", textAlign: "center" },
  list: { padding: 16, gap: 12 },
  grow: { flexGrow: 1 },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: c.error,
  },
  summaryNum: { color: c.onError, fontSize: 36, fontWeight: "900" },
  summaryText: { color: c.onError, fontSize: 15, fontWeight: "700", flex: 1 },
  summaryStrong: { fontWeight: "900" },
  card: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
    gap: 12,
  },
  pressed: { opacity: 0.85 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: c.surfaceTertiary },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  name: { color: c.onSurface, fontSize: 17, fontWeight: "800" },
  meta: { color: c.muted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  days: { minWidth: 56, paddingVertical: 6, borderRadius: 8, backgroundColor: c.error, alignItems: "center" },
  daysNum: { color: c.onError, fontSize: 20, fontWeight: "900" },
  daysLbl: { color: c.onError, fontSize: 11, fontWeight: "800" },
  suggest: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: c.brandTertiary,
    borderWidth: 1,
    borderColor: c.brandSecondary,
  },
  suggestLabel: { color: c.onBrandTertiary, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  suggestHint: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "600", marginTop: 2 },
  suggestPrice: { color: c.brandPrimary, fontSize: 28, fontWeight: "900" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  emptyTitle: { color: c.onSurface, fontSize: 22, fontWeight: "900" },
  emptyText: { color: c.onSurfaceTertiary, fontSize: 15, textAlign: "center" },
}));

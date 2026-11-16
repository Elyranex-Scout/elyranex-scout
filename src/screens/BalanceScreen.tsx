import { Icon } from "@/src/components/Icon";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/src/components/AppHeader";
import { exportData, type ExportFormat } from "@/src/export";
import { fetchItems, totalCost, type Item } from "@/src/inventory";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { euro } from "@/src/verdict";
import { useVertical } from "@/src/vertical";

const r2 = (n: number) => Math.round(n * 100) / 100;

export default function BalanceScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [vertical] = useVertical();
  const isCollectible = vertical === "coleccionismo";

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [showFormats, setShowFormats] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportMsg, setExportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchItems(vertical);
      setItems(res.items);
      setOffline(res.offline);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el balance.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [vertical]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const stats = useMemo(() => {
    const sold = items.filter((i) => i.estado === "Vendido");
    const stock = items.filter((i) => i.estado === "En stock");
    const invested = r2(items.reduce((s, i) => s + totalCost(i), 0));
    const income = r2(sold.reduce((s, i) => s + (i.precio_venta ?? 0) - (i.comisiones ?? 0), 0));
    const stockValue = r2(stock.reduce((s, i) => s + i.ver, 0));

    const coins = items.filter((i) => i.collectible_data?.tipo_pieza === "moneda").length;
    const stamps = items.filter((i) => i.collectible_data?.tipo_pieza === "sello").length;
    const cards = items.filter((i) => i.collectible_data?.tipo_pieza === "carta").length;

    return {
      invested,
      income,
      net: r2(income - invested),
      gain: r2(stockValue - invested),
      stockValue,
      soldCount: sold.length,
      stockCount: stock.length,
      coins,
      stamps,
      cards,
    };
  }, [items]);

  const onExport = async (fmt: ExportFormat) => {
    setExporting(fmt);
    setExportMsg(null);
    try {
      await exportData(fmt);
      setExportMsg({ ok: true, text: `Archivo ${fmt.toUpperCase()} generado` });
    } catch (e) {
      setExportMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudo exportar." });
    } finally {
      setExporting(null);
    }
  };
  const netColor = (isCollectible ? stats.gain : stats.net) >= 0 ? colors.success : colors.error;
  const pending = items.filter((i) => i.pending).length;

  return (
    <View style={styles.root} testID="balance-screen">
      <AppHeader section={isCollectible ? "Valor Colección" : "Balance"} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomChrome + 24 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />
          }
        >
          {error ? (
            <View style={styles.center} testID="balance-error">
              <Text style={styles.errorText}>{error}</Text>
              <Pressable testID="balance-retry" onPress={load} style={styles.retry}>
                <Text style={styles.retryText}>REINTENTAR</Text>
              </Pressable>
            </View>
          ) : null}

          {offline ? (
            <View style={styles.banner} testID="balance-offline-banner">
              <Icon name="cloud-off-outline" size={18} color={colors.onWarning} />
              <Text style={styles.bannerText}>Sin conexión · cifras de los datos guardados</Text>
            </View>
          ) : null}

          {isCollectible ? (
            <>
              <View style={[styles.hero, { borderColor: colors.brandPrimary }]}>
                <Text style={styles.heroLabel}>VALOR ESTIMADO DE COLECCIÓN</Text>
                <Text style={[styles.heroValue, { color: colors.brandPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                  {euro(stats.stockValue)}
                </Text>
                <Text style={styles.heroSub}>
                  Plusvalía latente: {stats.gain >= 0 ? "+" : ""}{euro(stats.gain)}
                </Text>
              </View>

              <View style={styles.grid}>
                <StatCard
                  testID="balance-col-invested"
                  icon="arrow-up-bold-circle"
                  iconColor={colors.error}
                  label="Coste invertido"
                  sub={`${items.length} piezas catalogadas`}
                  value={euro(stats.invested)}
                />
                <StatCard
                  testID="balance-col-breakdown"
                  icon="coins"
                  iconColor={colors.brandPrimary}
                  label="Desglose piezas"
                  sub={`${stats.coins} monedas · ${stats.stamps} sellos · ${stats.cards} cartas`}
                  value={`${items.length}`}
                />
              </View>
            </>
          ) : (
            <>
              <View style={[styles.hero, { borderColor: netColor }]} testID="balance-net-profit">
                <Text style={styles.heroLabel}>BENEFICIO NETO REAL</Text>
                <Text style={[styles.heroValue, { color: netColor }]} testID="balance-net-value" numberOfLines={1} adjustsFontSizeToFit>
                  {stats.net > 0 ? "+" : ""}{euro(stats.net)}
                </Text>
                <Text style={styles.heroSub}>Entradas − Salidas</Text>
              </View>

              <View style={styles.grid}>
                <StatCard
                  testID="balance-stat-invested"
                  icon="arrow-up-bold-circle"
                  iconColor={colors.error}
                  label="Total invertido"
                  sub="Compras + gastos extra"
                  value={euro(stats.invested)}
                />
                <StatCard
                  testID="balance-stat-income"
                  icon="arrow-down-bold-circle"
                  iconColor={colors.success}
                  label="Total ingresado"
                  sub={`${stats.soldCount} ${stats.soldCount === 1 ? "venta" : "ventas"} · neto de comisiones`}
                  value={euro(stats.income)}
                />
                <StatCard
                  testID="balance-stat-stock-value"
                  icon="package-variant-closed"
                  iconColor={colors.brandPrimary}
                  label="Valor del stock"
                  sub={`${stats.stockCount} ${stats.stockCount === 1 ? "artículo" : "artículos"} sin vender`}
                  value={euro(stats.stockValue)}
                  wide
                />
              </View>
            </>
          )}
          <Pressable
            testID="balance-export-button"
            onPress={() => setShowFormats((s) => !s)}
            style={({ pressed }) => [styles.exportBtn, pressed && styles.pressed]}
          >
            <Icon name="microsoft-excel" size={30} color={colors.onBrandPrimary} />
            <Text style={styles.exportText}>EXPORTAR A EXCEL (.xlsx / .csv)</Text>
          </Pressable>

          {showFormats ? (
            <View style={styles.formats} testID="balance-export-formats">
              {(["xlsx", "csv"] as const).map((f) => (
                <Pressable
                  key={f}
                  testID={`balance-export-${f}`}
                  onPress={() => onExport(f)}
                  disabled={!!exporting}
                  style={({ pressed }) => [styles.formatBtn, pressed && styles.pressed]}
                >
                  {exporting === f ? (
                    <ActivityIndicator color={colors.brandPrimary} />
                  ) : (
                    <>
                      <Icon name={f === "xlsx" ? "file-excel" : "file-delimited"} size={26} color={colors.brandPrimary} />
                      <Text style={styles.formatText}>{f === "xlsx" ? "Excel .xlsx" : "CSV"}</Text>
                    </>
                  )}
                </Pressable>
              ))}
            </View>
          ) : null}

          {exportMsg ? (
            <Text style={[styles.exportMsg, { color: exportMsg.ok ? colors.success : colors.error }]} testID="balance-export-message">
              {exportMsg.text}
            </Text>
          ) : null}
          <Text style={styles.hint}>
            Incluye todo tu inventario: ID, fechas, artículo, categoría, origen, costes, estado, venta y beneficio neto.
            {pending ? ` ${pending} compra(s) sin sincronizar se incluirán al recuperar conexión.` : ""}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function StatCard({
  testID,
  icon,
  iconColor,
  label,
  sub,
  value,
  wide,
}: {
  testID: string;
  icon: "arrow-up-bold-circle" | "arrow-down-bold-circle" | "package-variant-closed" | "coins";
  iconColor: string;
  label: string;
  sub: string;
  value: string;
  wide?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.card, wide && styles.cardWide]} testID={testID}>
      <View style={styles.cardHead}>
        <Icon name={icon} size={22} color={iconColor} />
        <Text style={styles.cardLabel} numberOfLines={2}>{label.toUpperCase()}</Text>
      </View>
      <Text style={styles.cardValue} numberOfLines={1} adjustsFontSizeToFit testID={`${testID}-value`}>{value}</Text>
      <Text style={styles.cardSub} numberOfLines={2}>{sub}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  content: { padding: 16, gap: 16 },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: c.warning },
  bannerText: { color: c.onWarning, fontSize: 14, fontWeight: "800", flex: 1 },
  hero: { padding: 20, borderRadius: 20, backgroundColor: c.surfaceSecondary, borderWidth: 2, gap: 4 },
  heroLabel: { color: c.onSurface, fontSize: 14, fontWeight: "900", letterSpacing: 1.5 },
  heroValue: { fontSize: 48, fontWeight: "900" },
  heroSub: { color: c.muted, fontSize: 14, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: { flexBasis: "46%", flexGrow: 1, padding: 16, borderRadius: 12, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: 6 },
  cardWide: { flexBasis: "100%" },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardLabel: { color: c.onSurfaceTertiary, fontSize: 12, fontWeight: "900", letterSpacing: 0.3, flex: 1 },
  cardValue: { color: c.onSurface, fontSize: 28, fontWeight: "900" },
  cardSub: { color: c.muted, fontSize: 12, fontWeight: "600" },
  exportBtn: { minHeight: 76, borderRadius: 12, backgroundColor: c.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16 },
  exportText: { color: c.onBrandPrimary, fontSize: 18, fontWeight: "900", letterSpacing: 0.5, flexShrink: 1 },
  formats: { flexDirection: "row", gap: 12 },
  formatBtn: { flex: 1, height: 64, borderRadius: 12, borderWidth: 2, borderColor: c.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  formatText: { color: c.brandPrimary, fontSize: 18, fontWeight: "900" },
  exportMsg: { fontSize: 15, fontWeight: "800", textAlign: "center" },
  hint: { color: c.muted, fontSize: 13, textAlign: "center", lineHeight: 19 },
  errorText: { color: c.error, fontSize: 16, fontWeight: "800", textAlign: "center" },
  retry: { height: 56, paddingHorizontal: 32, borderRadius: 12, backgroundColor: c.brandPrimary, justifyContent: "center" },
  retryText: { color: c.onBrandPrimary, fontSize: 18, fontWeight: "900" },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
}));

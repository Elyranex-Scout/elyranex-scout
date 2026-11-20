import { Icon } from "@/src/components/Icon";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Image, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, useTheme } from "@/src/theme";
import { useVertical, type Vertical } from "@/src/vertical";

export function AppHeader({ section }: { section: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [vertical, setVertical] = useVertical();

  const openSettings = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/settings");
  };

  const selectVertical = (next: Vertical) => {
    if (vertical === next) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setVertical(next);
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]} testID="app-header">
      <View style={styles.topRow}>
        <View style={styles.brandRow}>
                  <Image
         source={require("../../assets/images/ELYRANEX SCOUT.png")}
         style={styles.logoImage}
         resizeMode="cover"
       />
          <View style={styles.brandText}>
            <Text
              style={styles.title}
              testID="app-header-title"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              ELYRANEX <Text style={styles.titleAccent}>SCOUT</Text>
            </Text>
            <Text style={styles.subtitle} testID="app-header-subtitle">
              by Elyranex · {section}
            </Text>
          </View>
        </View>
        <Pressable
          testID="header-settings-button"
          accessibilityLabel="Abrir configuración"
          onPress={openSettings}
          style={({ pressed }) => [styles.gear, pressed && styles.gearPressed]}
          hitSlop={8}
        >
          <Icon name="cog" size={26} color={colors.onSurface} />
        </Pressable>
      </View>

      <View style={styles.verticalSwitch}>
        <Pressable
          onPress={() => selectVertical("reventa")}
          style={[styles.vTab, vertical === "reventa" && styles.vTabActive]}
        >
          <Icon
            name="shirt"
            size={16}
            color={vertical === "reventa" ? colors.brandPrimaryContrast : colors.muted}
          />
          <Text style={[styles.vTabText, vertical === "reventa" && styles.vTabTextActive]}>
            Reventa / Moda
          </Text>
        </Pressable>

        <Pressable
          onPress={() => selectVertical("coleccionismo")}
          style={[styles.vTab, vertical === "coleccionismo" && styles.vTabActive]}
        >
          <Icon
            name="coins"
            size={16}
            color={vertical === "coleccionismo" ? colors.brandPrimaryContrast : colors.muted}
          />
          <Text style={[styles.vTabText, vertical === "coleccionismo" && styles.vTabTextActive]}>
            Monedas y Sellos
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    gap: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandRow: { flexDirection: "row", alignItems: "center", flex: 1, gap: 12 },
  logoImage: {
    width: 92,
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.brandPrimary,
  },
  brandText: { flex: 1 },
  title: { color: c.onSurface, fontSize: 16, fontWeight: "900", letterSpacing: 0 },
  titleAccent: { color: c.brandPrimary },
  subtitle: { color: c.muted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  gear: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  gearPressed: { backgroundColor: c.surfaceTertiary, transform: [{ scale: 0.95 }] },
  verticalSwitch: {
    flexDirection: "row",
    backgroundColor: c.surfaceSecondary,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: c.border,
    gap: 4,
  },
  vTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 6,
  },
  vTabActive: {
    backgroundColor: c.brandPrimary,
  },
  vTabText: {
    color: c.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  vTabTextActive: {
    color: c.brandPrimaryContrast,
    fontWeight: "800",
  },
}));

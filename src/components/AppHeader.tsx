import { Icon } from "@/src/components/Icon";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Image, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, useTheme } from "@/src/theme";

export function AppHeader({ section }: { section: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const openSettings = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/settings");
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]} testID="app-header">
      <View style={styles.brandRow}>
        <Image
          source={require("../../assets/images/icon.png")}
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
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  brandRow: { flexDirection: "row", alignItems: "center", flex: 1, gap: 12 },
  logoImage: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.brandPrimary,
  },
  brandText: { flex: 1 },
  title: { color: c.onSurface, fontSize: 16, fontWeight: "900", letterSpacing: 0 },
  titleAccent: { color: c.brandPrimary },
  subtitle: { color: c.muted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  gear: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  gearPressed: { backgroundColor: c.surfaceTertiary, transform: [{ scale: 0.95 }] },
}));

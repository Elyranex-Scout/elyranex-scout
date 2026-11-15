import { Icon } from "@/src/components/Icon";
import { Linking, Pressable, Text, View } from "react-native";

import { makeStyles, useTheme } from "@/src/theme";

export function PermissionGate({ canAskAgain, onRequest }: { canAskAgain: boolean; onRequest: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.root} testID="camera-permission-gate">
      <View style={styles.icon}>
        <Icon name="camera" size={48} color={colors.brandPrimary} />
      </View>
      <Text style={styles.title}>Activa la cámara</Text>
      <Text style={styles.text}>
        La necesitamos para fotografiar artículos o leer códigos de barras y decirte al instante si merece la pena comprar.
        Las fotos no se guardan.
      </Text>
      {canAskAgain ? (
        <Pressable testID="camera-permission-allow" onPress={onRequest} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
          <Text style={styles.btnText}>PERMITIR CÁMARA</Text>
        </Pressable>
      ) : (
        <Pressable testID="camera-permission-settings" onPress={() => Linking.openSettings()} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
          <Text style={styles.btnText}>ABRIR AJUSTES</Text>
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16, backgroundColor: c.surface },
  icon: {
    width: 96,
    height: 96,
    borderRadius: 20,
    backgroundColor: c.brandTertiary,
    borderWidth: 1,
    borderColor: c.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: c.onSurface, fontSize: 26, fontWeight: "900" },
  text: { color: c.onSurfaceTertiary, fontSize: 16, textAlign: "center", lineHeight: 22 },
  btn: {
    alignSelf: "stretch",
    height: 68,
    borderRadius: 12,
    backgroundColor: c.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: c.onBrandPrimary, fontSize: 20, fontWeight: "900", letterSpacing: 1 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
}));

import { Text, TextInput, View } from "react-native";

import { cleanEuro } from "@/src/inventory";
import { makeStyles, useTheme } from "@/src/theme";

export function EuroInput({
  label,
  value,
  onChange,
  testID,
  placeholder = "0",
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testID: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.box}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={(t) => onChange(cleanEuro(t))}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          autoFocus={autoFocus}
          style={styles.input}
        />
        <Text style={styles.euro}>€</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { gap: 8 },
  label: { color: c.onSurface, fontSize: 16, fontWeight: "800" },
  box: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.borderStrong,
    backgroundColor: c.surfaceTertiary,
    paddingHorizontal: 16,
  },
  input: { flex: 1, height: "100%", color: c.onSurface, fontSize: 28, fontWeight: "900", padding: 0 },
  euro: { color: c.brandPrimary, fontSize: 26, fontWeight: "900", marginLeft: 6 },
}));

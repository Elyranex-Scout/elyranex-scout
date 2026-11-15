import { Pressable, Text, View } from "react-native";

import { makeStyles } from "@/src/theme";

// Big 2-column option picker for one-hand use (origin, platform…).
export function OptionGrid<T extends string>({
  options,
  value,
  onChange,
  testPrefix,
}: {
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
  testPrefix: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.grid}>
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable
            key={o}
            testID={`${testPrefix}-${o.toLowerCase()}`}
            onPress={() => onChange(o)}
            style={[styles.opt, active && styles.optActive]}
          >
            <Text style={[styles.text, active && styles.textActive]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  opt: {
    flexBasis: "48%",
    flexGrow: 1,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.borderStrong,
    backgroundColor: c.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  optActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  text: { color: c.onSurface, fontSize: 17, fontWeight: "800" },
  textActive: { color: c.onBrandPrimary },
}));

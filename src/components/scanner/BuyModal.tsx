import { Icon } from "@/src/components/Icon";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EuroInput } from "@/src/components/EuroInput";
import { OptionGrid } from "@/src/components/OptionGrid";
import { ORIGINS, parseEuro, type Origin } from "@/src/inventory";
import { makeStyles, useTheme } from "@/src/theme";

type Props = {
  visible: boolean;
  defaultPrice: string;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (price: number, origin: Origin) => void;
};

export function BuyModal({ visible, defaultPrice, saving, error, onCancel, onConfirm }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [price, setPrice] = useState(defaultPrice);
  const [origin, setOrigin] = useState<Origin>("Mercadillo");
  const [localErr, setLocalErr] = useState("");

  useEffect(() => {
    if (visible) {
      setPrice(defaultPrice);
      setLocalErr("");
    }
  }, [visible, defaultPrice]);

  const submit = () => {
    const n = parseEuro(price);
    if (!price || Number.isNaN(n)) return setLocalErr("Introduce el precio pagado.");
    setLocalErr("");
    onConfirm(n, origin);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <Pressable style={styles.flex} onPress={onCancel} testID="buy-modal-backdrop" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="buy-modal">
          <View style={styles.head}>
            <Text style={styles.title}>Guardar compra</Text>
            <Pressable testID="buy-modal-close" onPress={onCancel} style={styles.close}>
              <Icon name="close" size={26} color={colors.onSurface} />
            </Pressable>
          </View>
          <EuroInput label="Precio pagado (€)" value={price} onChange={setPrice} testID="buy-price-input" autoFocus={!defaultPrice} />
          <View style={styles.gap}>
            <Text style={styles.label}>Origen</Text>
            <OptionGrid options={ORIGINS} value={origin} onChange={setOrigin} testPrefix="buy-origin" />
          </View>
          {localErr || error ? <Text style={styles.error} testID="buy-modal-error">{localErr || error}</Text> : null}
          <Pressable
            testID="buy-confirm-button"
            onPress={submit}
            disabled={saving}
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          >
            {saving ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <Icon name="content-save" size={26} color={colors.onBrandPrimary} />
                <Text style={styles.ctaText}>GUARDAR EN INVENTARIO</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" },
  flex: { flex: 1 },
  sheet: {
    backgroundColor: c.surfaceSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: c.borderStrong,
    padding: 16,
    gap: 12,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: c.onSurface, fontSize: 24, fontWeight: "900" },
  close: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  gap: { gap: 8 },
  label: { color: c.onSurface, fontSize: 16, fontWeight: "800" },
  error: { color: c.error, fontSize: 15, fontWeight: "700" },
  cta: {
    height: 64,
    borderRadius: 12,
    backgroundColor: c.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  ctaText: { color: c.onBrandPrimary, fontSize: 20, fontWeight: "900", letterSpacing: 1 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
}));

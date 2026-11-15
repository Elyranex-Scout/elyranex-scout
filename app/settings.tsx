import { Icon } from "@/src/components/Icon";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { testConnection } from "@/src/ai";
import { BackupSection } from "@/src/components/BackupSection";
import { DEFAULT_MIN_PROFIT, AI_KEY, MIN_PROFIT_KEY, loadAiKey, loadMinProfit } from "@/src/settings";
import { makeStyles, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

const MAX_PROFIT = 9999;

export default function SettingsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [profit, setProfit] = useState(DEFAULT_MIN_PROFIT);
  const [profitText, setProfitText] = useState(String(DEFAULT_MIN_PROFIT));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const onTest = async () => {
    const key = apiKey.trim();
    if (!key) {
      setTestResult({ ok: false, msg: "Introduce tu API Key de Groq." });
      return;
    }
    setTesting(true);
    setTestResult(null);
    // Save the key as soon as the user tests it.
    await storage.secureSet(AI_KEY, key);
    try {
      const model = await testConnection(key);
      setTestResult({ ok: true, msg: `Conexión correcta · modelo detectado: ${model}` });
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : "No se pudo conectar." });
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    loadAiKey().then(setApiKey);
    loadMinProfit().then((v) => {
      setProfit(v);
      setProfitText(String(v));
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const tap = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
  };

  const updateProfit = (v: number) => {
    const clamped = Math.max(0, Math.min(MAX_PROFIT, v));
    setProfit(clamped);
    setProfitText(String(clamped));
  };

  const onProfitText = (t: string) => {
    const digits = t.replace(/[^0-9]/g, "");
    setProfitText(digits);
    if (digits) setProfit(Math.min(MAX_PROFIT, parseInt(digits, 10)));
  };

  const onSave = async () => {
    const key = apiKey.trim();
    setError("");
    const finalProfit = profitText ? profit : 0;
    const ok1 = key ? await storage.secureSet(AI_KEY, key) : await storage.secureRemove(AI_KEY);
    const ok2 = await storage.setItem(MIN_PROFIT_KEY, finalProfit);
    if (!ok1 || !ok2) {
      setError("No se pudo guardar. Inténtalo de nuevo.");
      return;
    }
    updateProfit(finalProfit);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaved(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 2000);
  };

  return (
    <View style={styles.root} testID="settings-modal">
      <View style={[styles.header, { paddingTop: (Platform.OS === "ios" ? 16 : insets.top + 12) }]}>
        <Text style={styles.title}>Configuración</Text>
        <Pressable
          testID="settings-close-button"
          accessibilityLabel="Cerrar"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/scanner"))}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <Icon name="close" size={28} color={colors.onSurface} />
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={styles.section}>
          <View style={styles.labelRow}>
            <Icon name="key-variant" size={20} color={colors.brandPrimary} />
            <Text style={styles.label}>API Key de Groq (gsk_...)</Text>
          </View>
          <View style={styles.inputRow}>
            <TextInput
              testID="settings-groq-key-input"
              value={apiKey}
              onChangeText={(t) => {
                setApiKey(t);
                setError("");
              }}
              placeholder="gsk_..."
              placeholderTextColor={colors.muted}
              secureTextEntry={!showKey}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              style={styles.input}
            />
            <Pressable
              testID="settings-toggle-key-visibility"
              accessibilityLabel={showKey ? "Ocultar clave" : "Mostrar clave"}
              onPress={() => setShowKey((s) => !s)}
              style={styles.eye}
            >
              <Icon name={showKey ? "eye-off" : "eye"} size={26} color={colors.onSurface} />
            </Pressable>
          </View>
          <View style={styles.labelRow}>
            <Icon name="shield-lock" size={16} color={colors.muted} />
            <Text style={styles.help}>Se guarda cifrada solo en este teléfono.</Text>
          </View>
          <Pressable
            testID="settings-test-groq-button"
            onPress={onTest}
            disabled={testing}
            style={({ pressed }) => [styles.testBtn, pressed && styles.pressed]}
          >
            {testing ? (
              <ActivityIndicator color={colors.brandPrimary} />
            ) : (
              <>
                <Icon name="lan-connect" size={24} color={colors.brandPrimary} />
                <Text style={styles.testText}>Probar conexión con Groq</Text>
              </>
            )}
          </Pressable>
          {testResult ? (
            <View style={styles.labelRow} testID="settings-test-result">
              <Icon
                name={testResult.ok ? "check-circle" : "alert-circle"}
                size={20}
                color={testResult.ok ? colors.success : colors.error}
              />
              <Text style={[styles.testMsg, { color: testResult.ok ? colors.success : colors.error }]}>
                {testResult.msg}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <View style={styles.labelRow}>
            <View style={styles.dot} />
            <Text style={styles.label}>Beneficio mínimo para Luz Verde (€)</Text>
          </View>
          <View style={styles.stepper}>
            <Pressable
              testID="settings-profit-decrement"
              accessibilityLabel="Restar 1 €"
              onPress={() => {
                tap();
                updateProfit(profit - 1);
              }}
              style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
            >
              <Icon name="minus" size={32} color={colors.onSurface} />
            </Pressable>
            <View style={styles.valueBox}>
              <TextInput
                testID="settings-profit-input"
                value={profitText}
                onChangeText={onProfitText}
                onBlur={() => updateProfit(profitText ? profit : 0)}
                keyboardType="number-pad"
                maxLength={4}
                style={[styles.value, { width: Math.max(1, profitText.length) * 24 + 12 }]}
              />
              <Text style={styles.euro}>€</Text>
            </View>
            <Pressable
              testID="settings-profit-increment"
              accessibilityLabel="Sumar 1 €"
              onPress={() => {
                tap();
                updateProfit(profit + 1);
              }}
              style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
            >
              <Icon name="plus" size={32} color={colors.onSurface} />
            </Pressable>
          </View>
          <Text style={styles.help}>
            El escáner mostrará Luz Verde cuando el beneficio estimado sea igual o mayor.
          </Text>
        </View>

        {error ? (
          <Text style={styles.error} testID="settings-error">{error}</Text>
        ) : null}

        <Pressable
          testID="settings-save-button"
          onPress={onSave}
          style={({ pressed }) => [styles.save, saved && styles.saveDone, pressed && styles.pressed]}
        >
          <Icon name={saved ? "check-bold" : "content-save"} size={26} color={colors.onBrandPrimary} />
          <Text style={styles.saveText} testID="settings-save-label">{saved ? "GUARDADO" : "GUARDAR"}</Text>
        </Pressable>

        <BackupSection />
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  title: { color: c.onSurface, fontSize: 26, fontWeight: "900" },
  close: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  content: { padding: 16, gap: 24 },
  section: { gap: 12 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { color: c.onSurface, fontSize: 17, fontWeight: "800", flexShrink: 1 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 60,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    backgroundColor: c.surfaceTertiary,
    paddingLeft: 16,
  },
  input: { flex: 1, height: "100%", color: c.onSurface, fontSize: 17, fontWeight: "600" },
  eye: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  help: { color: c.muted, fontSize: 13, flexShrink: 1 },
  testBtn: {
    height: 60,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  testText: { color: c.brandPrimary, fontSize: 17, fontWeight: "900" },
  testMsg: { fontSize: 14, fontWeight: "700", flexShrink: 1 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: c.success },
  stepper: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepBtn: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    backgroundColor: c.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  valueBox: {
    flex: 1,
    height: 72,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.brandPrimary,
    backgroundColor: c.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    color: c.brandPrimary,
    fontSize: 36,
    fontWeight: "900",
    textAlign: "center",
    padding: 0,
  },
  euro: { color: c.brandPrimary, fontSize: 28, fontWeight: "900", marginLeft: 4 },
  error: { color: c.error, fontSize: 15, fontWeight: "700" },
  save: {
    height: 68,
    borderRadius: 12,
    backgroundColor: c.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  saveDone: { backgroundColor: c.success },
  saveText: { color: c.onBrandPrimary, fontSize: 22, fontWeight: "900", letterSpacing: 2 },
}));

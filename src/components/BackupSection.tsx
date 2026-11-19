import { Icon } from "@/src/components/Icon";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from "react-native";

import { createBackupCode, exportBackupJson, importBackupJson, restoreBackup } from "@/src/inventory";
import { makeStyles, useTheme } from "@/src/theme";

type Msg = { ok: boolean; text: string } | null;

export function BackupSection() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [code, setCode] = useState<{ code: string; items: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [input, setInput] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const generate = async () => {
    setGenerating(true);
    setMsg(null);
    try {
      const r = await createBackupCode();
      setCode({ code: r.code, items: r.items });
      setCopied(false);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudo generar el código." });
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const restore = async () => {
      const downloadFileBackup = async () => {
    setMsg(null);
    try {
      const jsonStr = await exportBackupJson();
      if (Platform.OS === "web" && typeof document !== "undefined") {
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const stamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `elyranex-backup-${stamp}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setMsg({ ok: true, text: "Copia de seguridad descargada (.json con fotos)." });
      } else {
        await Clipboard.setStringAsync(jsonStr);
        setMsg({ ok: true, text: "Copia JSON copiada al portapapeles." });
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudo exportar la copia." });
    }
  };

  const uploadFileBackup = () => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      setMsg({ ok: false, text: "Usa el código ELX en app nativa." });
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files?.item(0);
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const text = typeof reader.result === "string" ? reader.result : "";
          const res = await importBackupJson(text);
          setMsg({ ok: true, text: `Restauración lista: ${res.added} pieza(s) nuevas añadidas (${res.total} en total).` });
        } catch (e) {
          setMsg({ ok: false, text: e instanceof Error ? e.message : "Archivo JSON no válido." });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

    setRestoring(true);
    setMsg(null);
    try {
      const r = await restoreBackup(input.trim());
      setMsg({ ok: true, text: `Inventario recuperado: ${r.items} artículo(s) en este teléfono.` });
      setInput("");
      setConfirming(false);
      setCode(null);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudo restaurar." });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <View style={styles.section} testID="backup-section">
      <View style={styles.labelRow}>
        <Icon name="cellphone-arrow-down" size={20} color={colors.brandPrimary} />
        <Text style={styles.label}>Copia de seguridad</Text>
      </View>
      <Text style={styles.help}>
        Genera un código en el teléfono antiguo y escríbelo en el nuevo para mover todo tu inventario. Vale 24 h y un solo uso.
      </Text>

      {code ? (
        <View style={styles.codeBox} testID="backup-code-box">
          <Text style={styles.code} selectable testID="backup-code">{code.code}</Text>
          <Text style={styles.codeSub}>{code.items} artículo(s) · caduca en 24 h</Text>
          <Pressable testID="backup-copy-button" onPress={copy} style={({ pressed }) => [styles.copyBtn, pressed && styles.pressed]}>
            <Icon name={copied ? "check" : "content-copy"} size={20} color={colors.onBrandPrimary} />
            <Text style={styles.copyText}>{copied ? "COPIADO" : "COPIAR CÓDIGO"}</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        testID="backup-generate-button"
        onPress={generate}
        disabled={generating}
        style={({ pressed }) => [styles.outline, pressed && styles.pressed]}
      >
        {generating ? (
          <ActivityIndicator color={colors.brandPrimary} />
        ) : (
          <>
            <Icon name="key-chain-variant" size={22} color={colors.brandPrimary} />
            <Text style={styles.outlineText}>{code ? "GENERAR OTRO CÓDIGO" : "GENERAR CÓDIGO DE RESPALDO"}</Text>
          </>
        )}
      </Pressable>

      <Text style={styles.subLabel}>Restaurar en este teléfono</Text>
      <TextInput
        testID="backup-restore-input"
        value={input}
        onChangeText={(t) => {
          setInput(t.toUpperCase());
          setConfirming(false);
        }}
        placeholder="ELX-XXXXX-XXXXX"
        placeholderTextColor={colors.muted}
        autoCapitalize="characters"
        autoCorrect={false}
        spellCheck={false}
        maxLength={20}
        style={styles.input}
      />
      {confirming ? (
        <View style={styles.confirm} testID="backup-restore-confirm">
          <Text style={styles.confirmText}>
            Este teléfono pasará a usar el inventario del código. Lo que ya tengas aquí se añadirá a él.
          </Text>
          <View style={styles.row}>
            <Pressable testID="backup-restore-cancel" onPress={() => setConfirming(false)} style={[styles.half, styles.ghost]}>
              <Text style={styles.ghostText}>CANCELAR</Text>
            </Pressable>
            <Pressable testID="backup-restore-confirm-button" onPress={restore} disabled={restoring} style={[styles.half, styles.solid]}>
              {restoring ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.solidText}>RESTAURAR</Text>}
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          testID="backup-restore-button"
          onPress={() => (input.replace(/[^A-Z0-9]/g, "").length >= 10 ? setConfirming(true) : setMsg({ ok: false, text: "Escribe el código completo." }))}
          style={({ pressed }) => [styles.outline, pressed && styles.pressed]}
        >
          <Icon name="backup-restore" size={22} color={colors.brandPrimary} />
          <Text style={styles.outlineText}>RECUPERAR INVENTARIO</Text>
        </Pressable>
      )}
      <Text style={styles.subLabel}>Archivo permanente (con fotos, sin caducidad)</Text>
      <Pressable onPress={downloadFileBackup} style={({ pressed }) => [styles.outline, pressed && styles.pressed]}>
        <Icon name="content-save" size={22} color={colors.brandPrimary} />
        <Text style={styles.outlineText}>DESCARGAR COPIA (.JSON)</Text>
      </Pressable>
      <Pressable onPress={uploadFileBackup} style={({ pressed }) => [styles.outline, pressed && styles.pressed]}>
        <Icon name="folder-open" size={22} color={colors.brandPrimary} />
        <Text style={styles.outlineText}>RESTAURAR ARCHIVO (.JSON)</Text>
      </Pressable>

      {msg ? (
        <Text style={[styles.msg, { color: msg.ok ? colors.success : colors.error }]} testID="backup-message">{msg.text}</Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  section: { gap: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.border },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 16 },
  label: { color: c.onSurface, fontSize: 17, fontWeight: "800" },
  subLabel: { color: c.onSurface, fontSize: 15, fontWeight: "800", marginTop: 4 },
  help: { color: c.muted, fontSize: 13, lineHeight: 18 },
  codeBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.brandPrimary,
    backgroundColor: c.surface,
    alignItems: "center",
    gap: 8,
  },
  code: { color: c.brandPrimary, fontSize: 26, fontWeight: "900", letterSpacing: 1.5 },
  codeSub: { color: c.muted, fontSize: 13, fontWeight: "700" },
  copyBtn: {
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: c.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  copyText: { color: c.onBrandPrimary, fontSize: 15, fontWeight: "900" },
  outline: {
    height: 60,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 12,
  },
  outlineText: { color: c.brandPrimary, fontSize: 16, fontWeight: "900", flexShrink: 1 },
  input: {
    height: 60,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    backgroundColor: c.surfaceTertiary,
    paddingHorizontal: 16,
    color: c.onSurface,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 1,
  },
  confirm: { gap: 12, padding: 12, borderRadius: 12, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.warning },
  confirmText: { color: c.onSurface, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  row: { flexDirection: "row", gap: 8 },
  half: { flex: 1, height: 56, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  ghost: { borderWidth: 2, borderColor: c.borderStrong },
  ghostText: { color: c.onSurface, fontSize: 15, fontWeight: "900" },
  solid: { backgroundColor: c.brandPrimary },
  solidText: { color: c.onBrandPrimary, fontSize: 15, fontWeight: "900" },
  msg: { fontSize: 14, fontWeight: "800" },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
}));

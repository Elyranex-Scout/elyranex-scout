// Design tokens for Elyranex Scout. Dark-only, high contrast (sunlight readable).
// Keys match the "color" block of /app/design_guidelines.json.

import { useMemo } from "react";
import { Appearance, StyleSheet } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#0A0A0A",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#1A1A1A",
  onSurfaceSecondary: "#F0F0F0",
  surfaceTertiary: "#262626",
  onSurfaceTertiary: "#E0E0E0",
  surfaceInverse: "#EAEAEA",
  onSurfaceInverse: "#0A0A0A",
  muted: "#888888",

  brand: "#39FF14",
  onBrand: "#000000",
  brandPrimary: "#39FF14",
  onBrandPrimary: "#000000",
  brandSecondary: "#1B800A",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#0D2A05",
  onBrandTertiary: "#39FF14",

  success: "#39FF14",
  onSuccess: "#000000",
  warning: "#FFD600",
  onWarning: "#000000",
  error: "#FF2E2E",
  onError: "#FFFFFF",
  info: "#E0E0E0",
  onInfo: "#0A0A0A",

  border: "#333333",
  borderStrong: "#555555",
  divider: "#222222",
};

export type ThemeColors = typeof dark;

export const defaultScheme = "dark" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark: ThemeColors } = { light: dark, dark };

export const colors = dark;

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

// App is dark-only: pin native chrome to dark.
setColorScheme?.("dark");

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  return { scheme: "dark", colors: dark };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

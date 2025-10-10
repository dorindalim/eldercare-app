import { useMemo } from "react";
import { useAppSettings } from "../Providers/SettingsProvider";

export type TextVariant =
  | "display"
  | "h1"
  | "h2"
  | "h3"
  | "subtitle"
  | "body"
  | "body2"
  | "caption"
  | "overline"
  | "button"
  | "label";

const BASE_MD: Record<TextVariant, number> = {
  display: 34,
  h1: 28,
  h2: 22,
  h3: 18,
  subtitle: 16,
  body: 16,
  body2: 15,
  caption: 13,
  overline: 12,
  button: 16,
  label: 14,
};

const DELTA_BY_SCALE = {
  md: 0,
  lg: 2,
  xl: 4,
};

const LH_RATIO = 1.3;

export function useTypography() {
  const { textScale } = useAppSettings();
  const delta = DELTA_BY_SCALE[textScale] ?? 0;

  return useMemo(() => {
    const fontSize = (variant: TextVariant) => {
      const base = BASE_MD[variant] ?? 16;
      const size = base + delta;
      return size;
    };

    const lineHeight = (variant: TextVariant) => {
      const fs = fontSize(variant);
      return Math.round(fs * LH_RATIO);
    };

    const style = (variant: TextVariant, extra?: object) => ({
      fontSize: fontSize(variant),
      lineHeight: lineHeight(variant),
      color: "#111827",
      ...(extra || {}),
    });

    return { fontSize, lineHeight, style, scale: textScale };
  }, [textScale, delta]);
}
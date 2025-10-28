import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

export type LangCode = "en" | "zh" | "ms" | "ta";

type Props = {
  onBack?: () => void;

  langShort?: string;
  onOpenLanguage?: () => void;

  backLeftInset?: number;
  leftAccessory?: React.ReactNode;
  rightAccessory?: React.ReactNode;
  maxWidth?: number;
  horizontalPadding?: number;
  style?: ViewStyle;
  contentStyle?: ViewStyle;

  progress?: number;
  progressHeight?: number;
  progressRadius?: number;
  progressTrackColor?: string;
  progressFillColor?: string;
  progressBorderColor?: string;
  progressBorderWidth?: number;
};

export default function AuthTopBar({
  onBack,
  langShort,
  onOpenLanguage,
  backLeftInset = 0,
  leftAccessory,
  rightAccessory,
  maxWidth,
  horizontalPadding,
  style,
  contentStyle,

  progress,
  progressHeight = 12,
  progressRadius = 6,
  progressTrackColor = "#FFFFFF",
  progressFillColor = "#93E6AA",
  progressBorderColor = "#111827",
  progressBorderWidth = 2,
}: Props) {
  const showLang = !!(langShort && onOpenLanguage);
  const showProgress = typeof progress === "number";

  const pct = Math.max(0, Math.min(1, progress ?? 0));

  return (
    <View style={[s.rowOuter, style]}>
      <View
        style={[
          s.rowInner,
          { alignSelf: "center", width: "100%" },
          maxWidth ? { maxWidth } : null,
          horizontalPadding ? { paddingHorizontal: horizontalPadding } : null,
          contentStyle,
        ]}
      >
        {/* Left */}
        <View style={[s.left, backLeftInset ? { marginLeft: backLeftInset } : null]}>
          {leftAccessory ?? (
            onBack ? (
              <Pressable onPress={onBack} accessibilityRole="button" style={s.backBtn}>
                <Ionicons name="arrow-back-outline" size={24} color="#111827" />
              </Pressable>
            ) : (
              <View style={{ width: 24, height: 24 }} />
            )
          )}
        </View>

        {/* Center */}
        <View style={s.center}>
          {showProgress ? (
            <View
              style={[
                s.progressTrack,
                {
                  height: progressHeight,
                  borderRadius: progressRadius,
                  backgroundColor: progressTrackColor,
                  borderColor: progressBorderColor,
                  borderWidth: progressBorderWidth,
                },
              ]}
            >
              <View
                style={[
                  s.progressFill,
                  {
                    width: `${pct * 100}%`,
                    borderRadius: progressRadius - 1,
                    backgroundColor: progressFillColor,
                  },
                ]}
              />
            </View>
          ) : (
            <View style={{ height: progressHeight }} />
          )}
        </View>

        {/* Right */}
        <View style={s.right}>
          {rightAccessory}
          {showLang && (
            <Pressable onPress={onOpenLanguage} accessibilityRole="button" style={s.langChip}>
              <Text style={s.langText}>{langShort}</Text>
              <Ionicons name="chevron-down" size={14} color="#000" style={{ marginLeft: 6 }} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  rowOuter: {
    marginTop: 4,
    marginBottom: 8,
  },
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  left: { flexShrink: 0 },
  backBtn: { paddingVertical: 6, paddingHorizontal: 2 },
  center: {
    flex: 1,
    paddingHorizontal: 12, 
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  progressTrack: {
    width: "100%",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
  },

  langChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FED787",
    borderColor: "rgba(0,0,0,0.2)",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  langText: { color: "#000", fontWeight: "800", fontSize: 12 },
});

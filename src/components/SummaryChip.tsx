import { StyleSheet, View, ViewStyle } from "react-native";
import AppText from "./AppText";

type Variant = "indigo" | "gray" | "amber" | "green";

export type SummaryChipItem = string;

type Props = {
  text?: string;
  items?: SummaryChipItem[];
  separator?: string;
  maxLines?: number;
  variant?: Variant;
  dense?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  onItemPress?: (item: string) => void; 
};

const palette: Record<Variant, { bg: string; border: string; text: string }> = {
  indigo: { bg: "#EEF2FF", border: "#E5E7EB", text: "#6B7280" },
  gray:   { bg: "#F3F4F6", border: "#E5E7EB", text: "#6B7280" },
  amber:  { bg: "#FEF3C7", border: "#FDE68A", text: "#92400E" },
  green:  { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46" },
};

export default function SummaryChip({
  text,
  items,
  separator = " · ",
  maxLines = 1,
  variant = "indigo",
  dense = false,
  style,
  accessibilityLabel,
  onItemPress,
}: Props) {
  const content = (items?.length ? items.filter(Boolean).join(separator) : text) ?? "";
  const colors = palette[variant];

  return (
    <View
      style={[
        styles.wrap,
        dense ? styles.dense : styles.normal,
        { backgroundColor: colors.bg, borderColor: colors.border },
        style,
      ]}
      pointerEvents="none"
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? content}
    >
      <AppText variant="caption" numberOfLines={maxLines} color={colors.text}>
        {content}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 10,
  },
  normal: { paddingVertical: 6, paddingHorizontal: 10 },
  dense: { paddingVertical: 4, paddingHorizontal: 8 },
});
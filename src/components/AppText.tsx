import { Text, TextProps } from "react-native";
import { useAppSettings } from "../Providers/SettingsProvider";

type Variant = "h1" | "h2" | "title" | "label" | "body" | "button" | "caption";

const SIZES: Record<"md" | "lg" | "xl", Record<Variant, number>> = {
  md: {
    h1: 28,
    h2: 22,
    title: 20,
    label: 16,
    body: 16,
    button: 16,
    caption: 13,
  },
  lg: {
    h1: 30,
    h2: 24,
    title: 22,
    label: 18,
    body: 18,
    button: 18,
    caption: 14,
  },
  xl: {
    h1: 32,
    h2: 26,
    title: 24,
    label: 20,
    body: 20,
    button: 20,
    caption: 15,
  },
};

type Props = TextProps & {
  variant?: Variant;
  weight?: "400" | "600" | "700" | "800" | "900";
  color?: string;
};

export default function AppText({
  children,
  variant = "body",
  weight = "700",
  color = "#111827",
  style,
  ...rest
}: Props) {
  const { textScale } = useAppSettings();
  const fontSize = SIZES[textScale][variant];
  return (
    <Text
      {...rest}
      style={[
        {
          fontSize,
          color,
          fontWeight: weight as any,
          includeFontPadding: false,
          textAlignVertical: "center",
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

export type LangCode = "en" | "zh" | "ms" | "ta";

export const LANGS: { code: LangCode; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "zh", label: "中文" },
  { code: "ms", label: "BM" },
  { code: "ta", label: "தமிழ்" },
];

type Props = {
  language: LangCode;
  setLanguage: (code: LangCode) => void;
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
};

export default function AuthTopBar({
  language,
  setLanguage,
  title = "",
  showBack,
  onBack,
}: Props) {
  const router = useRouter();
  const { t } = useTranslation();

  const canGoBack =
    typeof showBack === "boolean" ? showBack : router.canGoBack();

  const handleBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
  };

  return (
    <View style={s.topBar} accessibilityHint={t("settings.hint")}>
      {/* Left: Back */}
      <View style={{ width: 40, height: 40, justifyContent: "center" }}>
        {canGoBack && (
          <Pressable
            onPress={handleBack}
            style={s.iconBtn}
            hitSlop={10}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </Pressable>
        )}
      </View>

      {/* Center: Title */}
      <View style={s.center}>
        {!!title && <Text style={s.title}>{title}</Text>}
      </View>

      {/* Right: Language */}
      <View style={s.rightRow}>
        {LANGS.map((l) => {
          const active = language?.startsWith(l.code);
          return (
            <Pressable
              key={l.code}
              onPress={() => setLanguage(l.code)}
              accessibilityLabel={`${t("settings.switchTo")} ${l.label}`}
              style={[s.langChip, active && s.langChipActive]}
              hitSlop={6}
            >
              <Text style={[s.langText, active && s.langTextActive]}>
                {l.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "700", color: "#111827" },
  rightRow: { flexDirection: "row", alignItems: "center" },
  langChip: {
    borderWidth: 1,
    borderColor: "#D0D5DD",
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 6 : 5,
    borderRadius: 14,
    backgroundColor: "#FFF",
    minWidth: 40,
    alignItems: "center",
    marginLeft: 8,
  },
  langChipActive: { backgroundColor: "#111827", borderColor: "#111827" },
  langText: { fontSize: 12, fontWeight: "700", color: "#111827" },
  langTextActive: { color: "#FFFFFF" },
});

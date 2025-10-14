import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  titleKey?: string;

  bgColor?: string;
  textColor?: string;
  borderColor?: string;
  barHeight?: number;
  topPadding?: number;
  bottomRadius?: number;

  curveDown?: boolean;
  curveDepth?: number;
  cutoutColor?: string;

  onOpenProfile?: () => void;
  onLogout?: () => Promise<void> | void;

  includeTopInset?: boolean;

  leftMode?: "settings" | "back";
  backTo?: Href;       
  onBack?: () => void;   
};

export default function TopBar({
  language,
  setLanguage,
  title,
  titleKey,
  bgColor = "#FFFFFF",
  textColor = "#111827",
  borderColor = "#E5E7EB",
  onOpenProfile,
  onLogout,
  includeTopInset = false,
  barHeight = 56,
  topPadding = 6,
  bottomRadius = 12,
  curveDown = false,
  curveDepth = 100,
  cutoutColor = "#F8FAFC",
  leftMode = "settings",
  backTo,
  onBack,
}: Props) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const activeLang = useMemo(
    () => (LANGS.find((l) => language?.startsWith(l.code))?.code ?? "en") as LangCode,
    [language]
  );

  const resolvedTitle = titleKey ? t(titleKey) : (title ?? "");

  const topInset = includeTopInset ? insets.top : 0;
  const resolvedBarHeight = barHeight;
  const resolvedTopPadding = topPadding;

  return (
    <View
      style={[
        s.topBar,
        {
          backgroundColor: bgColor,
          borderBottomColor: borderColor,
          borderBottomLeftRadius: curveDown ? 0 : bottomRadius,
          borderBottomRightRadius: curveDown ? 0 : bottomRadius,
          overflow: curveDown ? "visible" : Platform.OS === "android" ? "hidden" : undefined,
          height: resolvedBarHeight + topInset,
          paddingTop: topInset + resolvedTopPadding,
        },
      ]}
    >
      {leftMode === "back" ? (
        <Pressable
          accessibilityLabel={t("common.back", "Back")}
          hitSlop={8}
          onPress={() => {
            if (onBack) onBack();
            else if (backTo) router.push(backTo);
            else router.back();
          }}
          style={{ padding: 4 }}
        >
          <Ionicons name="chevron-back" size={26} color={textColor} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel={t("settings.title")}
          accessibilityHint={t("settings.hint")}
          hitSlop={8}
          onPress={() => setMenuOpen(true)}
          style={{ padding: 4 }}
        >
          <Ionicons name="settings-outline" size={24} color={textColor} />
        </Pressable>
      )}

      <View style={s.center}>
        {!!resolvedTitle && <Text style={[s.title, { color: textColor }]}>{resolvedTitle}</Text>}
      </View>

      <Pressable
        onPress={() => {
          if (onOpenProfile) onOpenProfile();
          else router.push("/tabs/Profile");
        }}
        accessibilityLabel={t("profile.open", "Open profile")}
        hitSlop={8}
        style={{ padding: 4 }}
      >
        <Ionicons name="person-circle-outline" size={30} color={textColor} />
      </Pressable>

      {leftMode === "settings" && (
        <Modal
          visible={menuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuOpen(false)}
        >
          <Pressable style={s.backdrop} onPress={() => setMenuOpen(false)} />

          <View style={[s.menu, { borderColor, top: resolvedBarHeight + topInset + 8 }]}>
            <Text style={[s.menuHeader, { color: textColor }]}>
              {t("settings.title", "Settings")}
            </Text>

            <Text style={[s.menuLabel, { color: textColor }]}>
              {t("settings.language", "Language")}
            </Text>

            <View style={s.langRow}>
              {LANGS.map((l) => {
                const isActive = activeLang === l.code;
                return (
                  <Pressable
                    key={l.code}
                    onPress={() => {
                      setLanguage(l.code);
                      setMenuOpen(false);
                    }}
                    style={[
                      s.langChip,
                      isActive && { backgroundColor: "#111827", borderColor: "#111827" },
                    ]}
                    accessibilityLabel={t("settings.switchTo", "Switch language to") + " " + l.label}
                  >
                    <Text style={[s.langText, isActive && { color: "#FFFFFF" }]}>{l.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={[s.divider, { backgroundColor: borderColor }]} />

            {!!onLogout && (
              <Pressable
                onPress={async () => {
                  setMenuOpen(false);
                  await onLogout();
                }}
                style={s.rowBtn}
                accessibilityRole="button"
                accessibilityLabel={t("settings.logout", "Log out")}
              >
                <Ionicons
                  name="log-out-outline"
                  size={20}
                  color="#B91C1C"
                  style={{ marginRight: 8 }}
                />

                {curveDown && (
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      left: "50%",
                      marginLeft: -curveDepth / 2,
                      bottom: -curveDepth / 2,
                      width: curveDepth,
                      height: curveDepth,
                      backgroundColor: cutoutColor,
                      borderRadius: curveDepth / 2,
                    }}
                  />
                )}
                <Text style={[s.rowBtnText, { color: "#B91C1C" }]}>
                  {t("settings.logout", "Log out")}
                </Text>
              </Pressable>
            )}
          </View>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  topBar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 6,
    borderBottomWidth: Platform.OS === "ios" ? 0.5 : 1,
    overflow: Platform.OS === "android" ? "hidden" : undefined,
  },
  center: { alignItems: "center", gap: 2, flexDirection: "row" },
  title: { fontSize: 16, fontWeight: "700" },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  menu: {
    position: "absolute",
    top: 56 + 8,
    left: 12,
    right: 12,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  menuHeader: {
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 8,
  },
  menuLabel: {
    fontWeight: "700",
    marginTop: 6,
    marginBottom: 8,
  },

  langRow: { flexDirection: "row", flexWrap: "wrap" },
  langChip: {
    borderWidth: 1,
    borderColor: "#D0D5DD",
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 6 : 5,
    borderRadius: 14,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: "#FFF",
  },
  langText: { fontSize: 12, fontWeight: "700", color: "#111827" },

  divider: { height: 1, marginVertical: 10 },
  rowBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  rowBtnText: { fontSize: 14, fontWeight: "800" },
});

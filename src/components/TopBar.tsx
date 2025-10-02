import { Ionicons } from "@expo/vector-icons";
import { useNavigation, usePathname, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

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
  showHeart?: boolean;

  onOpenProfile?: () => void;

  onLogout?: () => Promise<void> | void;
};

function normalize(path?: string | null) {
  const p = (path || "/").replace(/\/+$/g, "") || "/";
  return p;
}

export default function TopBar({
  language,
  setLanguage,
  title = "Home",
  showHeart = true,
  onOpenProfile,
  onLogout,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();

  const activeLang = useMemo(
    () => LANGS.find((l) => language?.startsWith(l.code))?.code ?? "en",
    [language]
  );

  const normalizedPath = normalize(pathname);
  const HOME_PATHS = new Set<string>(["/tabs/HomePage"]);
  const isHome = HOME_PATHS.has(normalizedPath);

  const goBackSafe = () => {
    const navAny = navigation as any;
    if (typeof navAny?.canGoBack === "function" && navAny.canGoBack()) {
      navAny.goBack();
      return;
    }
    const routerAny = router as any;
    if (typeof routerAny?.canGoBack === "function" && routerAny.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/tabs/HomePage");
  };

  const showBack = !isHome;

  return (
    <View style={s.topBar}>
      {/* Left: Back on non-home, else Settings */}
      {showBack ? (
        <Pressable
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen"
          hitSlop={8}
          onPress={goBackSafe}
          style={{ padding: 4 }}
        >
          <Ionicons
            name={Platform.OS === "ios" ? "chevron-back" : "arrow-back"}
            size={26}
          />
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel="Settings"
          accessibilityHint="Open app settings and language"
          hitSlop={8}
          onPress={() => setMenuOpen(true)}
          style={{ padding: 4 }}
        >
          <Ionicons name="settings-outline" size={24} />
        </Pressable>
      )}

      {/* Center title */}
      <View style={s.center}>
        {showHeart && (
          <Ionicons
            name="heart-outline"
            size={18}
            style={{ marginBottom: 2 }}
          />
        )}
        {!!title && <Text style={s.title}>{title}</Text>}
      </View>

      {/* Right: Profile */}
      <Pressable
        onPress={() => {
          if (onOpenProfile) onOpenProfile();
          else router.push("/tabs/Profile");
        }}
        accessibilityLabel="Open profile"
        hitSlop={8}
        style={{ padding: 4 }}
      >
        <Ionicons name="person-circle-outline" size={30} />
      </Pressable>

      {/* Settings Menu (modal) */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        {/* Tap-outside to close */}
        <Pressable style={s.backdrop} onPress={() => setMenuOpen(false)} />

        <View style={s.menu}>
          <Text style={s.menuHeader}>Settings</Text>

          <Text style={s.menuLabel}>Language</Text>
          <View style={s.langRow}>
            {LANGS.map((l) => {
              const active = activeLang === l.code;
              return (
                <Pressable
                  key={l.code}
                  onPress={() => {
                    setLanguage(l.code);
                    setMenuOpen(false);
                  }}
                  style={[s.langChip, active && s.langChipActive]}
                  accessibilityLabel={`Switch language to ${l.label}`}
                >
                  <Text style={[s.langText, active && s.langTextActive]}>
                    {l.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={s.divider} />

          {!!onLogout && (
            <Pressable
              onPress={async () => {
                setMenuOpen(false);
                await onLogout();
              }}
              style={s.rowBtn}
              accessibilityRole="button"
              accessibilityLabel="Log out"
            >
              <Ionicons
                name="log-out-outline"
                size={20}
                color="#B91C1C"
                style={{ marginRight: 8 }}
              />
              <Text style={[s.rowBtnText, { color: "#B91C1C" }]}>Log out</Text>
            </Pressable>
          )}
        </View>
      </Modal>
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
  },
  center: { alignItems: "center", gap: 2, flexDirection: "row" },
  title: { fontSize: 16, fontWeight: "700", color: "#111827", marginLeft: 6 },

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
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  menuHeader: {
    fontWeight: "800",
    fontSize: 16,
    color: "#111827",
    marginBottom: 8,
  },
  menuLabel: {
    fontWeight: "700",
    color: "#111827",
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
  langChipActive: { backgroundColor: "#111827", borderColor: "#111827" },
  langText: { fontSize: 12, fontWeight: "700", color: "#111827" },
  langTextActive: { color: "#FFFFFF" },

  divider: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 10 },
  rowBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  rowBtnText: { fontSize: 14, fontWeight: "800", color: "#111827" },
});

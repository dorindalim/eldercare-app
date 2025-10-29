import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ImageBackground,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import OffsetButton from "../../src/components/OffsetButton";

const BG = require("../../assets/photos/screens/HomePage.png");
const BOTTOM_OFFSET = 46;

type LangCode = "en" | "zh" | "ms" | "ta";

const LANGS: { code: LangCode; label: string; a11y: string }[] = [
  { code: "en", label: "EN", a11y: "English" },
  { code: "zh", label: "中文", a11y: "Chinese" },
  { code: "ms", label: "BM", a11y: "Malay" },
  { code: "ta", label: "தமிழ்", a11y: "Tamil" },
];

const STORAGE_KEY = "btnLang";

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();

  const [lang, setLang] = useState<LangCode>(
    (i18n.language as LangCode) || "en",
  );

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved && ["en", "zh", "ms", "ta"].includes(saved)) {
          setLang(saved as LangCode);
          await i18n.changeLanguage(saved);
        }
      } catch {
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, lang);
      } catch {
      }
    })();
  }, [lang]);

  const handleChangeLang = async (code: LangCode) => {
    setLang(code);
    await i18n.changeLanguage(code);
  };

  return (
    <View style={s.container}>
      <StatusBar translucent barStyle="dark-content" backgroundColor="transparent" />
      <ImageBackground source={BG} style={s.bg} resizeMode="cover">
        <SafeAreaView style={s.safe}>
          <View style={[s.langBar, { top: insets.top + 8 }]}>
            <View style={s.langIconWrap}>
              <Ionicons name="language-outline" size={16} color="#000" />
            </View>

            {LANGS.map((l) => {
              const active = lang === l.code;
              return (
                <Pressable
                  key={l.code}
                  onPress={() => handleChangeLang(l.code)}
                  style={({ pressed }) => [
                    s.langChip,
                    active && s.langChipActive,
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Change button language to ${l.a11y}`}
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[s.langText, active && s.langTextActive]}>
                    {l.label}
                  </Text>
                  {active && (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color="#000"
                      style={{ marginLeft: 4 }}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={s.heroSpacer} />

          <View style={s.centerBlock}>
            <Text style={s.brand}>KampungCare</Text>
            <Text style={s.subtitle}>
              Connecting you to {"\n"}things that matter
            </Text>
          </View>

          <View style={{ flex: 1 }} />

          <View style={[s.actionsBar, { bottom: insets.bottom + BOTTOM_OFFSET }]}>
            <OffsetButton
              label={t("auth.signup.createAccount")}
              onPress={() => router.push("/Authentication/SignUp")}
              accessibilityLabel={t("signup.button")}
              style={[s.buttonLayout, { marginTop: 0, marginBottom: 0 }] as any}
              height={57}
              radius={14}
            />

            <OffsetButton
              label={t("auth.signup.login")}
              onPress={() => router.push("/Authentication/LogIn")}
              accessibilityLabel={t("signup.login")}
              style={[s.buttonLayout, { marginTop: 14, marginBottom: 0 }] as any}
              height={57}
              radius={14}
              bgColor="#FFFAF0"
            />
          </View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  bg: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  safe: {
    flex: 1,
    paddingHorizontal: 20,
  },
  langBar: {
    position: "absolute",
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 10,
  },
  langIconWrap: {
    backgroundColor: "#FED787",
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
  },
  langChip: {
    backgroundColor: "#FED787",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginLeft: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    flexDirection: "row",
    alignItems: "center",
  },
  langChipActive: {
    borderColor: "#000",
    ...shadow(0.12),
  },
  langText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "700",
  },
  langTextActive: {
    textDecorationLine: "underline",
  },
  heroSpacer: {
    height: 440,
  },
  centerBlock: {
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 8,
  },
  brand: {
    fontSize: 42,
    fontWeight: "900",
    color: "#1F2937",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 18,
    lineHeight: 24,
    color: "#4B5563",
  },
  actionsBar: {
    position: "absolute",
    left: 20,
    right: 20,
    alignItems: "center",
  },
  buttonLayout: {
    width: "90%",
    maxWidth: 360,
    alignSelf: "center",
  },
});

function shadow(opacity = 0.08) {
  if (Platform.OS === "ios") {
    return {
      shadowColor: "#000",
      shadowOpacity: opacity,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    };
  }
  return { elevation: 3 };
}

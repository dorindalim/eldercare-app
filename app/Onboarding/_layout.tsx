import AsyncStorage from "@react-native-async-storage/async-storage";
import { Slot, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { StatusBar, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth/AuthProvider";
import TopBar, { LangCode } from "../../src/components/TopBar";

export default function ElderlyOnboardingLayout() {
  const router = useRouter();
  const { i18n } = useTranslation();
  const { logout } = useAuth();

  const setLang = async (code: LangCode) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      edges={["top", "left", "right"]}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <TopBar
        language={i18n.language as LangCode}
        setLanguage={setLang}
        title="Onboarding"
        showHeart={false}
        onLogout={async () => {
          await logout();
          router.replace("/Authentication/LogIn");
        }}
      />
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
    </SafeAreaView>
  );
}

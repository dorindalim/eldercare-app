import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { Alert, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../../src/auth/AuthProvider";
import TopBar, { LangCode } from "../../../src/components/TopBar";

export default function ElderlyOnboardingLayout() {
  const router = useRouter();
  const { i18n } = useTranslation();
  const { logout } = useAuth();

  const setLang = async (code: LangCode) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
      <TopBar
        language={i18n.language as LangCode}
        setLanguage={setLang}
        title="Onboarding"
        showHeart={false}
        onSpeak={() => Alert.alert("TTS", "Read screen aloud")}
        onLogout={async () => {
          await logout();
          router.replace("/Authentication/LogIn");
        }}
      />

      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
    </SafeAreaView>
  );
}

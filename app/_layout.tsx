import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import "../i18n";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "../src/auth/AuthProvider";
import { initNotifications } from "../src/lib/notifications";
import { SettingsProvider } from "../src/Providers/SettingsProvider";

const LANG_STORAGE_KEY = "lang";

export default function RootLayout() {
  const { i18n } = useTranslation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initNotifications().catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(LANG_STORAGE_KEY);
        if (saved && ["en", "zh", "ms", "ta"].includes(saved)) {
          await i18n.changeLanguage(saved);
        }
      } catch {}
      setReady(true);
    })();

    const onChange = (lng: string) => {
      AsyncStorage.setItem(LANG_STORAGE_KEY, lng).catch(() => {});
    };
    i18n.on("languageChanged", onChange);

    return () => {
      i18n.off("languageChanged", onChange);
    };
  }, [i18n]);

  if (!ready) {
    return null; // or: <View style={{ flex: 1, backgroundColor: "transparent" }} />
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <SettingsProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: "transparent" },
              }}
            />
          </SettingsProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

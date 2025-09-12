import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import ms from "./locales/ms.json";
import ta from "./locales/ta.json";
import zh from "./locales/zh.json";

export const supportedLngs = ["en", "zh", "ms", "ta"] as const;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
    ms: { translation: ms },
    ta: { translation: ta },
  },
  fallbackLng: "en",
  lng: "en",
  supportedLngs: supportedLngs as unknown as string[], // or just ["en","zh","ms","ta"]
  interpolation: { escapeValue: false },
});

(async () => {
  try {
    const saved = await AsyncStorage.getItem("lang");
    const device = Localization.getLocales()[0]?.languageCode ?? "en";
    const pick =
      (saved && supportedLngs.includes(saved as any) && (saved as any)) ||
      (supportedLngs.find((l) => device.startsWith(l)) ?? "en");
    await i18n.changeLanguage(pick);
  } catch {}
})();

export default i18n;

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

type TextScale = "md" | "lg" | "xl";

type Ctx = {
  textScale: TextScale;
  setTextScale: (v: TextScale) => void;
};

const SettingsCtx = createContext<Ctx>({} as any);
export const useAppSettings = () => useContext(SettingsCtx);

const KEY = "app_text_scale_v1";

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [textScale, setTextScaleState] = useState<TextScale>("lg");

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(KEY);
      if (saved === "md" || saved === "lg" || saved === "xl") {
        setTextScaleState(saved);
      }
    })();
  }, []);

  const setTextScale = (v: TextScale) => {
    setTextScaleState(v);
    AsyncStorage.setItem(KEY, v).catch(() => {});
  };

  return (
    <SettingsCtx.Provider value={{ textScale, setTextScale }}>
      {children}
    </SettingsCtx.Provider>
  );
}

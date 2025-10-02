import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import { SafeAreaView, StyleSheet } from "react-native";
import TopBar, { type LangCode } from "../../src/components/TopBar";

export default function NavigationScreen() {
  const { i18n } = useTranslation();

  const setLang = async (code: string) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  return (
    <SafeAreaView style={s.safe}>
      <TopBar
        language={i18n.language as LangCode}
        setLanguage={setLang as (c: LangCode) => void}
        title="CC Activities"
        showHeart={false}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
});

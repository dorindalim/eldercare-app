import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import AuthTopBar from "../../src/components/AuthTopBar";
import OffsetButton from "../../src/components/OffsetButton";
import { supabase } from "../../src/lib/supabase";

const BG = require("../../assets/photos/screens/MediumBlob.png");

type LangCode = "en" | "zh" | "ms" | "ta";
const STORAGE_LANG_KEY = "lang";

const FIELD_HEIGHT = 57;
const SIDE = 20;
const MAXW = 560;
const INSET = 16;

const toE164 = (raw: string) => {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const withCC = digits.startsWith("65") ? digits : `65${digits}`;
  return `+${withCC}`;
};

export default function ForgotPassword() {
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const { width: screenW } = useWindowDimensions();
  const usableW = Math.max(0, screenW - 2 * SIDE);
  const formW = Math.min(MAXW, usableW);
  const formLeftEdgeOffset = SIDE + (usableW - formW) / 2 + INSET; 

  const [lang, setLang] = useState<LangCode>((i18n.language as LangCode) || "en");
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_LANG_KEY);
        if (saved && ["en", "zh", "ms", "ta"].includes(saved)) {
          setLang(saved as LangCode);
          await i18n.changeLanguage(saved);
        }
      } catch {}
    })();
  }, []);

  const changeLang = async (code: LangCode) => {
    setLangOpen(false);
    setLang(code);
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem(STORAGE_LANG_KEY, code);
  };

  const langShort =
    lang === "en" ? "EN" : lang === "zh" ? "中文" : lang === "ms" ? "BM" : "தமிழ்";

  const [phone, setPhone] = useState("+65 ");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    const normalized = toE164(phone);
    if (!normalized) {
      return Alert.alert(t("forgot.errors.invalidPhoneTitle"), t("forgot.errors.invalidPhoneBody"));
    }
    if (password.length < 8) {
      return Alert.alert(t("forgot.errors.shortPwdTitle"), t("forgot.errors.shortPwdBody", { min: 8 }));
    }
    if (password !== confirm) {
      return Alert.alert(t("forgot.errors.mismatchTitle"), t("forgot.errors.mismatchBody"));
    }

    try {
      setSubmitting(true);
      const { data, error } = await supabase.rpc("reset_password_v2", {
        p_phone: normalized,
        p_new_password: password,
      });

      if (error) {
        const msg = (error as any)?.message || "";
        if (msg.includes("USER_NOT_FOUND")) {
          Alert.alert(t("forgot.errors.notFoundTitle"), t("forgot.errors.notFoundBody"));
        } else {
          Alert.alert(t("common.error"), t("forgot.errors.generic"));
        }
        return;
      }

      if (!data?.[0]) {
        Alert.alert(t("common.error"), t("forgot.errors.generic"));
        return;
      }

      Alert.alert(t("forgot.success.title"), t("forgot.success.body"), [
        { text: t("common.ok"), onPress: () => router.replace("/Authentication/LogIn") },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar translucent barStyle="dark-content" backgroundColor="transparent" />
      <ImageBackground source={BG} style={s.bg} resizeMode="cover">
        <SafeAreaView style={s.safe}>
          <AuthTopBar
            onBack={() => router.back()}
            langShort={langShort}
            onOpenLanguage={() => setLangOpen(true)}
            backLeftInset={formLeftEdgeOffset - SIDE - INSET}
            maxWidth={MAXW}
            horizontalPadding={INSET}
          />

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            <View style={s.centerWrap}>
              <View style={s.form}>
                <Text style={s.title}>{t("forgot.title")}</Text>
                <Text style={s.sub}>{t("forgot.subtitle")}</Text>

                {/* Phone */}
                <Text style={s.label}>{t("auth.login.phoneLabel")}</Text>
                <TextInput
                  placeholder={t("auth.login.phonePH")}
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  style={s.input}
                />

                {/* New Password */}
                <Text style={s.label}>{t("forgot.newPwdLabel")}</Text>
                <View style={s.inputRow}>
                  <TextInput
                    placeholder={t("forgot.newPwdPH")}
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showPwd}
                    value={password}
                    onChangeText={setPassword}
                    style={s.inputFlex}
                  />
                  <Pressable
                    onPress={() => setShowPwd(v => !v)}
                    style={s.eyeBtnRow}
                    accessibilityRole="button"
                    accessibilityLabel={showPwd ? t("common.hide") : t("common.show")}
                  >
                    <Ionicons name={showPwd ? "eye-off" : "eye"} size={20} color="#6B7280" />
                  </Pressable>
                </View>
                <Text style={s.hint}>{t("forgot.hint", { min: 8 })}</Text>

                {/* Confirm */}
                <Text style={s.label}>{t("forgot.confirmLabel")}</Text>
                <View style={s.inputRow}>
                  <TextInput
                    placeholder={t("forgot.confirmPH")}
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showConfirm}
                    value={confirm}
                    onChangeText={setConfirm}
                    style={s.inputFlex}
                  />
                  <Pressable
                    onPress={() => setShowConfirm(v => !v)}
                    style={s.eyeBtnRow}
                    accessibilityRole="button"
                    accessibilityLabel={showConfirm ? t("common.hide") : t("common.show")}
                  >
                    <Ionicons name={showConfirm ? "eye-off" : "eye"} size={20} color="#6B7280" />
                  </Pressable>
                </View>

                {/* Submit */}
                <OffsetButton
                  label={t("forgot.submit")}
                  onPress={onSubmit}
                  style={{ width: "100%", marginTop: 10 }}
                  height={FIELD_HEIGHT}
                  radius={8}
                  contentStyle={submitting ? { opacity: 0.6 } : undefined}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </ImageBackground>

      {/* Language modal */}
      <Modal
        visible={langOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLangOpen(false)}
      >
        <Pressable style={s.modalBackdrop} onPress={() => setLangOpen(false)}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>{t("language.select")}</Text>
            {[
              { code: "en", label: t("language.en") },
              { code: "zh", label: t("language.zh") },
              { code: "ms", label: t("language.ms") },
              { code: "ta", label: t("language.ta") },
            ].map(l => {
              const active = lang === (l.code as LangCode);
              return (
                <Pressable
                  key={l.code}
                  style={[s.modalItem, active && s.modalItemActive]}
                  onPress={() => changeLang(l.code as LangCode)}
                >
                  <Text style={[s.modalText, active && s.modalTextActive]}>{l.label}</Text>
                  {active && <Ionicons name="checkmark" size={16} color="#111827" />}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, width: "100%", height: "100%" },
  safe: { flex: 1, paddingHorizontal: SIDE },

  centerWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  form: {
    width: "100%",
    maxWidth: MAXW,
    paddingHorizontal: INSET,
  },

  title: { fontSize: 24, fontWeight: "800", color: "#111827" },
  sub: { marginTop: 4, marginBottom: 16, color: "#6B7280" },

  label: { fontWeight: "700", color: "#111827", marginBottom: 6 },
  hint: { color: "#6B7280", fontSize: 12, marginBottom: 8, marginTop: -6 },

  input: {
    borderWidth: 2,
    borderColor: "#1F2937",
    borderRadius: 8,
    backgroundColor: "#FFF",
    color: "#111827",
    marginBottom: 12,
    paddingHorizontal: 12,
    height: FIELD_HEIGHT,
    paddingVertical: 0,
    textAlignVertical: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#1F2937",
    borderRadius: 8,
    backgroundColor: "#FFF",
    height: FIELD_HEIGHT,
    paddingLeft: 12,
    paddingRight: 6,
    marginBottom: 12,
  },
  inputFlex: {
    flex: 1,
    color: "#111827",
    paddingVertical: 0,
    textAlignVertical: "center",
  },
  eyeBtnRow: {
    height: "100%",
    minWidth: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 64,
    paddingRight: SIDE,
  },
  modalSheet: {
    backgroundColor: "#FFF",
    width: 220,
    borderRadius: 12,
    paddingVertical: 8,
    borderColor: "rgba(0,0,0,0.15)",
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalItemActive: { backgroundColor: "#FFF7E3" },
  modalText: { color: "#111827", fontSize: 14 },
  modalTextActive: { fontWeight: "800" },
});

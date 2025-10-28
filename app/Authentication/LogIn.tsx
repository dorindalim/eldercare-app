import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { useAuth } from "../../src/auth/AuthProvider";
import AuthTopBar from "../../src/components/AuthTopBar";
import OffsetButton from "../../src/components/OffsetButton";

const BG = require("../../assets/photos/screens/SmallBlob.png");

type LangCode = "en" | "zh" | "ms" | "ta";
const STORAGE_LANG_KEY = "lang";

const SIDE = 20;
const MAXW = 560;
const INSET = 16;

const BUTTON_H = 57;
const R = 8;

const PHONE_DIGITS = 8;
const PREFIX = "+65 ";

const getDigits = (s: string) => s.replace(/\D/g, "");

export default function Login() {
  const router = useRouter();
  const { startPhoneSignIn, confirmPhoneCode } = useAuth();
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

  const [phone, setPhone] = useState(PREFIX);
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");

  const handlePhoneChange = (text: string) => {
    if (!text.startsWith(PREFIX)) text = PREFIX + text;
    const after = text.slice(PREFIX.length);
    const digitsOnly = getDigits(after);
    setPhone(PREFIX + digitsOnly);
  };

  const phoneDigits = useMemo(
    () => getDigits(phone.startsWith(PREFIX) ? phone.slice(PREFIX.length) : phone),
    [phone]
  );

  const onSendCode = async () => {
    if (phoneDigits.length !== PHONE_DIGITS) {
      return Alert.alert(
        t("alerts.loginInvalidTitle"),
        t("auth.signup.phoneInvalidLength", { digits: PHONE_DIGITS })
      );
    }
    if (!password || password.length < 8) {
      return Alert.alert(
        t("alerts.loginInvalidTitle"),
        t("auth.signup.passwordTooShort", { min: 8 })
      );
    }
    const ok = await startPhoneSignIn(phone, password);
    if (!ok) {
      return Alert.alert(
        t("alerts.invalidCredentialsTitle"),
        t("alerts.invalidCredentialsBody")
      );
    }
    setOtpSent(true);
    Alert.alert(t("alerts.codeSentTitle"), t("alerts.codeSentBody"));
  };

  const onVerify = async () => {
    const ok = await confirmPhoneCode(code);
    if (!ok) {
      return Alert.alert(t("alerts.invalidCodeTitle"), t("alerts.invalidCodeBody"));
    }
    router.replace("/tabs/HomePage");
  };

  const langShort =
    lang === "en" ? "EN" : lang === "zh" ? "中文" : lang === "ms" ? "BM" : "தமிழ்";

  return (
    <View style={{ flex: 1 }}>
      <StatusBar translucent barStyle="dark-content" backgroundColor="transparent" />
      <ImageBackground source={BG} style={s.bg as any} resizeMode="cover">
        <SafeAreaView style={s.safe}>
          <AuthTopBar
            onBack={() => router.back()}
            langShort={langShort}
            onOpenLanguage={() => setLangOpen(true)}
            backLeftInset={formLeftEdgeOffset - SIDE - INSET} 
            maxWidth={MAXW}
            horizontalPadding={INSET}
          />

          <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={{ flex: 1 }}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={s.form}>
                  <Text style={s.title}>{t("auth.login.title")}</Text>
                  <Text style={s.subText}>
                    {t("auth.login.subtitlePrefix") + " "}
                    <Text onPress={() => router.push("/Authentication/SignUp")} style={s.subLink}>
                      {t("auth.login.subtitleLink")}
                    </Text>
                  </Text>

                  <TextInput
                    placeholder={t("auth.login.phonePH")}
                    placeholderTextColor="#6B7280"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={handlePhoneChange}
                    maxLength={PREFIX.length + PHONE_DIGITS}
                    style={s.input}
                  />

                  {!otpSent && (
                    <>
                      <View style={{ height: 8 }} />
                      <View style={s.inputWithIconRow}>
                        <TextInput
                          placeholder={t("auth.login.passwordPH")}
                          placeholderTextColor="#6B7280"
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
                    </>
                  )}

                  {!otpSent ? (
                    <OffsetButton
                      label={t("auth.login.getCode")}
                      onPress={onSendCode}
                      accessibilityLabel={t("auth.login.getCode")}
                      style={{ width: "100%", marginTop: 6 }}
                      height={BUTTON_H}
                      radius={R}
                    />
                  ) : (
                    <>
                      <Text style={s.labelSmall}>{t("auth.login.codeLabel")}</Text>
                      <TextInput
                        placeholder={t("auth.login.codePH")}
                        placeholderTextColor="#6B7280"
                        keyboardType="number-pad"
                        maxLength={6}
                        value={code}
                        onChangeText={setCode}
                        style={s.input}
                      />
                      <OffsetButton
                        label={t("auth.login.verify")}
                        onPress={onVerify}
                        accessibilityLabel={t("auth.login.verify")}
                        style={{ width: "100%", marginTop: 6 }}
                        height={BUTTON_H}
                        radius={R}
                      />
                    </>
                  )}

                  {!otpSent && (
                    <Pressable
                      onPress={() => router.push("/Authentication/ForgotPassword")}
                      style={{ alignSelf: "center", marginTop: 10 }}
                    >
                      <Text style={s.underlineLink}>{t("forgot.link")}</Text>
                    </Pressable>
                  )}
                </View>

                <View style={{ height: 28 }} />
              </ScrollView>
            </KeyboardAvoidingView>
          </Pressable>
        </SafeAreaView>
      </ImageBackground>

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

  scrollContent: { flexGrow: 1, justifyContent: "center" },

  form: {
    alignSelf: "center",
    width: "100%",
    maxWidth: MAXW,
    paddingHorizontal: INSET,
  },

  title: { fontSize: 30, fontWeight: "900", color: "#111827", marginTop: 6 },

  subText: {
    marginTop: 6,
    marginBottom: 40,
    color: "#374151",
    fontSize: 15,
    ...(Platform.OS === "android" ? ({ includeFontPadding: false } as const) : {}),
  },
  subLink: { color: "#111827", fontWeight: "800", textDecorationLine: "underline" },

  input: {
    borderWidth: 2,
    borderColor: "#1F2937",
    borderRadius: R,
    backgroundColor: "#FFF",
    color: "#111827",
    paddingHorizontal: 14,
    height: BUTTON_H, 
    marginBottom: 12,
  },
  inputWithIconRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#1F2937",
    borderRadius: R,
    backgroundColor: "#FFF",
    height: BUTTON_H, 
    paddingLeft: 14,
    paddingRight: 6,
    marginBottom: 12,
  },
  inputFlex: { flex: 1, color: "#111827" },
  eyeBtnRow: {
    height: "100%",
    minWidth: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  underlineLink: {
    color: "#111827",
    fontWeight: "800",
    textDecorationLine: "underline",
  },

  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: 16 },
  footerText: { color: "#6B7280" },
  link: { color: "#111827", fontWeight: "800", textDecorationLine: "underline" },

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
  labelSmall: { color: "#111827", fontWeight: "700", marginBottom: 6 },
});

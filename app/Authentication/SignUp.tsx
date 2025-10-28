import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  ImageBackground,
  Keyboard,
  Modal,
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

const BG = require("../../assets/photos/screens/MediumBlob.png");

type LangCode = "en" | "zh" | "ms" | "ta";
const STORAGE_LANG_KEY = "lang";

const SIDE = 20;
const MAXW = 560;
const INSET = 16;
const BUTTON_H = 57;

export default function Signup() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string }>();
  const { registerWithPhone } = useAuth();
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

  const MIN_PWD = 8;
  const PHONE_DIGITS = 8;
  const getDigits = (s: string) => s.replace(/\D/g, "");

  const [phone, setPhone] = useState("+65 ");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (params.phone && typeof params.phone === "string") {
      setPhone(params.phone);
    }
  }, [params.phone]);

  const phoneDigits = useMemo(
    () => getDigits(phone.startsWith("+65") ? phone.substring(3) : phone),
    [phone]
  );

  const phoneError = useMemo(() => {
    if (!phone.trim()) return undefined;
    return phoneDigits.length !== PHONE_DIGITS
      ? t("auth.signup.phoneInvalidLength", { digits: PHONE_DIGITS })
      : undefined;
  }, [phone, phoneDigits.length, t]);

  const pwdError = useMemo(() => {
    if (!password) return undefined;
    return password.length < MIN_PWD
      ? t("auth.signup.passwordTooShort", { min: MIN_PWD })
      : undefined;
  }, [password, t]);

  const confirmError = useMemo(() => {
    if (!confirm) return undefined;
    return password !== confirm ? t("auth.signup.passwordMismatch") : undefined;
  }, [password, confirm, t]);

  const onSubmit = async () => {
    if (phoneDigits.length !== PHONE_DIGITS) {
      return Alert.alert(
        t("alerts.signupInvalidTitle"),
        t("auth.signup.phoneInvalidLength", { digits: PHONE_DIGITS })
      );
    }
    if (password.length < MIN_PWD) {
      return Alert.alert(
        t("alerts.signupInvalidTitle"),
        t("auth.signup.passwordTooShort", { min: MIN_PWD })
      );
    }
    if (password !== confirm) {
      return Alert.alert(
        t("alerts.signupInvalidTitle"),
        t("auth.signup.passwordMismatch")
      );
    }

    const normalizedForInsert =
      phone.trim().startsWith("+") ? phone.trim() : `+65 ${phoneDigits}`;

    const ok = await registerWithPhone(normalizedForInsert, password);
    if (!ok) {
      return Alert.alert(
        t("alerts.signupFailedTitle"),
        t("alerts.signupFailedBody")
      );
    }

    router.replace("/Onboarding/ElderlyBasics");
  };

  const handlePhoneChange = (text: string) => {
    const prefix = "+65 ";
    setPhone(text.length < prefix.length ? prefix : text);
  };

  const langShort =
    lang === "en" ? "EN" : lang === "zh" ? "中文" : lang === "ms" ? "BM" : "தமிழ்";

  return (
    <View style={{ flex: 1 }}>
      <StatusBar translucent barStyle="dark-content" backgroundColor="transparent" />
      <ImageBackground source={BG} style={s.bg} resizeMode="cover">
        <SafeAreaView style={s.safe}>
          <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss}>
            <AuthTopBar
              onBack={() => router.back()}
              langShort={langShort}
              onOpenLanguage={() => setLangOpen(true)}
              backLeftInset={formLeftEdgeOffset - SIDE - INSET}
              maxWidth={MAXW}
              horizontalPadding={INSET}
            />

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={s.form}>
                <Text style={s.title}>{t("auth.signup.title")}</Text>
                <Text style={s.sub}>{t("auth.signup.subtitle")}</Text>

                <Text style={s.label}>{t("auth.signup.phoneLabel")}</Text>
                <TextInput
                  placeholder={t("auth.signup.phonePH")}
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={handlePhoneChange}
                  style={s.input}
                />
                {!!phoneError && <Text style={s.error}>{phoneError}</Text>}

                <Text style={s.label}>{t("auth.signup.passwordLabel")}</Text>
                <View style={s.inputWrap}>
                  <TextInput
                    placeholder={t("auth.signup.passwordPH")}
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showPwd}
                    value={password}
                    onChangeText={setPassword}
                    style={[s.input, s.inputWithIcon]}
                  />
                  <Pressable
                    onPress={() => setShowPwd((v) => !v)}
                    style={s.eyeBtn}
                    accessibilityRole="button"
                    accessibilityLabel={showPwd ? t("common.hide") : t("common.show")}
                  >
                    <Ionicons name={showPwd ? "eye-off" : "eye"} size={22} color="#6B7280" />
                  </Pressable>
                </View>
                <Text style={s.hint}>{t("auth.signup.passwordHint", { min: MIN_PWD })}</Text>
                {!!pwdError && <Text style={s.error}>{pwdError}</Text>}

                <Text style={s.label}>{t("auth.signup.confirmLabel")}</Text>
                <View style={s.inputWrap}>
                  <TextInput
                    placeholder={t("auth.signup.confirmPH")}
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showConfirm}
                    value={confirm}
                    onChangeText={setConfirm}
                    style={[s.input, s.inputWithIcon]}
                  />
                  <Pressable
                    onPress={() => setShowConfirm((v) => !v)}
                    style={s.eyeBtn}
                    accessibilityRole="button"
                    accessibilityLabel={showConfirm ? t("common.hide") : t("common.show")}
                  >
                    <Ionicons name={showConfirm ? "eye-off" : "eye"} size={22} color="#6B7280" />
                  </Pressable>
                </View>
                {!!confirmError && <Text style={s.error}>{confirmError}</Text>}

                <OffsetButton
                  label={t("auth.signup.button")}
                  onPress={onSubmit}
                  style={{ width: "100%", marginTop: 16 }}
                  height={BUTTON_H}  
                  radius={8}
                />

                <View style={s.footerRow}>
                  <Text style={s.footerText}>{t("auth.signup.haveAccount")} </Text>
                  <Link href="/Authentication/LogIn" asChild>
                    <Pressable>
                      <Text style={s.link}>{t("auth.signup.login")}</Text>
                    </Pressable>
                  </Link>
                </View>
              </View>

              <View style={{ height: 28 }} />
            </ScrollView>
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
            ].map((l) => {
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

  title: { fontSize: 28, fontWeight: "900", color: "#111827", marginBottom: 4 },
  sub: { marginBottom: 12, color: "#374151", fontSize: 15, lineHeight: 20 },

  label: { fontWeight: "800", color: "#111827", marginBottom: 6, marginTop: 8, fontSize: 14 },

  input: {
    width: "100%",
    borderWidth: 2,
    borderColor: "#1F2937",
    paddingHorizontal: 14,
    height: BUTTON_H,
    borderRadius: 8,
    backgroundColor: "#FFF",
    color: "#111827",
    marginBottom: 10,
    fontSize: 16,
  },
  inputWrap: { position: "relative" },
  inputWithIcon: { paddingRight: 48 },
  eyeBtn: {
    position: "absolute",
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    paddingHorizontal: 4,
  },

  hint: { color: "#6B7280", fontSize: 12, marginBottom: 6 },
  error: { color: "#DC2626", fontSize: 12, marginTop: 2, marginBottom: 6 },

  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: 12 },
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
});

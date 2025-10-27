import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import AuthTopBar, { LangCode } from "../../src/components/AuthTopBar";
import Screen from "../../src/components/Screen";

const FIELD_HEIGHT = 44;
const PHONE_DIGITS = 8;
const PREFIX = "+65 ";

const getDigits = (s: string) => s.replace(/\D/g, "");

export default function Login() {
  const router = useRouter();
  const { startPhoneSignIn, confirmPhoneCode } = useAuth();
  const { t, i18n } = useTranslation();

  const [phone, setPhone] = useState(PREFIX);
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");

  const setLanguage = async (code: LangCode) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  // Keep "+65 " and allow only digits after it
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

  const goHome = () => router.replace("/tabs/HomePage");

  const onSendCode = async () => {
    // 1) Require exactly 8 digits
    if (phoneDigits.length !== PHONE_DIGITS) {
      return Alert.alert(
        t("alerts.loginInvalidTitle"),
        t("auth.signup.phoneInvalidLength", { digits: PHONE_DIGITS })
      );
    }
    // 2) Password checks
    if (!password || password.length < 8) {
      return Alert.alert(
        t("alerts.loginInvalidTitle"),
        t("auth.signup.passwordTooShort", { min: 8 })
      );
    }

    // 3) Try step 1 (password check)
    const ok = await startPhoneSignIn(phone, password);
    if (!ok) {
      return Alert.alert(
        t("alerts.invalidCredentialsTitle"),
        t("alerts.invalidCredentialsBody")
      );
    }

    setOtpSent(true);
    Alert.alert(t("alerts.codeSentTitle"), t("alerts.codeSentBody")); // “Use 123456 for now (mock).”
  };

  const onVerify = async () => {
    const ok = await confirmPhoneCode(code);
    if (!ok) {
      return Alert.alert(t("alerts.invalidCodeTitle"), t("alerts.invalidCodeBody"));
    }
    goHome();
  };

  return (
    <Screen
      topBar={
        <AuthTopBar
          language={i18n.language as LangCode}
          setLanguage={setLanguage}
        />
      }
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={s.card}>
          <Text style={s.title}>{t("auth.login.title")}</Text>
          <Text style={s.sub}>{t("auth.login.subtitle")}</Text>

          <Text style={s.label}>{t("auth.login.phoneLabel")}</Text>
          <TextInput
            placeholder={t("auth.login.phonePH")}
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={handlePhoneChange}
            style={s.input}
            maxLength={PREFIX.length + PHONE_DIGITS} // "+65 " + 8 digits
          />

          {!otpSent && (
            <>
              <View style={s.labelRow}>
                <Text style={s.label}>{t("auth.signup.passwordLabel")}</Text>
                <Pressable
                  onPress={() => router.push("/Authentication/ForgotPassword")}
                  accessibilityRole="button"
                >
                  <Text style={s.forgotText}>{t("forgot.link")}</Text>
                </Pressable>
              </View>

              <View style={s.inputRow}>
                <TextInput
                  placeholder={t("auth.login.passwordPH")}
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
            </>
          )}

          {!otpSent ? (
            <Pressable onPress={onSendCode} style={s.btn}>
              <Text style={s.btnText}>{t("auth.login.getCode")}</Text>
            </Pressable>
          ) : (
            <>
              <Text style={[s.label, { marginTop: 10 }]}>{t("auth.login.codeLabel")}</Text>
              <TextInput
                placeholder={t("auth.login.codePH")}
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={setCode}
                style={s.input}
              />
              <Pressable onPress={onVerify} style={s.btn}>
                <Text style={s.btnText}>{t("auth.login.verify")}</Text>
              </Pressable>
            </>
          )}

          <View style={s.footerRow}>
            <Text style={s.footerText}>{t("auth.login.noAccount")} </Text>
            <Link href={{ pathname: "/Authentication/SignUp", params: { phone } }} asChild>
              <Pressable>
                <Text style={s.link}>{t("auth.login.signup")}</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { marginTop: 12, paddingHorizontal: 20 },
  title: { fontSize: 24, fontWeight: "800", color: "#111827" },
  sub: { marginTop: 4, marginBottom: 16, color: "#6B7280" },

  labelRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  label: { fontWeight: "700", color: "#111827", marginBottom: 6 },
  forgotText: { color: "#1650ccff", fontWeight: "700" },

  input: {
    borderWidth: 1,
    borderColor: "#D0D5DD",
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
    borderWidth: 1,
    borderColor: "#D0D5DD",
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

  btn: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 6,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: 16 },
  footerText: { color: "#6B7280" },
  link: { color: "#111827", fontWeight: "800" },
});

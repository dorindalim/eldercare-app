import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
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

export default function Login() {
  const router = useRouter();
  const { startPhoneSignIn, confirmPhoneCode } = useAuth();
  const { t, i18n } = useTranslation();

  const [phone, setPhone] = useState("+65 ");
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");

  // store language setting to make sure language is changed for whole app
  const setLanguage = async (code: LangCode) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  const goHome = () => router.replace("/tabs/HomePage");

  const onSendCode = async () => {
    const exists = await startPhoneSignIn(phone);
    if (!exists) {
      return Alert.alert(
        t("alerts.noAccountTitle"),
        t("alerts.noAccountBody"),
        [
          {
            text: t("common.ok"),
            onPress: () =>
              router.replace({
                pathname: "/Authentication/SignUp",
                params: { phone },
              }),
          },
        ]
      );
    }
    setOtpSent(true);
    Alert.alert(t("alerts.codeSentTitle"), t("alerts.codeSentBody"));
  };

  const onVerify = async () => {
    const ok = await confirmPhoneCode(code);
    if (!ok) {
      return Alert.alert(
        t("alerts.invalidCodeTitle"),
        t("alerts.invalidCodeBody")
      );
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
            onChangeText={setPhone}
            style={s.input}
          />

          {!otpSent ? (
            <Pressable onPress={onSendCode} style={s.btn}>
              <Text style={s.btnText}>{t("auth.login.getCode")}</Text>
            </Pressable>
          ) : (
            <>
              <Text style={[s.label, { marginTop: 10 }]}>
                {t("auth.login.codeLabel")}
              </Text>
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
            <Link
              href={{ pathname: "/Authentication/SignUp", params: { phone } }}
              asChild
            >
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
  label: { fontWeight: "700", color: "#111827", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#D0D5DD",
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#FFF",
    color: "#111827",
    marginBottom: 12,
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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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

export default function Signup() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string }>();
  const { registerWithPhone } = useAuth();
  const { t, i18n } = useTranslation();

  const [phone, setPhone] = useState("+65 ");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (params.phone && typeof params.phone === "string") {
      setPhone(params.phone);
    }
  }, [params.phone]);

  const setLanguage = async (code: LangCode) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

  const canSubmit = useMemo(
    () =>
      phone.trim().length > 6 && password.length >= 6 && password === confirm,
    [phone, password, confirm]
  );

  const onSubmit = async () => {
    if (!canSubmit) {
      return Alert.alert(
        t("alerts.signupInvalidTitle"),
        t("alerts.signupInvalidBody")
      );
    }

    // 1) Create the user
    const ok = await registerWithPhone(phone.trim(), password);
    if (!ok) {
      return Alert.alert(
        t("alerts.signupFailedTitle"),
        t("alerts.signupFailedBody")
      );
    }
    // 2) Create the profile
    router.replace("/Onboarding/ElderlyForm");
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
          <Text style={s.title}>{t("auth.signup.title")}</Text>
          <Text style={s.sub}>{t("auth.signup.subtitle")}</Text>

          <Text style={s.label}>{t("auth.signup.phoneLabel")}</Text>
          <TextInput
            placeholder={t("auth.signup.phonePH")}
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            style={s.input}
          />

          <Text style={s.label}>{t("auth.signup.passwordLabel")}</Text>
          <TextInput
            placeholder={t("auth.signup.passwordPH")}
            placeholderTextColor="#9CA3AF"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={s.input}
          />

          <Text style={s.label}>{t("auth.signup.confirmLabel")}</Text>
          <TextInput
            placeholder={t("auth.signup.confirmPH")}
            placeholderTextColor="#9CA3AF"
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
            style={s.input}
          />

          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit}
            style={[s.btn, !canSubmit && s.btnDisabled]}
          >
            <Text style={s.btnText}>{t("auth.signup.button")}</Text>
          </Pressable>

          <View style={s.footerRow}>
            <Text style={s.footerText}>{t("auth.signup.haveAccount")} </Text>
            <Link href="/Authentication/LogIn" asChild>
              <Pressable>
                <Text style={s.link}>{t("auth.signup.login")}</Text>
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
  title: { fontSize: 24, fontWeight: "800", color: "#111827", marginBottom: 2 },
  sub: { marginTop: 2, marginBottom: 16, color: "#6B7280" },
  label: { fontWeight: "700", color: "#111827", marginBottom: 6, marginTop: 6 },
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
  btnDisabled: { backgroundColor: "#9CA3AF" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: 16 },
  footerText: { color: "#6B7280" },
  link: { color: "#111827", fontWeight: "800" },
});

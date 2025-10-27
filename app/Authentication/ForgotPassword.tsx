import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
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
import AuthTopBar, { LangCode } from "../../src/components/AuthTopBar";
import Screen from "../../src/components/Screen";
import { supabase } from "../../src/lib/supabase";

const FIELD_HEIGHT = 44;

const toE164 = (raw: string) => {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const withCC = digits.startsWith("65") ? digits : `65${digits}`;
  return `+${withCC}`;
};

export default function ForgotPassword() {
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const [phone, setPhone] = useState("+65 ");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const setLanguage = async (code: LangCode) => {
    await i18n.changeLanguage(code);
    await AsyncStorage.setItem("lang", code);
  };

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
    <Screen
      topBar={
        <AuthTopBar language={i18n.language as LangCode} setLanguage={setLanguage} />
      }
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={s.card}>
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

          <Pressable onPress={onSubmit} style={[s.btn, submitting && { opacity: 0.6 }]} disabled={submitting}>
            <Text style={s.btnText}>{t("forgot.submit")}</Text>
          </Pressable>
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
  hint: { color: "#6B7280", fontSize: 12, marginBottom: 8, marginTop: -6 },

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
});

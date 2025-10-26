import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";

export type AppSession = {
  userId: string;
  phone: string;
  onboardingCompleted?: boolean;
};

export type ElderlyProfileInput = {
  name: string;
  year_of_birth: number | string;
  gender: "male" | "female" | "na";
  phone?: string;
  emergency_contact?: {
    name?: string;
    relation?: string;
    phone?: string;
    email?: string;
  };
  emergency_name?: string;
  emergency_relation?: string;
  emergency_phone?: string;
  emergency_email?: string;
};

export type ElderlyMedicationInput = { name: string; frequency?: string };

export type ElderlyConditionInput = {
  condition: string;
  medications?: ElderlyMedicationInput[];
  doctor?: string;
  clinic?: string;
  appointments?: string;
};

export type ElderlyHealthExtras = {
  assistive_needs?: string[];
  drug_allergies?: string;
  public_note?: string;
};

type SaveResult = { success: boolean; error?: string };

type AuthCtx = {
  session: AppSession | null;
  loading: boolean;

  startPhoneSignIn: (phone: string, password: string) => Promise<boolean>;
  confirmPhoneCode: (code: string) => Promise<boolean>;
  registerWithPhone: (phone: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;

  markOnboarding: (done: boolean) => Promise<void>;
  saveElderlyProfile: (profile: ElderlyProfileInput) => Promise<SaveResult>;
  saveElderlyConditions: (
    conds: ElderlyConditionInput[],
    extras?: ElderlyHealthExtras
  ) => Promise<{ success: boolean }>;
};

const Ctx = createContext<AuthCtx>({} as any);
export const useAuth = () => useContext(Ctx);

const SESSION_KEY = "auth_session_v1";
let pendingPhone: string | null = null;

const toE164 = (raw: string) => {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const withCC = digits.startsWith("65") ? digits : `65${digits}`;
  return `+${withCC}`;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();
  const [session, setSession] = useState<AppSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.userId && parsed?.phone) setSession(parsed);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const startPhoneSignIn = async (phone: string, password: string) => {
    const normalized = toE164(phone);
    if (!normalized || !password) return false;

    const { data, error } = await supabase.rpc("verify_user_credentials_v2", {
      p_phone: normalized,
      p_password: password,
    });

    if (error || !data?.[0]) {
      return false;
    }

    pendingPhone = data[0].out_phone;
    return true;
  };

  const confirmPhoneCode = async (code: string) => {
    if (code !== "123456" || !pendingPhone) return false;

    const { data: user, error } = await supabase
      .from("users")
      .select("id, phone, onboarding_completed")
      .eq("phone", pendingPhone)
      .single();

    if (error || !user) {
      pendingPhone = null;
      return false;
    }

    try {
      const { data: prof } = await supabase
        .from("elderly_profiles")
        .select("scheduled_for, deletion_status")
        .eq("user_id", user.id)
        .maybeSingle();

      const scheduledDate = prof?.scheduled_for ? new Date(prof.scheduled_for) : null;
      const now = new Date();
      const needsRestore =
        (scheduledDate && scheduledDate > now) ||
        prof?.deletion_status === "deletion_scheduled";

      if (needsRestore) {
        await supabase
          .from("elderly_profiles")
          .update({
            scheduled_for: null,
            deletion_reason: null,
            deletion_requested_at: null,
            deletion_status: null,
          })
          .eq("user_id", user.id);

        Alert.alert(t("auth.restore.restoredTitle"), t("auth.restore.restoredBody"));
      }
    } catch {
    }

    const next: AppSession = {
      userId: user.id,
      phone: user.phone,
      onboardingCompleted: user.onboarding_completed,
    };
    setSession(next);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));

    pendingPhone = null;
    return true;
  };


  const registerWithPhone = async (phone: string, password: string) => {
    const normalized = toE164(phone);
    if (!normalized || password.length < 8) return false;

    const { data, error } = await supabase.rpc("register_user_v2", {
      p_phone: normalized,
      p_password: password,
    });

    if (error || !data?.[0]) {
      console.error("register_user_v2 RPC error:", error);
      return false;
    }

    const row = data[0]; 
    const next: AppSession = {
      userId: row.out_user_id,
      phone: row.out_phone,
      onboardingCompleted: row.out_onboarding_completed,
    };

    setSession(next);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
    return true;
  };

  const logout = async () => {
    setSession(null);
    await AsyncStorage.removeItem(SESSION_KEY);
  };

  const markOnboarding = async (done: boolean) => {
    if (!session) return;
    const { error } = await supabase
      .from("users")
      .update({ onboarding_completed: done })
      .eq("id", session.userId);

    if (!error) {
      const next = { ...session, onboardingCompleted: done };
      setSession(next);
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
    }
  };

  const saveElderlyProfile = async (
    profile: ElderlyProfileInput
  ): Promise<SaveResult> => {
    if (!session) return { success: false, error: "No session" };

    const yobNum = Number(profile.year_of_birth);
    const year_of_birth =
      Number.isFinite(yobNum) && yobNum > 1900 && yobNum < 3000 ? yobNum : null;

    const payload = {
      user_id: session.userId,
      name: profile.name?.trim() || null,
      year_of_birth,
      gender: profile.gender,
      phone: profile.phone ?? session.phone ?? null,
      emergency_name:
        profile.emergency_contact?.name?.trim() ??
        profile.emergency_name ??
        null,
      emergency_relation:
        profile.emergency_contact?.relation?.trim() ??
        profile.emergency_relation ??
        null,
      emergency_phone:
        profile.emergency_contact?.phone?.trim() ??
        profile.emergency_phone ??
        null,
      emergency_email:
        profile.emergency_contact?.email?.trim() ??
        profile.emergency_email ??
        null,
    };

    const { error } = await supabase
      .from("elderly_profiles")
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      console.error("saveElderlyProfile error:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  const saveElderlyConditions = async (
    conds: ElderlyConditionInput[],
    extras?: ElderlyHealthExtras
  ): Promise<{ success: boolean }> => {
    if (!session) return { success: false };
    {
      const { error: profErr } = await supabase
        .from("elderly_profiles")
        .update({
          assistive_needs:
            extras?.assistive_needs && extras.assistive_needs.length
              ? extras.assistive_needs
              : null,
          drug_allergies: extras?.drug_allergies?.trim()
            ? extras.drug_allergies.trim()
            : null,
          public_note: extras?.public_note?.trim()
            ? extras.public_note.trim()
            : null,
        })
        .eq("user_id", session.userId);

      if (profErr) {
        console.error("saveElderlyConditions profile update error:", profErr);
        return { success: false };
      }
    }

    {
      const { data: oldConds, error: fetchErr } = await supabase
        .from("elderly_conditions")
        .select("id")
        .eq("user_id", session.userId);

      if (fetchErr) {
        console.error("fetch existing conditions error:", fetchErr);
        return { success: false };
      }

      const oldIds = (oldConds || []).map((c: any) => c.id);
      if (oldIds.length) {
        const { error: delMedsErr } = await supabase
          .from("elderly_medications")
          .delete()
          .in("condition_id", oldIds);
        if (delMedsErr) {
          console.error("delete meds error:", delMedsErr);
          return { success: false };
        }

        const { error: delCondsErr } = await supabase
          .from("elderly_conditions")
          .delete()
          .eq("user_id", session.userId);
        if (delCondsErr) {
          console.error("delete conditions error:", delCondsErr);
          return { success: false };
        }
      }
    }

    if (!conds?.length) return { success: true };

    for (const c of conds) {
      const { data: inserted, error: condErr } = await supabase
        .from("elderly_conditions")
        .insert([
          {
            user_id: session.userId,
            condition: c.condition || null,
            doctor: c.doctor || null,
            clinic: c.clinic || null,
            appointments: c.appointments || null,
          },
        ])
        .select("id")
        .single();

      if (condErr || !inserted?.id) {
        console.error("insert condition error:", condErr);
        return { success: false };
      }

      const meds = c.medications || [];
      const medsRows = meds
        .filter((m) => (m?.name ?? "").trim().length > 0)
        .map((m) => ({
          condition_id: inserted.id,
          name: m.name.trim(),
          frequency: m.frequency?.trim() || null,
        }));

      if (medsRows.length) {
        const { error: medsErr } = await supabase
          .from("elderly_medications")
          .insert(medsRows);
        if (medsErr) {
          console.error("insert meds error:", medsErr);
          return { success: false };
        }
      }
    }

    return { success: true };
  };

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      loading,
      startPhoneSignIn,
      confirmPhoneCode,
      registerWithPhone,
      logout,
      markOnboarding,
      saveElderlyProfile,
      saveElderlyConditions,
    }),
    [session, loading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

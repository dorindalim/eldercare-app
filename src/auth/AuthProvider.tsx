import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";

export type Session = {
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

export type ElderlyMedicationInput = {
  name: string;
  frequency?: string;
};

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
  session: Session | null;
  loading: boolean;

  startPhoneSignIn: (phone: string) => Promise<boolean>;
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

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.userId && parsed?.phone) {
            setSession(parsed);
          }
        }
      } catch (e) {
        console.warn("Load session failed:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 1) Login (mock OTP). Returns true if user exists; false otherwise.
  const startPhoneSignIn = async (phone: string) => {
    const normalized = phone.trim();
    if (!normalized) return false;

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("phone", normalized)
      .maybeSingle();

    if (error) {
      console.error("startPhoneSignIn error:", error);
      return false;
    }

    if (!user) return false;

    pendingPhone = normalized; 
    return true;
  };

  const confirmPhoneCode = async (code: string) => {
    if (code !== "123456" || !pendingPhone) return false;

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("phone", pendingPhone)
      .single();

    if (error || !user) {
      console.error("confirmPhoneCode fetch error:", error);
      pendingPhone = null;
      return false;
    }

    const next: Session = {
      userId: user.id,
      phone: user.phone,
      onboardingCompleted: user.onboarding_completed,
    };

    // If this user has a pending scheduled deletion on their elderly_profiles row,
    // treat the login as a restore: clear scheduled_for and restore_token and notify.
    try {
    const { data: prof } = await supabase
      .from('elderly_profiles')
      .select('scheduled_for')
      .eq('user_id', user.id)
      .maybeSingle();

    const profAny: any = prof;
    if (profAny?.scheduled_for || profAny?.deletion_status === 'deletion_scheduled') {
      const scheduledDate = profAny?.scheduled_for ? new Date(profAny.scheduled_for) : null;
      const now = new Date();
      const needsRestore = (scheduledDate && scheduledDate > now) || profAny.deletion_status === 'deletion_scheduled';
      if (needsRestore) {
        // cancel the scheduled deletion and clear status
        await supabase
          .from('elderly_profiles')
          .update({ scheduled_for: null, deletion_reason: null, deletion_requested_at: null, deletion_status: null })
          .eq('user_id', user.id);

        Alert.alert(t('auth.restore.restoredTitle'), t('auth.restore.restoredBody'));
      }
    }
    } catch (e) {
      // ignore restore errors, continue sign in
      console.warn("restore-on-login check failed:", e);
    }

    setSession(next);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));

    pendingPhone = null;
    return true;
  };

  // 2) Sign-up (phone + password)
  const registerWithPhone = async (phone: string, password: string) => {
    const normalized = phone.trim();
    if (!normalized || password.length < 8) return false;

    const { data: existing, error: checkErr } = await supabase
      .from("users")
      .select("id")
      .eq("phone", normalized)
      .maybeSingle();

    if (checkErr) {
      console.error("registerWithPhone check error:", checkErr);
      return false;
    }
    if (existing) return false;

    const { data: user, error: insertErr } = await supabase
      .from("users")
      .insert([{ phone: normalized, password, onboarding_completed: false }])
      .select("*")
      .single();

    if (insertErr || !user) {
      console.error("registerWithPhone insert error:", insertErr);
      return false;
    }

    const next: Session = {
      userId: user.id,
      phone: user.phone,
      onboardingCompleted: user.onboarding_completed,
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

    if (error) {
      console.error("markOnboarding error:", error);
      return;
    }
    const next = { ...session, onboardingCompleted: done };
    setSession(next);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
  };

  const saveElderlyProfile = async (
    profile: ElderlyProfileInput
  ): Promise<SaveResult> => {
    if (!session) return { success: false, error: "No session" };

    // Guard YOB
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
  ) => {
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
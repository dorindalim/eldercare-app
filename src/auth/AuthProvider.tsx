import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
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
  assistive_needs?: string[]; // e.g. ["walking_cane","hearing_aid","other:grab bar"]
  drug_allergies?: string; // free text
  public_note?: string; // free text
};

type SaveResult = { success: boolean; error?: string };

type AuthCtx = {
  session: Session | null;
  loading: boolean;

  // auth
  startPhoneSignIn: (phone: string) => Promise<boolean>;
  confirmPhoneCode: (code: string) => Promise<boolean>;
  registerWithPhone: (phone: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;

  // onboarding
  markOnboarding: (done: boolean) => Promise<void>;
  saveElderlyProfile: (profile: ElderlyProfileInput) => Promise<SaveResult>;
  saveElderlyConditions: (
    conds: ElderlyConditionInput[],
    extras?: ElderlyHealthExtras
  ) => Promise<{ success: boolean }>;
};

const Ctx = createContext<AuthCtx>({} as any);
export const useAuth = () => useContext(Ctx);

let pendingPhone: string | null = null;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
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

    pendingPhone = normalized; // pretend we sent OTP
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

    setSession({
      userId: user.id,
      phone: user.phone,
      onboardingCompleted: user.onboarding_completed,
    });

    pendingPhone = null;
    return true;
  };

  // 2) Sign-up (phone + password)
  const registerWithPhone = async (phone: string, password: string) => {
    const normalized = phone.trim();
    if (!normalized || password.length < 6) return false;

    const { data: existing, error: checkErr } = await supabase
      .from("users")
      .select("id")
      .eq("phone", normalized)
      .maybeSingle();

    if (checkErr) {
      console.error("registerWithPhone check error:", checkErr);
      return false;
    }
    if (existing) {
      console.log("User already exists");
      return false;
    }

    const { data: user, error: insertErr } = await supabase
      .from("users")
      .insert([{ phone: normalized, password, onboarding_completed: false }])
      .select("*")
      .single();

    if (insertErr || !user) {
      console.error("registerWithPhone insert error:", insertErr);
      return false;
    }

    setSession({
      userId: user.id,
      phone: user.phone,
      onboardingCompleted: user.onboarding_completed,
    });

    return true;
  };

  const logout = async () => setSession(null);

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
    setSession({ ...session, onboardingCompleted: done });
  };

  const saveElderlyProfile = async (
    profile: ElderlyProfileInput
  ): Promise<SaveResult> => {
    if (!session) return { success: false, error: "No session" };

    const payload = {
      user_id: session.userId,
      name: profile.name?.trim(),
      year_of_birth: Number(profile.year_of_birth),
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

  // NEW: saves conditions + per-medication frequencies + optional extras on profile
  const saveElderlyConditions = async (
    conds: ElderlyConditionInput[],
    extras?: ElderlyHealthExtras
  ) => {
    if (!session) return { success: false };

    // 1) Save extras onto profile (optional)
    if (
      extras &&
      (extras.assistive_needs?.length ||
        extras.drug_allergies ||
        extras.public_note)
    ) {
      const { error: profErr } = await supabase
        .from("elderly_profiles")
        .update({
          assistive_needs: extras.assistive_needs ?? null,
          drug_allergies: extras.drug_allergies ?? null,
          public_note: extras.public_note ?? null,
        })
        .eq("user_id", session.userId);
      if (profErr) {
        console.error("saveElderlyConditions profile update error:", profErr);
        return { success: false };
      }
    }

    // 2) If no conditions, we're done
    if (!conds?.length) return { success: true };

    // 3) Insert conditions
    const conditionRows = conds.map((c) => ({
      user_id: session.userId,
      condition: c.condition,
      doctor: c.doctor || null,
      clinic: c.clinic || null,
      appointments: c.appointments || null,
    }));

    const { data: insertedConds, error: condErr } = await supabase
      .from("elderly_conditions")
      .insert(conditionRows)
      .select("id");

    if (condErr) {
      console.error("saveElderlyConditions conditions error:", condErr);
      return { success: false };
    }

    // 4) Insert medications (per condition, with frequency)
    const medsToInsert: {
      condition_id: string;
      name: string;
      frequency?: string | null;
    }[] = [];
    insertedConds.forEach((row, idx) => {
      const meds = conds[idx]?.medications || [];
      meds
        .filter((m) => m?.name?.trim())
        .forEach((m) =>
          medsToInsert.push({
            condition_id: row.id,
            name: m.name.trim(),
            frequency: m.frequency?.trim() || null,
          })
        );
    });

    if (medsToInsert.length > 0) {
      const { error: medsErr } = await supabase
        .from("elderly_medications")
        .insert(medsToInsert);
      if (medsErr) {
        console.error("saveElderlyConditions meds error:", medsErr);
        return { success: false };
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

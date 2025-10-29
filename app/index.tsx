import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { useAuth } from "../src/auth/AuthProvider";
import { supabase } from "../src/lib/supabase";

export default function Index() {
  const { session, loading, logout } = useAuth();
  const [route, setRoute] = useState<string | null>(null);

  useEffect(() => {
    const boot = async () => {
      if (loading) return;

      if (!session) {
        setRoute("/Authentication/Welcome");
        return;
      }

      const { data: profile, error } = await supabase
        .from("elderly_profiles")
        .select("id")
        .eq("user_id", session.userId)
        .maybeSingle();

      if (error || !profile) {
        try { await logout?.(); } catch {}
        try { await supabase.auth.signOut(); } catch {}
        try { await AsyncStorage.clear(); } catch {}
        setRoute("/Authentication/Welcome");
        return;
      }

      if (!session.onboardingCompleted) {
        setRoute("/Onboarding/ElderlyBasics");
      } else {
        setRoute("/tabs/HomePage");
      }
    };

    boot();
  }, [loading, session]);

  if (!route) return null;
  return <Redirect href={route} />;
}

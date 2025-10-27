import { Redirect } from "expo-router";
import { useAuth } from "../src/auth/AuthProvider";

export default function Index() {
  const { session, loading } = useAuth();

  if (loading) return null;

  if (!session) {
    return <Redirect href="/Authentication/Welcome" />;
  }

  if (!session.onboardingCompleted) {
    return <Redirect href="/Onboarding/ElderlyForm" />;
  }

  return <Redirect href="/tabs/HomePage" />;
}

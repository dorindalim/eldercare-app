import { Redirect } from "expo-router";
import { useAuth } from "../src/auth/AuthProvider";

export default function Index() {
  const { session, loading } = useAuth();

  if (loading) return null;

  if (!session) {
    return <Redirect href="/Authentication/LogIn" />;
  }

  // Send new users to onboarding step 1
  if (!session.onboardingCompleted) {
    return <Redirect href="/Onboarding/ElderlyForm" />;
  }

  // Otherwise to the elderly home tab
  return <Redirect href="/tabs/HomePage" />;
}

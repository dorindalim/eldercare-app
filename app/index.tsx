// app/index.tsx
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "../src/auth/AuthProvider";

export default function Index() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!session) return router.replace("/Authentication/LogIn");
    if (!session.role) return router.replace("/Shared/RoleSelection");
    if (session.role === "elderly")
      return router.replace("/Elderly/tabs/HomePage");
    return router.replace("/Caregiver/tabs");
  }, [loading, session]);

  return null;
}

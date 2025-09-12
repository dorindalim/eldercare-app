import { Stack } from "expo-router";
import { AuthProvider } from "../src/auth/AuthProvider";

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#F8FAFC" },
        }}
      />
    </AuthProvider>
  );
}

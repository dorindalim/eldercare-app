import { Stack } from "expo-router";

export default function ElderlyLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Bottom tabs group */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* Onboarding lives OUTSIDE tabs (never shows as a tab) */}
      <Stack.Screen
        name="Onboarding/Step1Basics"
        options={{ headerShown: false }}
      />
      {/* If you add more steps, register them too */}
      {/* <Stack.Screen name="Onboarding/Step2Health" options={{ headerShown:false }} /> */}
    </Stack>
  );
}

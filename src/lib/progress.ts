import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

export const KDRAFT = {
  basics: "@draft/onboarding/basics",
  conditions: "@draft/onboarding/conditions",
} as const;

const KPROG = {
  basics: "@progress/onboarding/basics",
  conditions: "@progress/onboarding/conditions",
} as const;

type StepKey = keyof typeof KPROG;

export function useCombinedProgress(step: StepKey, value: number) {
  const [combined, setCombined] = useState<number>(value);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
      await AsyncStorage.setItem(KPROG[step], String(clamped)).catch(() => {});

      const otherStep: StepKey = step === "basics" ? "conditions" : "basics";
      const rawOther = await AsyncStorage.getItem(KPROG[otherStep]).catch(() => null);
      const other = rawOther ? Math.max(0, Math.min(1, parseFloat(rawOther))) : 0;

      const combo = (clamped + other) / 2;
      if (mounted) setCombined(combo);
    })();

    return () => {
      mounted = false;
    };
  }, [step, value]);

  return combined;
}

export async function markAllComplete() {
  await Promise.all([
    AsyncStorage.setItem(KPROG.basics, "1"),
    AsyncStorage.setItem(KPROG.conditions, "1"),
  ]).catch(() => {});
}

export async function getStepProgress(step: StepKey): Promise<number> {
  const raw = await AsyncStorage.getItem(KPROG[step]).catch(() => null);
  return raw ? Math.max(0, Math.min(1, parseFloat(raw))) : 0;
}
export async function resetOnboardingProgress() {
  await Promise.all([
    AsyncStorage.removeItem(KPROG.basics),
    AsyncStorage.removeItem(KPROG.conditions),
  ]).catch(() => {});
}

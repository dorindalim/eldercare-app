import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";

// ——— helpers ———
function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}
function datesThisWeek(date = new Date()) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return isoDate(d);
  });
}
function computeStreak(days: Set<string>) {
  let s = 0;
  const cur = new Date();
  // count backwards from TODAY; if today isn't checked, streak starts at 0
  while (days.has(isoDate(cur))) {
    s += 1;
    cur.setDate(cur.getDate() - 1);
  }
  return s;
}

// ——— HOOK ———
export function useCheckins(userId?: string) {
  // fall back to a stable bucket if user not known yet
  const datesKey = `checkin_dates_${userId ?? "anon"}_v1`;
  const coinsKey = `coins_total_${userId ?? "anon"}_v1`;

  const [loading, setLoading] = useState(true);
  const [checkedDates, setCheckedDates] = useState<Set<string>>(new Set());
  const [coins, setCoins] = useState(0);
  const [streak, setStreak] = useState(0);

  // load when user changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rawDates = (await AsyncStorage.getItem(datesKey)) || "[]";
        const arr: string[] = JSON.parse(rawDates);
        if (!cancelled) setCheckedDates(new Set(arr));

        const rawCoins = await AsyncStorage.getItem(coinsKey);
        if (!cancelled) setCoins(rawCoins ? Number(rawCoins) || 0 : 0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [datesKey, coinsKey]);

  // recompute streak whenever dates change
  useEffect(() => {
    setStreak(computeStreak(checkedDates));
  }, [checkedDates]);

  const todayIso = isoDate();
  const week = useMemo(() => datesThisWeek(), []);
  const todayChecked = checkedDates.has(todayIso);

  const weekChecks = useMemo(
    () => week.map((d) => checkedDates.has(d)),
    [checkedDates, week]
  );

  const checkInToday = async () => {
    if (todayChecked) return { ok: false, reason: "already-checked" as const };

    const next = new Set(checkedDates);
    next.add(todayIso);
    setCheckedDates(next);

    const nextCoins = coins + 1;
    setCoins(nextCoins);

    await AsyncStorage.setItem(datesKey, JSON.stringify(Array.from(next)));
    await AsyncStorage.setItem(coinsKey, String(nextCoins));

    // streak will update via effect on checkedDates
    return { ok: true as const };
  };

  const __devReset = async () => {
    await AsyncStorage.multiRemove([datesKey, coinsKey]);
    setCheckedDates(new Set());
    setCoins(0);
    setStreak(0);
  };

  return {
    loading,
    coins,
    weekChecks,
    todayChecked,
    checkInToday,
    streak,
    __devReset,
  };
}


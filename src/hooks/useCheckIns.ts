import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";

const DATES_BASE = "checkin_dates_v1";
const COINS_BASE = "coins_total_v1";

const k = (base: string, userId?: string | null) =>
  userId ? `${base}:${userId}` : base;

function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  // Monday as start of week
  const day = (d.getDay() + 6) % 7;
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

/**
 * Account-scoped checkins.
 * Pass the current user's id. If no userId is provided, the hook becomes a no-op with zeros.
 */
export function useCheckins(userId?: string | null) {
  const [loading, setLoading] = useState(true);
  const [checkedDates, setCheckedDates] = useState<Set<string>>(new Set());
  const [coins, setCoins] = useState(0);

  // Reset state when user changes
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      // No user? show empty state
      if (!userId) {
        if (!cancelled) {
          setCheckedDates(new Set());
          setCoins(0);
          setLoading(false);
        }
        return;
      }

      try {
        const datesKey = k(DATES_BASE, userId);
        const coinsKey = k(COINS_BASE, userId);

        const [rawDates, rawCoins] = await Promise.all([
          AsyncStorage.getItem(datesKey),
          AsyncStorage.getItem(coinsKey),
        ]);

        const arr: string[] = rawDates ? JSON.parse(rawDates) : [];
        if (!cancelled) {
          setCheckedDates(new Set(arr));
          setCoins(rawCoins ? Number(rawCoins) || 0 : 0);
        }
      } catch {
        if (!cancelled) {
          setCheckedDates(new Set());
          setCoins(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const todayIso = isoDate();
  const week = useMemo(() => datesThisWeek(), []);
  const todayChecked = checkedDates.has(todayIso);

  const weekChecks = useMemo(
    () => week.map((d) => checkedDates.has(d)),
    [checkedDates, week]
  );

  const checkInToday = async () => {
    if (!userId) return { ok: false as const, reason: "no-user" as const };
    if (todayChecked) return { ok: false as const, reason: "already-checked" as const };

    const datesKey = k(DATES_BASE, userId);
    const coinsKey = k(COINS_BASE, userId);

    const next = new Set(checkedDates);
    next.add(todayIso);
    setCheckedDates(next);

    const nextCoins = coins + 1;
    setCoins(nextCoins);

    await AsyncStorage.setItem(datesKey, JSON.stringify(Array.from(next)));
    await AsyncStorage.setItem(coinsKey, String(nextCoins));

    return { ok: true as const };
  };

  const __devReset = async () => {
    if (!userId) return;
    await AsyncStorage.multiRemove([k(DATES_BASE, userId), k(COINS_BASE, userId)]);
    setCheckedDates(new Set());
    setCoins(0);
  };

  return {
    loading,
    coins,
    weekChecks,
    todayChecked,
    checkInToday,
    __devReset,
  };
}


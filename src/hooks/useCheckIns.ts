// src/hooks/useCheckins.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";

const DATES_KEY = "checkin_dates_v1";  
const COINS_KEY = "coins_total_v1";     

function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(date = new Date()) {
  const d = new Date(date);
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

export function useCheckins() {
  const [loading, setLoading] = useState(true);
  const [checkedDates, setCheckedDates] = useState<Set<string>>(new Set());
  const [coins, setCoins] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const rawDates = (await AsyncStorage.getItem(DATES_KEY)) || "[]";
        const arr: string[] = JSON.parse(rawDates);
        setCheckedDates(new Set(arr));

        const rawCoins = await AsyncStorage.getItem(COINS_KEY);
        setCoins(rawCoins ? Number(rawCoins) || 0 : 0);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const todayIso = isoDate();
  const week = useMemo(() => datesThisWeek(), []);
  const todayChecked = checkedDates.has(todayIso);

  const weekChecks = useMemo(
    () => week.map((d) => checkedDates.has(d)),
    [checkedDates, week]
  );

  const checkInToday = async () => {
    if (todayChecked) return { ok: false, reason: "already-checked" };

    const next = new Set(checkedDates);
    next.add(todayIso);
    setCheckedDates(next);

    const nextCoins = coins + 1;
    setCoins(nextCoins);

    await AsyncStorage.setItem(DATES_KEY, JSON.stringify(Array.from(next)));
    await AsyncStorage.setItem(COINS_KEY, String(nextCoins));

    return { ok: true };
  };
  const __devReset = async () => {
    await AsyncStorage.multiRemove([DATES_KEY, COINS_KEY]);
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


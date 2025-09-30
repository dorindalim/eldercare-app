import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type WeekCell = { date: string; label: string; checked: boolean };

const isoLocal = (d = new Date()) => {
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
};

const yesterday = (d = new Date()) => {
  const y = new Date(d);
  y.setDate(y.getDate() - 1);
  return y;
};

export function useCheckins(userId?: string | null) {
  const [coins, setCoins] = useState(0);
  const [streak, setStreak] = useState(0);
  const [todayChecked, setTodayChecked] = useState(false);
  const [weekChecks, setWeekChecks] = useState<WeekCell[]>([]);

  const buildWeek = useCallback((dates: Set<string>) => {
    const today = new Date();
    const cells: WeekCell[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i)); 
      const key = isoLocal(d);
      const label = d.toLocaleDateString(undefined, { weekday: "short" });
      return { date: key, label, checked: dates.has(key) };
    });
    setWeekChecks(cells);
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
      setCoins(0);
      setStreak(0);
      setTodayChecked(false);
      setWeekChecks([]);
      return;
    }

    const { data, error } = await supabase
      .from("elderly_profiles")
      .select("coins, streak, last_checkin, checkin_dates")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("elderly_profiles read:", error.message);
      setCoins(0);
      setStreak(0);
      setTodayChecked(false);
      setWeekChecks([]);
      return;
    }

    const coinsVal = Number(data?.coins ?? 0);
    const streakVal = Number(data?.streak ?? 0);
    const last = data?.last_checkin as string | null;
    const arr = Array.isArray(data?.checkin_dates) ? (data!.checkin_dates as string[]) : [];

    const dates = new Set(arr.map(String));
    setCoins(coinsVal);
    setStreak(streakVal);
    setTodayChecked(dates.has(isoLocal()));
    buildWeek(dates);
  }, [userId, buildWeek]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const checkInToday = useCallback(async () => {
    if (!userId) return { ok: false };

    const today = isoLocal();

    const rpc = await supabase.rpc("profiles_checkin", {
      p_user: userId,
      p_day: today,
    });

    if (rpc.error) {
      console.warn("profiles_checkin RPC failed; falling back:", rpc.error.message);

      const { data: row, error: rErr } = await supabase
        .from("elderly_profiles")
        .select("coins, streak, last_checkin, checkin_dates")
        .eq("user_id", userId)
        .maybeSingle();

      if (rErr) return { ok: false, error: rErr.message };

      const prevCoins = Number(row?.coins ?? 0);
      const prevStreak = Number(row?.streak ?? 0);
      const last = row?.last_checkin as string | null;
      const list = Array.isArray(row?.checkin_dates) ? (row!.checkin_dates as string[]) : [];

      if (last === today) {
        await refresh();
        return { ok: true };
      }

      const incStreak =
        last === isoLocal(yesterday(new Date())) ? prevStreak + 1 : 1;

      const set = new Set(list.map(String));
      set.add(today);
      const nextDates = Array.from(set);

      const { error: uErr } = await supabase
        .from("elderly_profiles")
        .update({
          coins: prevCoins + 1,
          streak: incStreak,
          last_checkin: today,
          checkin_dates: nextDates,
        })
        .eq("user_id", userId);

      if (uErr) return { ok: false, error: uErr.message };
    }

    await refresh();
    return { ok: true };
  }, [userId, refresh]);

  return { coins, streak, todayChecked, weekChecks, checkInToday, refresh };
}

export default useCheckins;

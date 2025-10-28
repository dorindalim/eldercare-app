import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import Constants from "expo-constants";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import AppText from "../../src/components/AppText";
import CalendarTimePicker from "../../src/components/CalendarTimePicker";
import TopBar, { type LangCode } from "../../src/components/TopBar";
import { supabase } from "../../src/lib/supabase";

import { useAuth } from "../../src/auth/AuthProvider";

import ActivityChat from "../tabs/ActivityChat";

const TABLE = "community_activities";
const VISIBLE_AFTER_START_HOURS = 3;
const DEVICE_ID_KEY = "bulletin:device_id_v1";

const PROJECT_ID: string | undefined =
  (Constants?.expoConfig?.extra as any)?.eas?.projectId ||
  (Constants as any)?.easConfig?.projectId;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type LatLng = { latitude: number; longitude: number };

function distanceMeters(a: LatLng, b: LatLng) {
  const R = 6371e3;
  const φ1 = (a.latitude * Math.PI) / 180;
  const φ2 = (b.latitude * Math.PI) / 180;
  const Δφ = ((b.latitude - a.latitude) * Math.PI) / 180;
  const Δλ = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
const kmStr = (m?: number | null) =>
  m == null ? "" : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;

async function getDeviceId(): Promise<string> {
  const cur = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (cur) return cur;
  const id = `dev_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

const CATS: { key: string; icon: IconName }[] = [
  { key: "kopi", icon: "chatbubbles-outline" },
  { key: "mahjong", icon: "grid-outline" },
  { key: "crafts", icon: "color-palette-outline" },
  { key: "stretch", icon: "body-outline" },
  { key: "walks", icon: "walk-outline" },
  { key: "learning", icon: "school-outline" },
  { key: "volunteer", icon: "hand-left-outline" },
];

type ActivityRow = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  starts_at: string;
  place_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  photo_url: string | null;
  published: boolean | null;
  interested_user_ids: string[] | null;
  interest_count: number | null;
  created_at: string;
  updated_at: string;
  owner_device_id: string | null;
  user_id?: string | null;
  distance_m?: number | null;
};

type InterestRow = {
  id: string;
  activity_id: string;
  interested_user_id: string | null;
  interested_device_id: string | null;
  interested_name: string | null;
  created_at: string;
};

type GPred = {
  place_id: string;
  description: string;
  structured_formatting?: { main_text?: string; secondary_text?: string };
};
type GAutoResp = { predictions: GPred[]; status: string };
type GDetailsResp = {
  result?: {
    name?: string;
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number } };
  };
  status: string;
};

const GOOGLE_PLACES_KEY: string | undefined =
  (Constants?.expoConfig?.extra as any)?.GOOGLE_PLACES_KEY ||
  (Constants as any)?.manifest2?.extra?.GOOGLE_PLACES_KEY;

async function registerForPushToken(): Promise<string | null> {
  const settings = await Notifications.getPermissionsAsync();
  let status = settings.status;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") return null;

  const tokenResp = await Notifications.getExpoPushTokenAsync(
    PROJECT_ID ? { projectId: PROJECT_ID } : undefined
  );
  return tokenResp.data ?? null;
}

async function upsertPushToken({
  token,
  userId,
  deviceId,
}: {
  token: string;
  userId: string | null;
  deviceId: string;
}) {
  await supabase.from("push_tokens").upsert(
    {
      user_id: userId ?? null,
      device_id: deviceId,
      expo_push_token: token,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "device_id" }
  );
}

async function pushToTokens(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, any>
) {
  if (!tokens.length) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokens.map((to) => ({ to, title, body, data }))),
    });
  } catch {}
}

async function getTokensForUser(
  userId: string | null,
  deviceId: string | null
) {
  if (!userId && !deviceId) return [];
  const or = [
    userId ? `user_id.eq.${userId}` : null,
    deviceId ? `device_id.eq.${deviceId}` : null,
  ]
    .filter(Boolean)
    .join(",");
  const { data } = await supabase
    .from("push_tokens")
    .select("expo_push_token")
    .or(or);
  return (data || []).map((r: any) => r.expo_push_token).filter(Boolean);
}

type MsgRow = {
  id: string;
  activity_id: string;
  sender_user_id: string | null;
  sender_device_id: string | null;
  created_at: string;
};

function identityKeyFor(currentUserId: string | null, deviceId: string) {
  return currentUserId ? `u:${currentUserId}` : `d:${deviceId}`;
}
function lastReadStorageKey(activityId: string, identityKey: string) {
  return `activity:lastread:${activityId}:${identityKey}`;
}

async function ensureLocalNotifPermission(t: any) {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.status === "granted") return true;
  const req = await Notifications.requestPermissionsAsync();
  if (req.status === "granted") return true;
  Alert.alert(
    t("navigation.reminders.permTitle"),
    t("navigation.reminders.permBody")
  );
  return false;
}
function fmtWhen(dt: Date, locale?: string) {
  try {
    return dt.toLocaleString(locale || "en-SG", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return dt.toISOString();
  }
}

async function scheduleReminderForActivity(row: ActivityRow, t: any, locale?: string) {
  const ok = await ensureLocalNotifPermission(t);
  if (!ok) return;

  const start = new Date(row.starts_at);
  let fireAt = new Date(start.getTime() - 60 * 60 * 1000);
  const now = new Date();
  if (fireAt.getTime() <= now.getTime() + 10000) {
    fireAt = new Date(now.getTime() + 5000);
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: row.title || t("navigation.reminders.untitled"),
      body: t("navigation.reminders.fireBody"),
      data: {
        kind: "activity_reminder",
        activityId: row.id,
        title: row.title,
        at: start.toISOString(),
      },
      sound: true,
      ...(Platform.OS === "android" ? { channelId: "event-reminders" } : null),
    },
    trigger: ({ type: "date", date: fireAt } as any),
  });

  await Notifications.scheduleNotificationAsync({
    content: {
      title: row.title || t("navigation.reminders.untitled"),
      body: t("navigation.reminders.scheduledBody", { when: fmtWhen(fireAt, locale) }),
      data: {
        kind: "reminder_scheduled",
        activityId: row.id,
        fireAt: fireAt.toISOString(),
      },
      sound: true,
      ...(Platform.OS === "android" ? { channelId: "event-reminders" } : null),
    },
    trigger: null,
  });
}

export default function Bulletin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const bottomPad = Math.max(24, tabBarHeight + insets.bottom + 8);

  const { t, i18n } = useTranslation();
  const locale = (i18n.language as string) || undefined;

  const [lang, setLangState] = useState<LangCode>(
    (i18n.language as LangCode) || "en"
  );

  const setLang = async (code: LangCode) => {
    setLangState(code);
    if (i18n.language !== code) {
      await i18n.changeLanguage(code);
    }
    await AsyncStorage.setItem("lang", code);
  };

  useEffect(() => {
    (async () => {
      const saved = (await AsyncStorage.getItem("lang")) as LangCode | null;
      const target = saved || ((i18n.language as LangCode) || "en");
      if (i18n.language !== target) {
        await i18n.changeLanguage(target);
      }
      if (target !== lang) setLangState(target);
    })();
  }, []);

  useEffect(() => {
    const cur = (i18n.language as LangCode) || "en";
    if (cur !== lang) setLangState(cur);
  }, [i18n.language]);

  const { session, logout } = useAuth();
  const currentUserId = session?.userId ?? null;
  const [myName, setMyName] = useState<string | null>(null);
  useEffect(() => {
    if (!currentUserId) {
      setMyName(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("elderly_profiles")
        .select("name")
        .eq("user_id", currentUserId)
        .maybeSingle();
      setMyName(data?.name ?? null);
    })();
  }, [currentUserId]);

  const [deviceId, setDeviceId] = useState<string>("");
  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  useEffect(() => {
    (async () => {
      if (!deviceId) return;
      const token = await registerForPushToken();
      if (token) await upsertPushToken({ token, userId: currentUserId, deviceId });
    })();
  }, [deviceId, currentUserId]);

  useEffect(() => {
    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("event-reminders", {
        name: t("community.notifs.reminder"),
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      }).catch(() => {});
    }
  }, [i18n.language]);

  const [myLoc, setMyLoc] = useState<LatLng | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setMyLoc({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        }
      } catch {}
    })();
  }, []);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [filterCat, setFilterCat] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [editingRow, setEditingRow] = useState<ActivityRow | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState<string>(CATS[0].key);
  const [startDate, setStartDate] = useState<Date>(
    new Date(Date.now() + 3600_000)
  );

  const [placeQuery, setPlaceQuery] = useState("");
  const [placePreds, setPlacePreds] = useState<GPred[]>([]);
  const [placeChosen, setPlaceChosen] = useState<{
    name: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
  } | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatFor, setChatFor] = useState<{ id: string; title: string } | null>(
    null
  );

  const [interestedOpen, setInterestedOpen] = useState(false);
  const [interestedFor, setInterestedFor] = useState<ActivityRow | null>(null);
  const [interestedList, setInterestedList] = useState<InterestRow[]>([]);
  const [interestedLoading, setInterestedLoading] = useState(false);

  const [interestedSet, setInterestedSet] = useState<Set<string>>(new Set());
  async function refreshMyInterests() {
    if (!deviceId && !currentUserId) return;
    const or = [
      currentUserId ? `interested_user_id.eq.${currentUserId}` : null,
      deviceId ? `interested_device_id.eq.${deviceId}` : null,
    ]
      .filter(Boolean)
      .join(",");
    const { data } = await supabase
      .from("activity_interests")
      .select("activity_id")
      .or(or);
    setInterestedSet(new Set((data || []).map((r: any) => r.activity_id)));
  }

  async function loadActivities() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .order("starts_at", { ascending: true });
      if (error) throw error;

      const now = new Date();
      const cutoff = new Date(
        now.getTime() - VISIBLE_AFTER_START_HOURS * 3600_000
      );

      let out = (data || []).filter(
        (r: any) => new Date(r.starts_at) >= cutoff
      ) as ActivityRow[];

      if (myLoc && out.length <= 300) {
        out = out
          .map((r) =>
            r.lat != null && r.lng != null
              ? {
                  ...r,
                  distance_m: distanceMeters(myLoc, {
                    latitude: r.lat,
                    longitude: r.lng,
                  }),
                }
              : { ...r, distance_m: null }
          )
          .sort((a, b) => (a.distance_m ?? 1e15) - (b.distance_m ?? 1e15));
      }

      setRows(out);
    } catch (e: any) {
      Alert.alert(t("common.error"), t("bulletin.errors.loadFailed"));
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
      refreshMyInterests();
    }
  }

  useEffect(() => {
    loadActivities();
  }, [myLoc]);

  useEffect(() => {
    const ch = supabase
      .channel("rt_community_activities")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE },
        () => {
          loadActivities();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadActivities();
  };

  useEffect(() => {
    const q = placeQuery.trim();
    if (!GOOGLE_PLACES_KEY || !q) {
      setPlacePreds([]);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const url =
          `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
          `?input=${encodeURIComponent(q)}` +
          `&components=country:sg&types=establishment|geocode&key=${GOOGLE_PLACES_KEY}`;
        const res = await fetch(url, { signal: ctrl.signal });
        const json = (await res.json()) as GAutoResp;
        setPlacePreds((json.predictions || []).slice(0, 10));
      } catch {
        setPlacePreds([]);
      }
    }, 350);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [placeQuery]);

  async function pickPrediction(p: GPred) {
    if (!GOOGLE_PLACES_KEY) return;
    try {
      const url =
        `https://maps.googleapis.com/maps/api/place/details/json` +
        `?place_id=${encodeURIComponent(p.place_id)}` +
        `&fields=name,formatted_address,geometry/location` +
        `&key=${GOOGLE_PLACES_KEY}`;
      const res = await fetch(url);
      const json = (await res.json()) as GDetailsResp;
      const name =
        json.result?.name || p.structured_formatting?.main_text || p.description;
      const address = json.result?.formatted_address || p.description;
      const lat = json.result?.geometry?.location?.lat ?? null;
      const lng = json.result?.geometry?.location?.lng ?? null;
      setPlaceChosen({
        name: name || address || "Selected place",
        address: address ?? null,
        lat,
        lng,
      });
      setPlaceQuery(name || address || "");
      setPlacePreds([]);
    } catch {}
  }

  function resetForm() {
    setTitle("");
    setDesc("");
    setCat(CATS[0].key);
    setStartDate(new Date(Date.now() + 3600_000));
    setPlaceQuery("");
    setPlacePreds([]);
    setPlaceChosen(null);
  }

  function startEdit(row: ActivityRow) {
    setEditingRow(row);
    setTitle(row.title);
    setDesc(row.description || "");
    setCat(row.category);
    setStartDate(new Date(row.starts_at));
    setPlaceQuery(row.place_name || "");
    setPlaceChosen(
      row.place_name
        ? {
            name: row.place_name,
            address: row.address,
            lat: row.lat,
            lng: row.lng,
          }
        : null
    );
    setCreating(true);
  }

  async function submitCreate() {
    const placeName = (placeChosen?.name || placeQuery || "").trim();
    if (!title.trim() || !startDate || !placeName) {
      Alert.alert(
        t("bulletin.alerts.missingInfoTitle"),
        t("bulletin.alerts.missingInfoBody")
      );
      return;
    }

    const insert = {
      title: title.trim(),
      description: desc.trim() || null,
      category: cat,
      starts_at: startDate.toISOString(),
      place_name: placeName,
      address: placeChosen?.address ?? null,
      lat: placeChosen?.lat ?? null,
      lng: placeChosen?.lng ?? null,
      published: true,
      owner_device_id: deviceId || null,
      user_id: currentUserId,
    };

    try {
      const { error } = await supabase.from(TABLE).insert([insert]);
      if (error) throw error;
      setCreating(false);
      resetForm();
      loadActivities();
      Alert.alert(
        t("bulletin.alerts.postedTitle"),
        t("bulletin.alerts.postedBody")
      );
    } catch {
      Alert.alert(t("common.error"), t("bulletin.errors.postFailed"));
    }
  }

  async function notifyInterestedUsersOnUpdate(
    activityId: string,
    titleForPush: string
  ) {
    try {
      const { data: subs } = await supabase
        .from("activity_interests")
        .select("interested_user_id, interested_device_id")
        .eq("activity_id", activityId);

      const userIds = (subs || [])
        .map((s: any) => s.interested_user_id)
        .filter(Boolean);
      const deviceIds = (subs || [])
        .map((s: any) => s.interested_device_id)
        .filter(Boolean);

      const tokenSet = new Set<string>();

      if (userIds.length) {
        const { data } = await supabase
          .from("push_tokens")
          .select("expo_push_token")
          .in("user_id", userIds);
        (data || []).forEach(
          (r: any) => r?.expo_push_token && tokenSet.add(r.expo_push_token)
        );
      }
      if (deviceIds.length) {
        const { data } = await supabase
          .from("push_tokens")
          .select("expo_push_token")
          .in("device_id", deviceIds);
        (data || []).forEach(
          (r: any) => r?.expo_push_token && tokenSet.add(r.expo_push_token)
        );
      }

      const tokens = Array.from(tokenSet);
      await pushToTokens(
        tokens,
        t("bulletin.push.updatedTitle"),
        t("bulletin.push.updatedBody", { title: titleForPush }),
        { kind: "activity_updated", activityId }
      );
    } catch {}
  }

  async function submitEdit() {
    if (!editingRow) return;
    const placeName = (placeChosen?.name || placeQuery || "").trim();
    if (!title.trim() || !startDate || !placeName) {
      Alert.alert(
        t("bulletin.alerts.missingInfoTitle"),
        t("bulletin.alerts.missingInfoBody")
      );
      return;
    }
    try {
      const upd = {
        title: title.trim(),
        description: desc.trim() || null,
        category: cat,
        starts_at: startDate.toISOString(),
        place_name: placeName,
        address: placeChosen?.address ?? null,
        lat: placeChosen?.lat ?? null,
        lng: placeChosen?.lng ?? null,
        published: true,
      };
      const { error } = await supabase
        .from(TABLE)
        .update(upd)
        .eq("id", editingRow.id);
      if (error) throw error;

      await notifyInterestedUsersOnUpdate(
        editingRow.id,
        upd.title || editingRow.title
      );

      setCreating(false);
      setEditingRow(null);
      resetForm();
      loadActivities();
      Alert.alert(t("bulletin.alerts.savedTitle"), t("bulletin.alerts.savedBody"));
    } catch {
      Alert.alert(t("common.error"), t("bulletin.errors.updateFailed"));
    }
  }

  async function openInterested(row: ActivityRow) {
    setInterestedFor(row);
    setInterestedOpen(true);
    setInterestedLoading(true);
    try {
      const { data, error } = await supabase
        .from("activity_interests")
        .select(
          "id, activity_id, interested_user_id, interested_device_id, interested_name, created_at"
        )
        .eq("activity_id", row.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setInterestedList(data as InterestRow[]);
    } catch {
      Alert.alert(
        t("common.error"),
        t("bulletin.errors.interestedLoadFailed")
      );
      setInterestedList([]);
    } finally {
      setInterestedLoading(false);
    }
  }

  async function pushHostOnInterest(row: ActivityRow, interestedName: string) {
    const tokens = await getTokensForUser(
      row.user_id ?? null,
      row.owner_device_id ?? null
    );
    await pushToTokens(
      tokens,
      t("bulletin.push.newInterestTitle"),
      t("bulletin.push.newInterestBody", {
        name: interestedName,
        title: row.title,
      }),
      { kind: "new_interest", activityId: row.id }
    );
  }

  async function markInterested(row: ActivityRow) {
    if (interestedSet.has(row.id)) {
      Alert.alert(
        t("bulletin.alerts.alreadyInterestedTitle"),
        t("bulletin.alerts.alreadyInterestedBody")
      );
      return;
    }
    try {
      const { error } = await supabase.from("activity_interests").insert([
        {
          activity_id: row.id,
          activity_title: row.title,
          owner_user_id: row.user_id ?? null,
          interested_user_id: currentUserId ?? null,
          interested_device_id: deviceId || null,
          interested_name: myName ?? t("chat.neighbour"),
        },
      ]);
      if (error) throw error;

      setInterestedSet((prev) => new Set([...prev, row.id]));
      loadActivities();

      await pushHostOnInterest(row, myName ?? t("chat.neighbour"));

      scheduleReminderForActivity(row, t, locale).catch(() => {});

      Alert.alert(
        t("bulletin.alerts.interestedSavedTitle"),
        t("bulletin.alerts.interestedSavedBody")
      );
    } catch (e: any) {
      const msg = String(e?.message || "").toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique")) {
        setInterestedSet((prev) => new Set([...prev, row.id]));
        scheduleReminderForActivity(row, t, locale).catch(() => {});
        Alert.alert(
          t("bulletin.alerts.alreadyInterestedTitle"),
          t("bulletin.alerts.alreadyInterestedBody")
        );
        return;
      }
      Alert.alert(
        t("common.error"),
        t("bulletin.errors.markInterestedFailed")
      );
    }
  }

  async function canOpenChat(row: ActivityRow): Promise<boolean> {
    if (
      (currentUserId && row.user_id === currentUserId) ||
      row.owner_device_id === deviceId
    ) {
      return true;
    }
    if (interestedSet.has(row.id)) return true;

    const or = [
      currentUserId ? `interested_user_id.eq.${currentUserId}` : null,
      deviceId ? `interested_device_id.eq.${deviceId}` : null,
    ]
      .filter(Boolean)
      .join(",");
    const { data } = await supabase
      .from("activity_interests")
      .select("id")
      .eq("activity_id", row.id)
      .or(or)
      .maybeSingle();

    const allowed = !!data;
    if (allowed) setInterestedSet((prev) => new Set([...prev, row.id]));
    return allowed;
  }

  const filtered = useMemo(() => {
    const base = filterCat ? rows.filter((e) => e.category === filterCat) : rows;
    return base;
  }, [rows, filterCat]);

  const mine = useMemo(() => {
    return filtered.filter((e) =>
      currentUserId ? e.user_id === currentUserId : e.owner_device_id === deviceId
    );
  }, [filtered, currentUserId, deviceId]);

  const nearby = useMemo(() => {
    return filtered.filter((e) =>
      currentUserId ? e.user_id !== currentUserId : e.owner_device_id !== deviceId
    );
  }, [filtered, currentUserId, deviceId]);

  const catLabel = (k: string) => t(`bulletin.categories.${k}`);

  const identityKey = useMemo(
    () => identityKeyFor(currentUserId, deviceId),
    [currentUserId, deviceId]
  );
  const [unreadByActivity, setUnreadByActivity] = useState<
    Record<string, number>
  >({});
  const [lastReadByActivity, setLastReadByActivity] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    if (!rows.length || !deviceId) return;
    (async () => {
      const keys = rows.map((r) => lastReadStorageKey(r.id, identityKey));
      const kv = await AsyncStorage.multiGet(keys);
      const map: Record<string, number> = {};
      kv.forEach(([k, v]) => {
        const parts = k.split(":");
        const id = parts[2];
        const ms = v ? Number(v) : 0;
        map[id] = Number.isFinite(ms) ? ms : 0;
      });
      setLastReadByActivity(map);
    })();
  }, [rows, identityKey, deviceId]);

  useEffect(() => {
    if (!rows.length) return;
    (async () => {
      const entries = await Promise.all(
        rows.map(async (r) => {
          const sinceMs = lastReadByActivity[r.id] ?? 0;
          if (!sinceMs) return [r.id, 0] as [string, number];

          let q = supabase
            .from("activity_messages")
            .select("*", { count: "exact", head: true })
            .eq("activity_id", r.id)
            .gt("created_at", new Date(sinceMs).toISOString());

          if (currentUserId) q = q.neq("sender_user_id", currentUserId);
          else q = q.neq("sender_device_id", deviceId);

          const { count } = await q;
          return [r.id, count || 0] as [string, number];
        })
      );
      setUnreadByActivity(Object.fromEntries(entries));
    })();
  }, [rows, lastReadByActivity, currentUserId, deviceId]);

  useEffect(() => {
    if (!rows.length) return;
    const ch = supabase
      .channel("broadcast_unread_counts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_messages" },
        (payload) => {
          const m = payload.new as MsgRow;
          const isVisible = rows.some((r) => r.id === m.activity_id);
          if (!isVisible) return;

          if (
            currentUserId
              ? m.sender_user_id === currentUserId
              : m.sender_device_id === deviceId
          )
            return;

          const createdMs = new Date(m.created_at).getTime();
          const last = lastReadByActivity[m.activity_id] ?? 0;
          if (createdMs <= last) return;

          setUnreadByActivity((prev) => ({
            ...prev,
            [m.activity_id]: (prev[m.activity_id] || 0) + 1,
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [rows, lastReadByActivity, currentUserId, deviceId]);

  async function markActivityReadNow(activityId: string) {
    const now = Date.now();
    const key = lastReadStorageKey(activityId, identityKey);
    await AsyncStorage.setItem(key, String(now));
    setLastReadByActivity((prev) => ({ ...prev, [activityId]: now }));
    setUnreadByActivity((prev) => ({ ...prev, [activityId]: 0 }));
  }

  return (
    <SafeAreaView style={s.safe} edges={["left", "right"]}>
      <TopBar
        leftMode="settings"
        language={lang}
        setLanguage={setLang}
        includeTopInset
        title={t("home.bulletinBoard")}
        bgColor="#93E6AA"
        barHeight={44}
        topPadding={2}
        onLogout={async () => {
          await logout();
          router.replace("/Authentication/Welcome");
        }}
      />
      <View style={s.headerRow}>
        <View style={s.createBtnWrap}>
          <View style={s.createBtnOffset} />
          <Pressable
            onPress={() => {
              setCreating(true);
              setEditingRow(null);
              resetForm();
            }}
            style={({ pressed }) => [
              s.createBtn,
              pressed && { transform: [{ translateY: 6 }] }, 
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("bulletin.create")}
            hitSlop={8}
          >
            <Ionicons name="add-circle-outline" size={22} color="#000" />
            <Text style={s.createText}>{t("bulletin.create")}</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 6 }}>
          <Chip label={t("community.all")} active={!filterCat} onPress={() => setFilterCat(null)} />
          {CATS.map((c) => (
            <Chip
              key={c.key}
              label={catLabel(c.key)}
              icon={c.icon}
              active={filterCat === c.key}
              onPress={() => setFilterCat(c.key)}
            />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator />
          <AppText style={{ marginTop: 8 }}>{t("common.loading")}</AppText>
        </View>
      ) : (
        <FlatList
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: bottomPad }}
          data={nearby}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <>
              {mine.length > 0 && (
                <Section title={t("bulletin.sections.yours")} />
              )}
              {mine.map((row) => (
                <ActivityCard
                  key={row.id}
                  row={row}
                  myLoc={myLoc}
                  onChat={async () => {
                    const ok = await canOpenChat(row);
                    if (!ok) {
                      Alert.alert(
                        t("bulletin.alerts.chatGateTitle"),
                        t("bulletin.alerts.chatGateBody"),
                        [
                          { text: t("common.cancel"), style: "cancel" },
                          {
                            text: t("bulletin.cta.imInterested"),
                            onPress: () => markInterested(row),
                          },
                        ]
                      );
                      return;
                    }
                    await markActivityReadNow(row.id);
                    setChatFor({ id: row.id, title: row.title });
                    setChatOpen(true);
                  }}
                  onDirections={() => {
                    router.push({
                      pathname: "/tabs/Navigation",
                      params: {
                        presetQuery: row.place_name ?? "",
                        presetLat:
                          row.lat != null ? String(row.lat) : undefined,
                        presetLng:
                          row.lng != null ? String(row.lng) : undefined,
                      },
                    });
                  }}
                  isMine
                  onViewInterested={() => openInterested(row)}
                  onEdit={() => startEdit(row)}
                  unreadCount={unreadByActivity[row.id] || 0}
                />
              ))}
              <Section title={t("bulletin.sections.nearby")} />
            </>
          }
          renderItem={({ item }) => (
            <ActivityCard
              row={item}
              myLoc={myLoc}
              onChat={async () => {
                const ok = await canOpenChat(item);
                if (!ok) {
                  Alert.alert(
                    t("bulletin.alerts.chatGateTitle"),
                    t("bulletin.alerts.chatGateBody"),
                    [
                      { text: t("common.cancel"), style: "cancel" },
                      {
                        text: t("bulletin.cta.imInterested"),
                        onPress: () => markInterested(item),
                      },
                    ]
                  );
                  return;
                }
                await markActivityReadNow(item.id);
                setChatFor({ id: item.id, title: item.title });
                setChatOpen(true);
              }}
              onDirections={() => {
                router.push({
                  pathname: "/tabs/Navigation",
                  params: {
                    presetQuery: item.place_name ?? "",
                    presetLat:
                      item.lat != null ? String(item.lat) : undefined,
                    presetLng:
                      item.lng != null ? String(item.lng) : undefined,
                  },
                });
              }}
              onInterested={() => markInterested(item)}
              alreadyInterested={interestedSet.has(item.id)}
              unreadCount={unreadByActivity[item.id] || 0}
            />
          )}
          ListEmptyComponent={
            <View style={{ padding: 16 }}>
              <AppText>{t("bulletin.empty")}</AppText>
            </View>
          }
        />
      )}

      <Modal
        visible={!!chatFor && chatOpen}
        animationType="slide"
        onRequestClose={() => setChatOpen(false)}
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
        statusBarTranslucent
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: "#FFFFFF" }}
          edges={["bottom"]}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={insets.top}
          >
            {chatFor ? (
              <ActivityChat
                onClose={() => setChatOpen(false)}
                activityId={chatFor.id}
                activityTitle={chatFor.title}
                currentUserId={currentUserId}
                currentUserName={myName ?? null}
              />
            ) : null}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {interestedFor && (
        <InterestedModal
          visible={interestedOpen}
          onClose={() => setInterestedOpen(false)}
          rows={interestedList}
          loading={interestedLoading}
          title={interestedFor.title}
        />
      )}

      <Modal
        visible={creating}
        animationType="slide"
        onRequestClose={() => setCreating(false)}
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
        statusBarTranslucent
      >
        <SafeAreaView
          style={[s.modalSafe, { paddingTop: insets.top }]}
          edges={["top", "left", "right"]}
        >
          <View style={s.modalHead}>
            <AppText variant="h1" weight="900">
              {editingRow
                ? t("bulletin.form.titleEdit")
                : t("bulletin.form.titleNew")}
            </AppText>
            <AppText style={{ color: "#6B7280", marginTop: 4 }}>
              {t("bulletin.form.subtitleHint")}
            </AppText>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: 40 + insets.bottom,
              }}
              keyboardShouldPersistTaps="handled"
            >
              <Labeled label={t("bulletin.form.name")}>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder={t("bulletin.form.namePH")}
                  style={[s.input, { color: "#000000" }]}
                />
              </Labeled>

              <Labeled label={t("bulletin.form.category")}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {CATS.map((c) => (
                    <Pressable
                      key={c.key}
                      onPress={() => setCat(c.key)}
                      style={[
                        s.catPill,
                        cat === c.key && {
                          backgroundColor: "#CFADE8",
                          borderColor: "#CFADE8",
                        },
                      ]}
                    >
                      <Ionicons
                        name={c.icon}
                        size={16}
                        color={cat === c.key ? "#111" : "#6B7280"}
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        style={[
                          s.catPillText,
                          cat === c.key && { color: "#000" },
                        ]}
                      >
                        {catLabel(c.key)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </Labeled>
              <Labeled label={t("bulletin.form.start")}>
                <CalendarTimePicker
                  inline
                  value={startDate}
                  onConfirm={setStartDate}
                  minuteStep={5}
                  locale={(i18n.language as string) || "en-SG"}
                  showTitle={false}   
                  framed={false}      
                  style={{ alignSelf: "stretch" }} 
                />
              </Labeled>
              <Labeled label={t("bulletin.form.location")}>
                <TextInput
                  value={placeQuery}
                  onChangeText={(v) => {
                    setPlaceQuery(v);
                    setPlaceChosen(null);
                  }}
                  placeholder={t("bulletin.form.locationPH")}
                  style={s.input}
                />
                {!!GOOGLE_PLACES_KEY && !!placePreds.length && (
                  <View style={s.suggestBox}>
                    {placePreds.map((p) => {
                      const main =
                        p.structured_formatting?.main_text || p.description;
                      const sec = p.structured_formatting?.secondary_text;
                      return (
                        <Pressable
                          key={p.place_id}
                          style={s.suggestRow}
                          onPress={() => pickPrediction(p)}
                        >
                          <Ionicons
                            name="location-outline"
                            size={18}
                            color="#0EA5E9"
                          />
                          <Text
                            style={{ marginLeft: 8, flex: 1 }}
                            numberOfLines={1}
                          >
                            {main}
                            {sec ? ` · ${sec}` : ""}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                {!!placeChosen && (
                  <AppText style={{ marginTop: 6, color: "#16A34A" }}>
                    {t("bulletin.form.picked", { name: placeChosen.name })}
                  </AppText>
                )}
                {!GOOGLE_PLACES_KEY && (
                  <AppText style={{ marginTop: 6, color: "#B45309" }}>
                    {t("bulletin.form.noPlacesKey")}
                  </AppText>
                )}
              </Labeled>

              <Labeled label={t("bulletin.form.detailsOptional")}>
                <TextInput
                  value={desc}
                  onChangeText={setDesc}
                  placeholder={t("bulletin.form.detailsPH")}
                  style={[s.input, { height: 90, textAlignVertical: "top" }]}
                  multiline
                />
              </Labeled>

              <View style={{ height: 12 }} />

              <Pressable
                onPress={editingRow ? submitEdit : submitCreate}
                style={[s.publishBtn]}
              >
                <Ionicons
                  name={editingRow ? "save-outline" : "megaphone-outline"}
                  size={20}
                  color="#111827"
                />
                <Text style={[s.publishText, { color: "#111827" }]}>
                  {editingRow ? t("common.save") : t("bulletin.post")}
                </Text>
              </Pressable>

              <Pressable onPress={() => setCreating(false)} style={s.cancelBtn}>
                <Text style={s.cancelText}>{t("common.close")}</Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ title }: { title: string }) {
  return (
    <View style={{ paddingHorizontal: 4, paddingTop: 12, paddingBottom: 6 }}>
      <AppText variant="title" weight="800">
        {title}
      </AppText>
    </View>
  );
}

function Chip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon?: IconName;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.chip,
        active && { backgroundColor: "#CFADE8", borderColor: "#CFADE8" },
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={14}
          color={"#111"} 
          style={{ marginRight: 6 }}
        />
      )}
      <Text style={[s.chipText]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <AppText weight="800" style={{ marginBottom: 6 }}>
        {label}
      </AppText>
      {children}
    </View>
  );
}

function ActivityCard({
  row,
  myLoc,
  onDirections,
  onChat,
  isMine,
  onInterested,
  onViewInterested,
  onEdit,
  alreadyInterested,
  unreadCount = 0,
}: {
  row: ActivityRow;
  myLoc: LatLng | null;
  onDirections: () => void;
  onChat: () => void;
  isMine?: boolean;
  onInterested?: () => void;
  onViewInterested?: () => void;
  onEdit?: () => void;
  alreadyInterested?: boolean;
  unreadCount?: number;
}) {
  const { t } = useTranslation();
  const when = new Date(row.starts_at);
  const timeStr = when.toLocaleString("en-SG", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const dist =
    myLoc && row.lat != null && row.lng != null
      ? kmStr(distanceMeters(myLoc, { latitude: row.lat, longitude: row.lng }))
      : "";
  const catInfo = CATS.find((c) => c.key === row.category);
  const count = row.interest_count ?? 0;

  return (
    <View style={s.card}>
      <View style={stylesCard.header}>
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          {catInfo && (
            <View style={stylesCard.catIconBubble}>
              <Ionicons name={catInfo.icon} size={16} color="#0F172A" />
            </View>
          )}
          <AppText
            variant="title"
            weight="900"
            numberOfLines={1}
            style={{ flex: 1 }}
          >
            {row.title}
          </AppText>
        </View>

        {isMine && !!onEdit && (
          <Pressable
            onPress={onEdit}
            hitSlop={8}
            style={stylesCard.iconBtnGhost}
            accessibilityLabel={t("common.edit")}
          >
            <Ionicons name="create-outline" size={18} color="#0EA5E9" />
          </Pressable>
        )}
      </View>

      <View style={stylesCard.metaRow}>
        <View style={stylesCard.metaChip}>
          <Ionicons name="time-outline" size={14} color="#0F172A" />
          <Text style={stylesCard.metaText}>{timeStr}</Text>
        </View>
        <View style={stylesCard.metaChip}>
          <Ionicons name="location-outline" size={14} color="#0F172A" />
          <Text style={stylesCard.metaText} numberOfLines={1}>
            {row.place_name || "—"} {dist ? `· ${dist}` : ""}
          </Text>
        </View>

        <Pressable
          disabled={!onViewInterested && !isMine}
          onPress={onViewInterested}
          style={[stylesCard.metaChip, { paddingHorizontal: 8 }]}
          accessibilityLabel={t("bulletin.interested")}
        >
          <Ionicons name="people-outline" size={14} color="#0F172A" />
          <Text style={stylesCard.metaText}>{count}</Text>
        </Pressable>
      </View>

      {!!row.description && (
        <Text style={{ color: "#374151", marginTop: 10 }} numberOfLines={3}>
          {row.description}
        </Text>
      )}

      <View style={stylesCard.actionsRow}>
        <IconCircle
          onPress={onChat}
          icon="chatbubble-ellipses-outline"
          label={t("bulletin.actions.chat")}
          badge={unreadCount}
        />
        <IconCircle
          onPress={onDirections}
          icon="navigate-outline"
          label={t("bulletin.actions.go")}
        />
        {!isMine && !!onInterested && (
          <Pressable
            onPress={() => {
              if (alreadyInterested) {
                Alert.alert(
                  t("bulletin.alerts.alreadyInterestedTitle"),
                  t("bulletin.alerts.alreadyInterestedBody")
                );
              } else {
                onInterested();
              }
            }}
            style={[
              stylesCard.circleBtn,
              alreadyInterested ? { backgroundColor: "#16A34A" } : null,
            ]}
            accessibilityLabel={t("bulletin.actions.interested")}
          >
            <Ionicons
              name={alreadyInterested ? "heart" : "heart-outline"}
              size={18}
              color={alreadyInterested ? "#fff" : "#0F172A"}
            />
          </Pressable>
        )}
        {isMine && (
          <View style={stylesCard.minePill}>
            <Text style={stylesCard.mineText}>{t("bulletin.badges.mine")}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function IconCircle({
  onPress,
  icon,
  label,
  filled = false,
  badge,
}: {
  onPress: () => void;
  icon: IconName;
  label: string;
  filled?: boolean;
  badge?: number;
}) {
  return (
    <View style={stylesCard.iconWrap}>
      <Pressable
        onPress={onPress}
        style={[stylesCard.circleBtn, filled && { backgroundColor: "#16A34A" }]}
        accessibilityLabel={label}
      >
        <Ionicons name={icon} size={18} color={filled ? "#fff" : "#0F172A"} />
      </Pressable>

      {typeof badge === "number" && badge > 0 && (
        <View style={stylesCard.badge}>
          <Text style={stylesCard.badgeText}>{badge > 99 ? "99+" : badge}</Text>
        </View>
      )}
    </View>
  );
}

function InterestedModal({
  visible,
  onClose,
  rows,
  loading,
  title,
}: {
  visible: boolean;
  onClose: () => void;
  rows: InterestRow[];
  loading: boolean;
  title?: string;
}) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <View
          style={{
            height: 52,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 8,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: "#E5E7EB",
            backgroundColor: "#fff",
          }}
        >
          <Pressable onPress={onClose} hitSlop={8} style={{ padding: 6 }}>
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </Pressable>
          <Text
            style={{
              fontWeight: "800",
              fontSize: 16,
              flex: 1,
              textAlign: "center",
            }}
          >
            {title
              ? t("bulletin.modal.interestedWith", { title })
              : t("bulletin.modal.interested")}
          </Text>
          <View style={{ width: 30 }} />
        </View>

        {loading ? (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <ActivityIndicator />
          </View>
        ) : rows.length === 0 ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: "#6B7280" }}>{t("bulletin.modal.none")}</Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(r) => r.id}
            contentContainerStyle={{ padding: 12 }}
            renderItem={({ item }) => (
              <View
                style={{
                  backgroundColor: "#fff",
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <Text style={{ fontWeight: "800" }}>
                  {item.interested_name || t("chat.neighbour")}
                </Text>
                <Text style={{ color: "#6B7280", marginTop: 2 }}>
                  {new Date(item.created_at).toLocaleString("en-SG", {
                    hour12: false,
                  })}
                </Text>
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFAF0" },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FED787",
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    borderRadius: 10,
    marginRight: 4,
  },
  createText: { color: "#000", fontWeight: "800", marginLeft: 6 },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 6 : 5,
    borderRadius: 14,
    backgroundColor: "#fff",
    marginRight: 8,
  },
  chipText: { fontSize: 12, fontWeight: "700", color: "#111827" },

  card: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    marginTop: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },

  modalSafe: { flex: 1, backgroundColor: "#FFFAF0" },
  modalHead: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 10 },

  pickerCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 10,
  },

  input: {
    width: "100%",
    borderWidth: 2,
    borderColor: "#1F2937",
    paddingHorizontal: 14,
    height: 57,
    borderRadius: 8,
    backgroundColor: "#FFF",
    color: "#111827",
    marginBottom: 10,
    fontSize: 16,
  },
  catPill: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D0D5DD",
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 6 : 5,
    borderRadius: 14,
    backgroundColor: "#FFF",
    marginRight: 8,
  },
  catPillText: { fontSize: 12, fontWeight: "700", color: "#111827" },

  suggestBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  suggestRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },

  publishBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FED787",
    paddingVertical: 14,
    borderRadius: 12,
    justifyContent: "center",
  },
  publishText: {
    fontWeight: "900",
    marginLeft: 8,
    fontSize: 16,
  },
  cancelBtn: { alignSelf: "center", marginTop: 10, padding: 10 },
  cancelText: { color: "#6B7280", fontWeight: "800" },
    createBtnWrap: {
    position: "relative",
    borderRadius: 10,
  },
  createBtnOffset: {
    position: "absolute",
    top: 6,            
    left: 0,
    right: 0,
    height: Platform.OS === "ios" ? 40 : 38, 
    borderRadius: 10,
    backgroundColor: "#F6C96D", 
  },
});

const stylesCard = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  catIconBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E2E8F0",
    marginRight: 8,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap",
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
  },
  metaText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0F172A",
    maxWidth: 180,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  iconBtnGhost: { padding: 6, borderRadius: 10 },
  minePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#DCFCE7",
    marginLeft: 4,
  },
  mineText: { color: "#166534", fontWeight: "900", fontSize: 12 },

  iconWrap: {
    position: "relative",
    width: 40,
    height: 40,
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "900" },
    headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },

  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FED787", 
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#11182720",
    transform: [{ translateY: 0 }], 
  },
  createText: { color: "#000", fontWeight: "800", marginLeft: 6 },
});

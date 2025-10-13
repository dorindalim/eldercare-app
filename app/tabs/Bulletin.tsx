import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import Constants from "expo-constants";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import * as SMS from "expo-sms";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../src/auth/AuthProvider";
import AppText from "../../src/components/AppText";
import TopBar, { type LangCode } from "../../src/components/TopBar";
import { supabase } from "../../src/lib/supabase";

/* ---------------------- helpers & local identity ---------------------- */

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

const DEVICE_ID_KEY = "bulletin:device_id_v1";
const LAST_SEEN_KEY = "bulletin:last_seen_ts_v1";
async function getDeviceId(): Promise<string> {
  const cur = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (cur) return cur;
  // quick random id
  const id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

async function ensureNotifPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.status === "granted";
}
async function notifyNow(title: string, body?: string) {
  if (!(await ensureNotifPermission())) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null,
  });
}

/* ------------------------------- types -------------------------------- */

const CATS: { key: string; label: string; icon: IconName }[] = [
  { key: "kopi",     label: "Kopi & Chat",        icon: "chatbubbles-outline" },
  { key: "mahjong",  label: "Mahjong & Games",    icon: "grid-outline" },
  { key: "crafts",   label: "Kampung Crafts",     icon: "color-palette-outline" },
  { key: "stretch",  label: "Tai Chi & Stretch",  icon: "body-outline" },
  { key: "walks",    label: "Morning Walks",      icon: "walk-outline" },
  { key: "learning", label: "Learning Corner",    icon: "school-outline" },
  { key: "volunteer",label: "Kampung Volunteers", icon: "hand-left-outline" },
];

type ActivityRow = {
  id: string;
  user_id: string | null;
  owner_device_id: string | null; // NEW
  title: string;
  description: string | null;
  category: string;
  starts_at: string;
  place_name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  contact_phone: string | null;
  photo_url: string | null;
  published: boolean;
  interest_count: number | null;
  created_at: string;
  updated_at: string;
  distance_m?: number | null;
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

type InterestRow = {
  id: string;
  activity_id: string;
  owner_user_id: string | null;
  owner_device_id: string | null;
  interested_user_id: string | null;
  interested_device_id: string | null;
  interested_name: string | null;
  activity_title: string | null;
  created_at: string;
};

const GOOGLE_PLACES_KEY: string | undefined =
  (Constants?.expoConfig?.extra as any)?.GOOGLE_PLACES_KEY ||
  (Constants as any)?.manifest2?.extra?.GOOGLE_PLACES_KEY;

const MY_IDS_KEY = "my_activity_ids_v1";

/* -------------------------------- Screen ------------------------------- */

export default function Bulletin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const hasSession = !!session?.userId;

  const [deviceId, setDeviceId] = useState<string>("");
  useEffect(() => { getDeviceId().then(setDeviceId); }, []);

  // For anon users, track IDs created on this device
  const [myIds, setMyIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem(MY_IDS_KEY).then((raw) => {
      if (!raw) return;
      try { setMyIds(new Set(JSON.parse(raw) as string[])); } catch {}
    });
  }, []);
  async function rememberMyId(id: string) {
    if (hasSession) return;
    const next = new Set(myIds);
    next.add(id);
    setMyIds(next);
    await AsyncStorage.setItem(MY_IDS_KEY, JSON.stringify(Array.from(next)));
  }

  // Location (for distance sort)
  const [myLoc, setMyLoc] = useState<LatLng | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setMyLoc({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        }
      } catch {}
    })();
  }, []);

  // Data
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Form (create & edit share same state)
  const [creating, setCreating] = useState(false);
  const [editingRow, setEditingRow] = useState<ActivityRow | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState<string>(CATS[0].key);
  const [date, setDate] = useState<Date>(new Date(Date.now() + 3600_000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placePreds, setPlacePreds] = useState<GPred[]>([]);
  const [placeChosen, setPlaceChosen] = useState<{
    name: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
  } | null>(null);
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // “My interested activities” set for update notifications
  const [myInterestedIds, setMyInterestedIds] = useState<Set<string>>(new Set());

  /* --------------------- fetch activities + interests --------------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("community_activities")
          .select("*")
          .order("starts_at", { ascending: true });
        if (error) throw error;
        let out = (data || []) as ActivityRow[];
        if (myLoc && out.length <= 300) {
          out = out
            .map((r) =>
              r.lat != null && r.lng != null
                ? { ...r, distance_m: distanceMeters(myLoc, { latitude: r.lat, longitude: r.lng }) }
                : { ...r, distance_m: null }
            )
            .sort((a, b) => (a.distance_m ?? 1e15) - (b.distance_m ?? 1e15));
        }
        if (!cancelled) setRows(out);
      } catch (e: any) {
        if (!cancelled) Alert.alert("Error", e?.message ?? "Could not load activities.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [myLoc, refreshKey]);

  // Load my interested list (for update alerts)
  useEffect(() => {
    (async () => {
      if (!deviceId) return;
      const q = supabase
        .from("activity_interests")
        .select("activity_id")
        .eq("interested_device_id", deviceId);
      if (hasSession && session?.userId) q.eq("interested_user_id", session.userId);
      const { data } = await q;
      const set = new Set((data || []).map((r: any) => r.activity_id as string));
      setMyInterestedIds(set);
    })();
  }, [deviceId, hasSession, session, refreshKey]);

  /* -------------------- Google Places suggestions flow -------------------- */
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
      } catch { setPlacePreds([]); }
    }, 350);
    return () => { clearTimeout(id); ctrl.abort(); };
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
      const name = json.result?.name || p.structured_formatting?.main_text || p.description;
      const address = json.result?.formatted_address || p.description;
      const lat = json.result?.geometry?.location?.lat ?? null;
      const lng = json.result?.geometry?.location?.lng ?? null;
      setPlaceChosen({ name: name || address || "Selected place", address: address ?? null, lat, lng });
      setPlaceQuery(name || address || "");
      setPlacePreds([]);
    } catch {}
  }

  /* -------------------------- Create / Edit submit ------------------------ */

  async function submitCreate() {
    if (!title.trim() || !placeChosen?.name || !date) {
      Alert.alert("Missing info", "Please fill in Title, Date/Time and Location.");
      return;
    }
    setSubmitting(true);
    try {
      let insertUserId: string | null = null;
      if (hasSession && session?.userId) {
        const { data: u } = await supabase.from("users").select("id").eq("id", session.userId).maybeSingle();
        if (u?.id) insertUserId = session.userId;
      }
      const insert = {
        user_id: insertUserId,
        owner_device_id: deviceId || null,
        title: title.trim(),
        description: desc.trim() || null,
        category: cat,
        starts_at: date.toISOString(),
        place_name: placeChosen?.name,
        address: placeChosen?.address ?? null,
        lat: placeChosen?.lat ?? null,
        lng: placeChosen?.lng ?? null,
        contact_phone: contact.trim() || null,
        photo_url: null,
        published: true,
      };
      const { data, error } = await supabase
        .from("community_activities")
        .insert([insert])
        .select("id")
        .single();
      if (error) throw error;

      if (!hasSession && data?.id) await rememberMyId(data.id);

      setCreating(false);
      resetForm();
      setRefreshKey((k) => k + 1);
      Alert.alert("Posted!", "Your neighbour activity is now visible.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not post activity.");
    } finally { setSubmitting(false); }
  }

  async function submitEdit() {
    if (!editingRow) return;
    if (!title.trim() || !placeChosen?.name || !date) {
      Alert.alert("Missing info", "Please fill in Title, Date/Time and Location.");
      return;
    }
    setSubmitting(true);
    try {
      const upd = {
        title: title.trim(),
        description: desc.trim() || null,
        category: cat,
        starts_at: date.toISOString(),
        place_name: placeChosen?.name,
        address: placeChosen?.address ?? null,
        lat: placeChosen?.lat ?? null,
        lng: placeChosen?.lng ?? null,
        contact_phone: contact.trim() || null,
        published: true,
      };
      const { error } = await supabase.from("community_activities").update(upd).eq("id", editingRow.id);
      if (error) throw error;

      // Interested devices will receive a realtime UPDATE and self-notify.
      Alert.alert("Saved", "Your activity has been updated.");
      setEditingRow(null);
      resetForm();
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not update activity.");
    } finally { setSubmitting(false); }
  }

  function resetForm() {
    setTitle("");
    setDesc("");
    setCat(CATS[0].key);
    setDate(new Date(Date.now() + 3600_000));
    setPlaceQuery("");
    setPlacePreds([]);
    setPlaceChosen(null);
    setContact("");
  }

  /* ------------------------ Mark Interested (RPC) ------------------------- */

  async function markInterested(row: ActivityRow) {
    try {
      // Who’s interested? Grab name if available from profile (optional).
      let interestedName: string | null = null;
      try {
        if (hasSession && session?.userId) {
          const { data: prof } = await supabase
            .from("elderly_profiles")
            .select("name")
            .eq("user_id", session.userId)
            .maybeSingle();
          if (prof?.name) interestedName = prof.name as string;
        }
      } catch {}

      // Insert an interest row (so the owner’s device can be notified)
      const interest = {
        activity_id: row.id,
        owner_user_id: row.user_id,
        owner_device_id: row.owner_device_id,
        interested_user_id: hasSession ? session!.userId : null,
        interested_device_id: deviceId || null,
        interested_name: interestedName,
        activity_title: row.title,
      };
      const { error: insErr } = await supabase.from("activity_interests").insert([interest]);
      if (insErr) throw insErr;

      // Bump the visible count (race-safe)
      const { error } = await supabase.rpc("bump_interest", { p_id: row.id });
      if (error) throw error;

      // Optionally let the interested user contact creator immediately
      if (row.contact_phone) {
        const msg = `Hello! I'm keen to join "${row.title}" on ${new Date(row.starts_at)
          .toLocaleString("en-SG", { hour12: false })}.`;
        const smsOK = await SMS.isAvailableAsync();
        if (smsOK) await SMS.sendSMSAsync([row.contact_phone], msg);
      }

      setRefreshKey((k) => k + 1);
      Alert.alert("Got it 👍", "We’ve noted your interest.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not mark interest.");
    }
  }

  /* --------------------- Realtime & “when you come back” ------------------- */

  // Realtime: notify creators on new interests
  useEffect(() => {
    if (!deviceId) return;
    const ch = supabase
      .channel("interests_for_owner")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_interests" },
        (payload: any) => {
          const row = payload.new as InterestRow;
          const mineByDevice = row.owner_device_id && row.owner_device_id === deviceId;
          const mineByUser = hasSession && session?.userId && row.owner_user_id === session.userId;
          if (mineByDevice || mineByUser) {
            const who = row.interested_name || "Someone";
            const title = `${who} is interested in your activity`;
            const body = row.activity_title || "Your activity";
            notifyNow(title, body);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [deviceId, hasSession, session]);

  // Realtime: notify interested users on activity updates
  useEffect(() => {
    const ch = supabase
      .channel("activity_updates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "community_activities" },
        (payload: any) => {
          const row = payload.new as ActivityRow;
          if (myInterestedIds.has(row.id)) {
            notifyNow("Activity updated", row.title);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [myInterestedIds]);

  // On app resume → check for any new interests (for me) & updates (for my interests) since last_seen
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === "active") {
        try {
          const lastSeenRaw = (await AsyncStorage.getItem(LAST_SEEN_KEY)) || "1970-01-01T00:00:00Z";
          const since = new Date(lastSeenRaw).toISOString();

          // New interests for me (owner)
          const q1 = supabase
            .from("activity_interests")
            .select("interested_name, activity_title, owner_user_id, owner_device_id, created_at")
            .gt("created_at", since)
            .order("created_at", { ascending: true });
          const { data: interests } = await q1;
          for (const it of interests || []) {
            const mineByDevice = it.owner_device_id && it.owner_device_id === deviceId;
            const mineByUser = hasSession && session?.userId && it.owner_user_id === session.userId;
            if (mineByDevice || mineByUser) {
              const who = it.interested_name || "Someone";
              await notifyNow(`${who} is interested in your activity`, it.activity_title || "Your activity");
            }
          }

          // Updates to activities I’m interested in
          if (myInterestedIds.size) {
            const ids = Array.from(myInterestedIds);
            const { data: ups } = await supabase
              .from("community_activities")
              .select("id, title, updated_at")
              .in("id", ids)
              .gt("updated_at", since);
            for (const u of ups || []) {
              await notifyNow("Activity updated", u.title);
            }
          }
        } catch {}
      }
      appStateRef.current = next;
      // record last seen
      await AsyncStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    });
    return () => sub.remove();
  }, [deviceId, hasSession, session, myInterestedIds]);

  /* -------------------------------- filtering ------------------------------ */

  const filtered = useMemo(() => {
    const base = filterCat ? rows.filter((e) => e.category === filterCat) : rows;
    if (!myLoc) return base;
    return base
      .map((e) => ({
        ...e,
        distance_m:
          e.lat != null && e.lng != null
            ? distanceMeters(myLoc, { latitude: e.lat, longitude: e.lng })
            : null,
      }))
      .sort((a, b) => (a.distance_m ?? 1e15) - (b.distance_m ?? 1e15));
  }, [rows, filterCat, myLoc]);

  const mine = useMemo(() => {
    if (hasSession) return filtered.filter((e) => e.user_id === session!.userId);
    return filtered.filter((e) => myIds.has(e.id) || e.owner_device_id === deviceId);
  }, [filtered, hasSession, session, myIds, deviceId]);

  const nearby = useMemo(() => {
    if (hasSession) return filtered.filter((e) => e.user_id !== session!.userId);
    return filtered.filter((e) => !(myIds.has(e.id) || e.owner_device_id === deviceId));
  }, [filtered, hasSession, session, myIds, deviceId]);

  const setLang = async (code: string) => {};

  /* --------------------------------- render -------------------------------- */

  return (
    <SafeAreaView style={s.safe} edges={["left", "right"]}>
      <TopBar
        language={"en" as LangCode}
        setLanguage={setLang as (c: LangCode) => void}
        includeTopInset
        title="Bulletin Board"
      />

      {/* Create + filter chips */}
      <View style={s.headerRow}>
        <Pressable style={s.createBtn} onPress={() => { setCreating(true); setEditingRow(null); resetForm(); }}>
          <Ionicons name="add-circle-outline" size={22} color="#fff" />
          <Text style={s.createText}>Create Activity</Text>
        </Pressable>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 6 }}>
          <Chip label="All" active={!filterCat} onPress={() => setFilterCat(null)} />
          {CATS.map((c) => (
            <Chip key={c.key} label={c.label} icon={c.icon} active={filterCat === c.key} onPress={() => setFilterCat(c.key)} />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
          <AppText style={{ marginTop: 8 }}>Loading activities…</AppText>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
          data={nearby}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <>
              {mine.length > 0 && <Section title="Your Activities" />}
              {mine.map((row) => (
                <ActivityCard
                  key={row.id}
                  row={row}
                  myLoc={myLoc}
                  isMine
                  onEdit={() => {
                    // load into form
                    setEditingRow(row);
                    setTitle(row.title);
                    setDesc(row.description || "");
                    setCat(row.category);
                    setDate(new Date(row.starts_at));
                    setPlaceQuery(row.place_name || "");
                    setPlaceChosen({ name: row.place_name, address: row.address, lat: row.lat, lng: row.lng });
                    setContact(row.contact_phone || "");
                    setCreating(true);
                  }}
                  onInterested={markInterested}
                  onDirections={() => {
                    router.push({
                      pathname: "/tabs/Navigation",
                      params: {
                        presetQuery: row.place_name ?? "",
                        presetLat: row.lat != null ? String(row.lat) : undefined,
                        presetLng: row.lng != null ? String(row.lng) : undefined,
                      },
                    });
                  }}
                />
              ))}
              <Section title="Nearby Activities" />
            </>
          }
          renderItem={({ item }) => (
            <ActivityCard
              row={item}
              myLoc={myLoc}
              onInterested={markInterested}
              onDirections={() => {
                router.push({
                  pathname: "/tabs/Navigation",
                  params: {
                    presetQuery: item.place_name ?? "",
                    presetLat: item.lat != null ? String(item.lat) : undefined,
                    presetLng: item.lng != null ? String(item.lng) : undefined,
                  },
                });
              }}
            />
          )}
          ListEmptyComponent={<View style={{ padding: 16 }}><AppText>No activities yet. Be the first!</AppText></View>}
        />
      )}

      {/* Create/Edit modal */}
      <Modal
        visible={creating}
        animationType="slide"
        onRequestClose={() => setCreating(false)}
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
        statusBarTranslucent
      >
        <SafeAreaView style={[s.modalSafe, { paddingTop: insets.top }]} edges={["top","left","right"]}>
          <View style={s.modalHead}>
            <AppText variant="h1" weight="900">{editingRow ? "Edit Activity" : "New Neighbour Activity"}</AppText>
            <AppText style={{ color: "#6B7280", marginTop: 4 }}>
              {editingRow ? "Update details; neighbours who marked interest will be alerted." : "Keep it simple — neighbours nearby will see this."}
            </AppText>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 + insets.bottom }}
              contentInsetAdjustmentBehavior="always"
              keyboardShouldPersistTaps="handled"
            >
              <Labeled label="Activity name">
                <TextInput value={title} onChangeText={setTitle} placeholder="e.g., Kopi Chat @ Void Deck" style={s.input} />
              </Labeled>

              <Labeled label="Category">
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {CATS.map((c) => (
                    <Pressable
                      key={c.key}
                      onPress={() => setCat(c.key)}
                      style={[s.catPill, cat === c.key && { backgroundColor: "#0EA5E9", borderColor: "#0EA5E9" }]}
                    >
                      <Ionicons name={c.icon} size={16} color={cat === c.key ? "#fff" : "#111"} style={{ marginRight: 6 }} />
                      <Text style={[s.catPillText, cat === c.key && { color: "#fff" }]}>{c.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </Labeled>

              <Labeled label="Date & time">
                <Pressable style={s.input} onPress={() => setShowDatePicker(true)}>
                  <Text>{date.toLocaleString("en-SG", { hour12: false })}</Text>
                </Pressable>
                {showDatePicker && (
                  <DateTimePicker
                    value={date}
                    mode="datetime"
                    display={Platform.OS === "ios" ? "inline" : "default"}
                    onChange={(_, d) => { setShowDatePicker(false); if (d) setDate(d); }}
                  />
                )}
              </Labeled>

              <Labeled label="Location (Google search & pick)">
                <TextInput
                  value={placeQuery}
                  onChangeText={setPlaceQuery}
                  placeholder="Type HDB/CC/Hawker, e.g., 'Tampines West CC'"
                  style={s.input}
                />
                {!!GOOGLE_PLACES_KEY && !!placePreds.length && (
                  <View style={s.suggestBox}>
                    {placePreds.map((p) => {
                      const main = p.structured_formatting?.main_text || p.description;
                      const sec = p.structured_formatting?.secondary_text;
                      return (
                        <Pressable key={p.place_id} style={s.suggestRow} onPress={() => pickPrediction(p)}>
                          <Ionicons name="location-outline" size={18} color="#0EA5E9" />
                          <Text style={{ marginLeft: 8, flex: 1 }} numberOfLines={1}>{main}{sec ? ` · ${sec}` : ""}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                {!!placeChosen && (
                  <AppText style={{ marginTop: 6, color: "#16A34A" }}>
                    Picked: {placeChosen.name}
                  </AppText>
                )}
                {!GOOGLE_PLACES_KEY && (
                  <AppText style={{ marginTop: 6, color: "#B45309" }}>
                    Set GOOGLE_PLACES_KEY to enable suggestions.
                  </AppText>
                )}
              </Labeled>

              <Labeled label="Details (optional)">
                <TextInput
                  value={desc}
                  onChangeText={setDesc}
                  placeholder="What to bring? e.g., water bottle, comfy shoes."
                  style={[s.input, { height: 90, textAlignVertical: "top" }]}
                  multiline
                />
              </Labeled>

              <Labeled label="Phone to message you (optional)">
                <TextInput
                  value={contact}
                  onChangeText={setContact}
                  placeholder="+65 9123 4567"
                  keyboardType="phone-pad"
                  style={s.input}
                />
              </Labeled>

              <View style={{ height: 12 }} />

              <Pressable
                onPress={editingRow ? submitEdit : submitCreate}
                disabled={submitting}
                style={[s.publishBtn, submitting && { opacity: 0.6 }]}
              >
                <Ionicons name={editingRow ? "save-outline" : "megaphone-outline"} size={20} color="#fff" />
                <Text style={s.publishText}>{submitting ? (editingRow ? "Saving…" : "Posting…") : (editingRow ? "Save Changes" : "Post Activity")}</Text>
              </Pressable>

              <Pressable onPress={() => setCreating(false)} style={s.cancelBtn}>
                <Text style={s.cancelText}>Close</Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

/* ------------------------------- UI bits ------------------------------- */

function Section({ title }: { title: string }) {
  return (
    <View style={{ paddingHorizontal: 4, paddingTop: 12, paddingBottom: 6 }}>
      <AppText variant="title" weight="800">{title}</AppText>
    </View>
  );
}

function Chip({
  label, icon, active, onPress,
}: { label: string; icon?: IconName; active?: boolean; onPress?: () => void; }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && { backgroundColor: "#111827", borderColor: "#111827" }]}>
      {icon && <Ionicons name={icon} size={14} color={active ? "#fff" : "#111"} style={{ marginRight: 6 }} />}
      <Text style={[s.chipText, active && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontWeight: "800", marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  );
}

function ActivityCard({
  row, myLoc, onInterested, onDirections, onEdit, isMine,
}: {
  row: ActivityRow;
  myLoc: LatLng | null;
  onInterested: (row: ActivityRow) => void;
  onDirections: () => void;
  onEdit?: () => void;
  isMine?: boolean;
}) {
  const when = new Date(row.starts_at).toLocaleString("en-SG", { hour12: false });
  const dist =
    myLoc && row.lat != null && row.lng != null
      ? kmStr(distanceMeters(myLoc, { latitude: row.lat, longitude: row.lng }))
      : "";
  const catInfo = CATS.find((c) => c.key === row.category);

  return (
    <View style={s.card}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <AppText variant="title" weight="800">{row.title}</AppText>
        {isMine && (
          <Pressable onPress={onEdit} hitSlop={8} style={{ padding: 4 }}>
            <Ionicons name="create-outline" size={18} color="#0EA5E9" />
          </Pressable>
        )}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
        <Ionicons name="time-outline" size={16} color="#111" />
        <Text style={{ marginLeft: 6 }}>{when}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
        <Ionicons name="location-outline" size={16} color="#111" />
        <Text style={{ marginLeft: 6 }} numberOfLines={1}>
          {row.place_name}{dist ? ` • ${dist}` : ""}
        </Text>
      </View>

      {!!row.description && (
        <Text style={{ marginTop: 6, color: "#374151" }} numberOfLines={3}>
          {row.description}
        </Text>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
        {catInfo && <Chip label={catInfo.label} icon={catInfo.icon} />}
        {!!row.interest_count && (
          <Text style={{ marginLeft: 10, color: "#6B7280" }}>
            {row.interest_count} interested
          </Text>
        )}
        {isMine && (
          <Text style={{ marginLeft: 10, color: "#16A34A", fontWeight: "800" }}>
            Your activity
          </Text>
        )}
      </View>

      <View style={s.btnRow}>
        <Pressable style={s.secondaryBtn} onPress={onDirections}>
          <Ionicons name="navigate-outline" size={18} color="#111" />
          <Text style={{ marginLeft: 6, fontWeight: "800" }}>Directions</Text>
        </Pressable>
        {!isMine && (
          <Pressable style={s.primaryBtn} onPress={() => onInterested(row)}>
            <Ionicons name="heart-outline" size={18} color="#fff" />
            <Text style={{ marginLeft: 6, color: "#fff", fontWeight: "800" }}>I’m Interested</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/* ------------------------------- styles ------------------------------- */

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },

  headerRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  createBtn: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#0EA5E9",
    paddingHorizontal: 12, paddingVertical: Platform.OS === "ios" ? 10 : 8,
    borderRadius: 10, marginRight: 4,
  },
  createText: { color: "#fff", fontWeight: "800", marginLeft: 6 },

  chip: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: "#D1D5DB",
    paddingHorizontal: 10, paddingVertical: Platform.OS === "ios" ? 6 : 5,
    borderRadius: 14, marginRight: 8, backgroundColor: "#fff",
  },
  chipText: { fontSize: 12, fontWeight: "700", color: "#111827" },

  card: {
    borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff",
    borderRadius: 12, padding: 12, marginTop: 10,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  btnRow: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 12 },
  primaryBtn: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#16A34A", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
  },
  secondaryBtn: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#E5E7EB", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
  },

  modalSafe: { flex: 1, backgroundColor: "#F8FAFC" },
  modalHead: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 10 },

  input: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#D1D5DD",
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === "ios" ? 10 : 8,
  },
  catPill: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: "#D0D5DD",
    paddingHorizontal: 10, paddingVertical: Platform.OS === "ios" ? 6 : 5,
    borderRadius: 14, marginRight: 8, backgroundColor: "#FFF",
  },
  catPillText: { fontSize: 12, fontWeight: "700", color: "#111827" },

  suggestBox: {
    marginTop: 8, borderWidth: 1, borderColor: "#E5E7EB",
    borderRadius: 10, backgroundColor: "#fff",
  },
  suggestRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "#F3F4F6",
  },

  publishBtn: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#0EA5E9", paddingVertical: 14, borderRadius: 12, justifyContent: "center",
  },
  publishText: { color: "#fff", fontWeight: "900", marginLeft: 8, fontSize: 16 },
  cancelBtn: { alignSelf: "center", marginTop: 10, padding: 10 },
  cancelText: { color: "#6B7280", fontWeight: "800" },
});

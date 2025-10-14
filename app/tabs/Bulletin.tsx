import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
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
import TopBar, { type LangCode } from "../../src/components/TopBar";
import { supabase } from "../../src/lib/supabase";

import { useAuth } from "../../src/auth/AuthProvider";

import ActivityChat from "../tabs/ActivityChat";

const TABLE = "community_activities";
const VISIBLE_AFTER_START_HOURS = 3;

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
async function getDeviceId(): Promise<string> {
  const cur = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (cur) return cur;
  const id = `dev_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

const CATS: { key: string; label: string; icon: IconName }[] = [
  { key: "kopi", label: "Kopi", icon: "chatbubbles-outline" },
  { key: "mahjong", label: "Mahjong", icon: "grid-outline" },
  { key: "crafts", label: "Crafts", icon: "color-palette-outline" },
  { key: "stretch", label: "Stretch", icon: "body-outline" },
  { key: "walks", label: "Walks", icon: "walk-outline" },
  { key: "learning", label: "Learning", icon: "school-outline" },
  { key: "volunteer", label: "Volunteer", icon: "hand-left-outline" },
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

export default function Bulletin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { session } = useAuth();
  const currentUserId = session?.userId ?? null;
  const [myName, setMyName] = useState<string | null>(null);
  useEffect(() => {
    if (!currentUserId) { setMyName(null); return; }
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
          .sort(
            (a, b) => (a.distance_m ?? 1e15) - (b.distance_m ?? 1e15)
          );
      }

      setRows(out);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not load activities.");
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
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
        "Missing info",
        "Please fill in Title, Date/Time and Location."
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
      Alert.alert("Posted!", "Your neighbour activity is now visible.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not post activity.");
    }
  }

  async function submitEdit() {
    if (!editingRow) return;
    const placeName = (placeChosen?.name || placeQuery || "").trim();
    if (!title.trim() || !startDate || !placeName) {
      Alert.alert(
        "Missing info",
        "Please fill in Title, Date/Time and Location."
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

      setCreating(false);
      setEditingRow(null);
      resetForm();
      loadActivities();
      Alert.alert("Saved", "Your activity has been updated.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not update activity.");
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
    } catch (e) {
      Alert.alert("Error", "Could not load interested people.");
      setInterestedList([]);
    } finally {
      setInterestedLoading(false);
    }
  }

  async function markInterested(row: ActivityRow) {
    try {
      const { error } = await supabase.from("activity_interests").insert([{
        activity_id: row.id,
        activity_title: row.title,         
        owner_user_id: row.user_id ?? null,
        interested_user_id: currentUserId, 
        interested_device_id: deviceId || null,
        interested_name: myName ?? "Neighbour", 
      }]);
      if (error) throw error;
      loadActivities(); 
      Alert.alert("Got it 👍", "Noted your interest.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not mark interest.");
    }
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

  const [lang, setLangState] = useState<LangCode>("en");
  const setLang = async (code: LangCode) => {
    setLangState(code);
    await AsyncStorage.setItem("lang", code);
  };

  return (
    <SafeAreaView style={s.safe} edges={["left", "right"]}>
      <TopBar
        leftMode="settings"
        language={lang}
        setLanguage={setLang}
        includeTopInset
        title="Bulletin Board"
      />

      <View style={s.headerRow}>
        <Pressable
          style={s.createBtn}
          onPress={() => {
            setCreating(true);
            setEditingRow(null);
            resetForm();
          }}
        >
          <Ionicons name="add-circle-outline" size={22} color="#fff" />
          <Text style={s.createText}>Create</Text>
        </Pressable>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingLeft: 6 }}
        >
          <Chip label="All" active={!filterCat} onPress={() => setFilterCat(null)} />
          {CATS.map((c) => (
            <Chip
              key={c.key}
              label={c.label}
              icon={c.icon}
              active={filterCat === c.key}
              onPress={() => setFilterCat(c.key)}
            />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
          <AppText style={{ marginTop: 8 }}>Loading…</AppText>
        </View>
      ) : (
        <FlatList
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
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
                  onChat={() => {
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
                />
              ))}
              <Section title="Nearby" />
            </>
          }
          renderItem={({ item }) => (
            <ActivityCard
              row={item}
              myLoc={myLoc}
              onChat={() => {
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
            />
          )}
          ListEmptyComponent={
            <View style={{ padding: 16 }}>
              <AppText>No activities yet. Be the first!</AppText>
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
        {chatFor ? (
          <ActivityChat
            onClose={() => setChatOpen(false)}
            activityId={chatFor.id}
            activityTitle={chatFor.title}
            currentUserId={currentUserId}
            currentUserName={myName ?? null}
          />
        ) : null}
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
              {editingRow ? "Edit Activity" : "New Activity"}
            </AppText>
            <AppText style={{ color: "#6B7280", marginTop: 4 }}>
              Keep it short & clear.
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
              <Labeled label="Name">
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g., Kopi @ Void Deck"
                  style={s.input}
                />
              </Labeled>

              <Labeled label="Category">
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {CATS.map((c) => (
                    <Pressable
                      key={c.key}
                      onPress={() => setCat(c.key)}
                      style={[
                        s.catPill,
                        cat === c.key && {
                          backgroundColor: "#0EA5E9",
                          borderColor: "#0EA5E9",
                        },
                      ]}
                    >
                      <Ionicons
                        name={c.icon}
                        size={16}
                        color={cat === c.key ? "#fff" : "#111"}
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        style={[
                          s.catPillText,
                          cat === c.key && { color: "#fff" },
                        ]}
                      >
                        {c.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </Labeled>

              <Labeled label="Start">
                <View style={s.pickerCard}>
                  {Platform.OS === "ios" ? (
                    <>
                      <DateTimePicker
                        value={startDate}
                        mode="date"
                        display="inline"
                        onChange={(_, d) =>
                          d &&
                          setStartDate((prev) =>
                            new Date(
                              d.getFullYear(),
                              d.getMonth(),
                              d.getDate(),
                              prev.getHours(),
                              prev.getMinutes()
                            )
                          )
                        }
                        themeVariant="light"
                        textColor="#111827"
                      />
                      <View style={{ height: 8 }} />
                      <DateTimePicker
                        value={startDate}
                        mode="time"
                        display="spinner"
                        onChange={(_, d) =>
                          d &&
                          setStartDate((prev) =>
                            new Date(
                              prev.getFullYear(),
                              prev.getMonth(),
                              prev.getDate(),
                              d.getHours(),
                              d.getMinutes()
                            )
                          )
                        }
                        themeVariant="light"
                        textColor="#111827"
                      />
                    </>
                  ) : (
                    <AndroidDateTime value={startDate} onChange={setStartDate} />
                  )}
                </View>
              </Labeled>

              <Labeled label="Location">
                <TextInput
                  value={placeQuery}
                  onChangeText={(v) => {
                    setPlaceQuery(v);
                    setPlaceChosen(null);
                  }}
                  placeholder="e.g., Tampines West CC"
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
                          <Text style={{ marginLeft: 8, flex: 1 }} numberOfLines={1}>
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
                    Picked: {placeChosen.name}
                  </AppText>
                )}
                {!GOOGLE_PLACES_KEY && (
                  <AppText style={{ marginTop: 6, color: "#B45309" }}>
                    Set GOOGLE_PLACES_KEY to enable suggestions (typing still
                    works).
                  </AppText>
                )}
              </Labeled>

              <Labeled label="Details (optional)">
                <TextInput
                  value={desc}
                  onChangeText={setDesc}
                  placeholder="What to bring / short note"
                  style={[s.input, { height: 90, textAlignVertical: "top" }]}
                  multiline
                />
              </Labeled>

              <View style={{ height: 12 }} />

              <Pressable
                onPress={editingRow ? submitEdit : submitCreate}
                style={s.publishBtn}
              >
                <Ionicons
                  name={editingRow ? "save-outline" : "megaphone-outline"}
                  size={20}
                  color="#fff"
                />
                <Text style={s.publishText}>
                  {editingRow ? "Save" : "Post"}
                </Text>
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

function AndroidDateTime({
  value,
  onChange,
}: {
  value: Date;
  onChange: (d: Date) => void;
}) {
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  return (
    <>
      <Pressable style={s.input} onPress={() => setShowDate(true)}>
        <Text>{value.toLocaleDateString()}</Text>
      </Pressable>
      <View style={{ height: 8 }} />
      <Pressable style={s.input} onPress={() => setShowTime(true)}>
        <Text>{value.toLocaleTimeString("en-SG", { hour12: false })}</Text>
      </Pressable>

      {showDate && (
        <DateTimePicker
          value={value}
          mode="date"
          display="default"
          onChange={(_, d) => {
            setShowDate(false);
            if (d)
              onChange(
                new Date(
                  d.getFullYear(),
                  d.getMonth(),
                  d.getDate(),
                  value.getHours(),
                  value.getMinutes()
                )
              );
          }}
        />
      )}
      {showTime && (
        <DateTimePicker
          value={value}
          mode="time"
          display="default"
          onChange={(_, d) => {
            setShowTime(false);
            if (d)
              onChange(
                new Date(
                  value.getFullYear(),
                  value.getMonth(),
                  value.getDate(),
                  d.getHours(),
                  d.getMinutes()
                )
              );
          }}
        />
      )}
    </>
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
        active && { backgroundColor: "#111827", borderColor: "#111827" },
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={14}
          color={active ? "#fff" : "#111"}
          style={{ marginRight: 6 }}
        />
      )}
      <Text style={[s.chipText, active && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
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
}: {
  row: ActivityRow;
  myLoc: LatLng | null;
  onDirections: () => void;
  onChat: () => void;
  isMine?: boolean;
  onInterested?: () => void;
  onViewInterested?: () => void;
  onEdit?: () => void;
}) {
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
          <AppText variant="title" weight="900" numberOfLines={1} style={{ flex: 1 }}>
            {row.title}
          </AppText>
        </View>

        {isMine && !!onEdit && (
          <Pressable
            onPress={onEdit}
            hitSlop={8}
            style={stylesCard.iconBtnGhost}
            accessibilityLabel="Edit"
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
          accessibilityLabel="Interested"
        >
          <Ionicons name="people-outline" size={14} color="#0F172A" />
          <Text style={stylesCard.metaText}>{count}</Text>
        </Pressable>
      </View>

      <View style={stylesCard.actionsRow}>
        <IconCircle onPress={onChat} icon="chatbubble-ellipses-outline" label="Chat" />
        <IconCircle onPress={onDirections} icon="navigate-outline" label="Go" />
        {!isMine && !!onInterested && (
          <IconCircle onPress={onInterested} icon="heart-outline" label="Interested" filled />
        )}
        {isMine && (
          <View style={stylesCard.minePill}>
            <Text style={stylesCard.mineText}>Mine</Text>
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
}: {
  onPress: () => void;
  icon: IconName;
  label: string;
  filled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[stylesCard.circleBtn, filled && { backgroundColor: "#16A34A" }]}
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={18} color={filled ? "#fff" : "#0F172A"} />
    </Pressable>
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
          <Text style={{ fontWeight: "800", fontSize: 16, flex: 1, textAlign: "center" }}>
            {title ? `Interested · ${title}` : "Interested"}
          </Text>
          <View style={{ width: 30 }} />
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator />
          </View>
        ) : rows.length === 0 ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: "#6B7280" }}>No one yet.</Text>
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
                  {item.interested_name || "Neighbour"}
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
  safe: { flex: 1, backgroundColor: "#F8FAFC" },

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
    backgroundColor: "#0EA5E9",
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    borderRadius: 10,
    marginRight: 4,
  },
  createText: { color: "#fff", fontWeight: "800", marginLeft: 6 },

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

  modalSafe: { flex: 1, backgroundColor: "#F8FAFC" },
  modalHead: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 10 },

  pickerCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 10,
  },

  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D1D5DD",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    color: "#111827",
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
    backgroundColor: "#0EA5E9",
    paddingVertical: 14,
    borderRadius: 12,
    justifyContent: "center",
  },
  publishText: { color: "#fff", fontWeight: "900", marginLeft: 8, fontSize: 16 },
  cancelBtn: { alignSelf: "center", marginTop: 10, padding: 10 },
  cancelText: { color: "#6B7280", fontWeight: "800" },
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
  metaText: { fontSize: 12, fontWeight: "800", color: "#0F172A", maxWidth: 180 },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
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
});

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AppText from "../../src/components/AppText";
import { supabase } from "../../src/lib/supabase";

const DEVICE_ID_KEY = "bulletin:device_id_v1";

async function fetchTokensForUsers(supabaseClient: any, userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  const { data } = await supabaseClient.from("push_tokens").select("expo_push_token").in("user_id", userIds);
  return (data || []).map((r: any) => r.expo_push_token).filter(Boolean);
}

async function fetchTokensForDevices(supabaseClient: any, deviceIds: string[]): Promise<string[]> {
  if (!deviceIds.length) return [];
  const { data } = await supabaseClient.from("push_tokens").select("expo_push_token").in("device_id", deviceIds);
  return (data || []).map((r: any) => r.expo_push_token).filter(Boolean);
}

function chunk<T>(arr: T[], size = 90): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function sendExpoPush(toTokens: string[], title: string, body: string, data?: Record<string, any>) {
  if (!toTokens.length) return;
  const payload = toTokens.map((to) => ({
    to,
    sound: "default",
    title,
    body,
    data,
    channelId: "chat-messages",
    collapseId: data?.activityId ? `chat-${data.activityId}` : undefined,
    threadId: data?.activityId ? `chat-${data.activityId}` : undefined,
    priority: "high",
  }));
  for (const group of chunk(payload, 90)) {
    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(group),
      });
    } catch {}
  }
}

async function notifyChatMessageClientSide({
  supabaseClient,
  activityId,
  activityTitle,
  senderUserId,
  senderDeviceId,
  senderName,
  body,
}: {
  supabaseClient: any;
  activityId: string;
  activityTitle: string;
  senderUserId: string | null | undefined;
  senderDeviceId: string | null | undefined;
  senderName: string | null | undefined;
  body: string;
}) {
  const { data: act } = await supabaseClient
    .from("community_activities")
    .select("user_id, owner_device_id, title")
    .eq("id", activityId)
    .maybeSingle();

  const title = act?.title ?? activityTitle ?? "Activity chat";
  const { data: interests } = await supabaseClient
    .from("activity_interests")
    .select("interested_user_id, interested_device_id")
    .eq("activity_id", activityId);

  const userSet = new Set<string>();
  const devSet = new Set<string>();
  if (act?.user_id) userSet.add(act.user_id);
  if (act?.owner_device_id) devSet.add(act.owner_device_id);
  (interests || []).forEach((r: any) => {
    if (r.interested_user_id) userSet.add(r.interested_user_id);
    if (r.interested_device_id) devSet.add(r.interested_device_id);
  });

  if (senderUserId) userSet.delete(senderUserId);
  if (senderDeviceId) devSet.delete(senderDeviceId);

  const users = Array.from(userSet);
  const devices = Array.from(devSet);

  const userTokens = await fetchTokensForUsers(supabaseClient, users);
  const devTokens = await fetchTokensForDevices(supabaseClient, devices);
  const tokens = Array.from(new Set([...userTokens, ...devTokens]));
  if (!tokens.length) return;

  const preview = body.startsWith("[img]") ? "📷 Photo" : (body.length > 120 ? body.slice(0, 120) + "…" : body);
  const sender = senderName || "Neighbour";

  await sendExpoPush(tokens, title, `${sender}: ${preview}`, {
    kind: "chat",
    activityId,
    activityTitle: title,
  });
}

async function getDeviceId(): Promise<string> {
  const cur = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (cur) return cur;
  const id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

type Msg = {
  id: string;
  activity_id: string;
  sender_user_id: string | null;
  sender_device_id: string | null;
  body: string;
  created_at: string;
  sender_name?: string | null;
  image_url?: string | null;
};

type ListItem = { type: "msg"; key: string; msg: Msg } | { type: "sep"; key: "unread-sep" };

function normalizeImageUrl(u: string | null | undefined) {
  if (!u) return null;
  try {
    const url = new URL(u);
    if (url.hostname.includes(".supabase.co")) {
      if (!url.searchParams.has("v")) url.searchParams.set("v", String(Date.now() % 1e9));
      return url.toString();
    }
  } catch {}
  return u;
}
function imageUrlOf(m: Msg): string | null {
  const explicit = (m as any).image_url as string | undefined;
  const body = (m.body || "").trim();
  const inline = body.startsWith("[img]") ? body.slice(5).trim() : null;
  return normalizeImageUrl(explicit || inline);
}
function isNearDuplicate(a: Msg, b: Msg) {
  if (a.sender_device_id !== b.sender_device_id) return false;
  if ((a.body || "").trim() !== (b.body || "").trim()) return false;
  const ta = new Date(a.created_at).getTime();
  const tb = new Date(b.created_at).getTime();
  return Math.abs(tb - ta) <= 8000;
}
function dedupeMessages(list: Msg[]) {
  const server = list.filter((m) => !m.id.startsWith("local_"));
  const locals = list.filter((m) => m.id.startsWith("local_"));
  const drop = new Set<string>();
  for (const l of locals) {
    const match = server.find((s) => isNearDuplicate(l, s));
    if (match) drop.add(l.id);
  }
  return drop.size ? list.filter((m) => !drop.has(m.id)) : list;
}

const USER_COLORS = ["#FDE68A", "#BFDBFE", "#FBCFE8", "#C7D2FE", "#BBF7D0", "#FECACA", "#F5D0FE", "#A7F3D0"];
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function colorFor(id: string | null | undefined, mine: boolean) {
  if (mine) return "#0EA5E9";
  const base = id || "anon";
  const idx = hash(base) % USER_COLORS.length;
  return USER_COLORS[idx];
}
function textColorFor(bg: string) {
  return "#111827";
}

export default function ActivityChat({
  onClose,
  activityId,
  activityTitle,
  currentUserId,
  currentUserName,
}: {
  onClose: () => void;
  activityId: string;
  activityTitle?: string | null;
  currentUserId?: string | null;
  currentUserName?: string | null;
}) {
  const { t } = useTranslation();
  const [deviceId, setDeviceId] = useState<string>("");
  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  useEffect(() => {
    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("chat-messages", {
        name: "Chat messages",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
      }).catch(() => {});
    }
  }, []);

  const identityKey = useMemo(() => `${currentUserId || "dev:" + deviceId}`, [currentUserId, deviceId]);
  const lastReadKey = useMemo(() => `activity:lastread:${activityId}:${identityKey}`, [activityId, identityKey]);

  const [headerTitle, setHeaderTitle] = useState<string>(activityTitle ?? t("chat.headerDefault"));
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState<string | null>(null);

  useEffect(() => {
    if (!activityId) return;
    (async () => {
      const { data: act } = await supabase
        .from("community_activities")
        .select("user_id, title")
        .eq("id", activityId)
        .maybeSingle();
      setOwnerId(act?.user_id ?? null);
      setHeaderTitle(act?.title ?? activityTitle ?? t("chat.headerDefault"));
      if (act?.user_id) {
        const { data: prof } = await supabase.from("elderly_profiles").select("name").eq("user_id", act.user_id).maybeSingle();
        setOwnerName(prof?.name ?? null);
      }
    })();
  }, [activityId]);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const listRef = useRef<FlatList<ListItem>>(null);

  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  useEffect(() => {
    atBottomRef.current = atBottom;
  }, [atBottom]);
  const [newSinceScroll, setNewSinceScroll] = useState(false);

  useEffect(() => {
    if (!activityId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("activity_messages")
        .select("*")
        .eq("activity_id", activityId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (!mounted) return;
      if (error) setMessages([]);
      else setMessages(data as Msg[]);
      setLoading(false);
    })();
    const channel = supabase
      .channel(`activity_messages:${activityId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_messages", filter: `activity_id=eq.${activityId}` },
        (payload) => {
          const msg = payload.new as Msg;
          setMessages((prev) => dedupeMessages([...prev, msg]));
          const mine =
            (currentUserId && msg.sender_user_id === currentUserId) ||
            (!currentUserId && msg.sender_device_id === deviceId);
          if (!mine && !atBottomRef.current) setNewSinceScroll(true);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      mounted = false;
    };
  }, [activityId, currentUserId, deviceId]);

  const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});
  useEffect(() => {
    const ids = Array.from(new Set(messages.map((m) => m.sender_user_id).filter(Boolean))) as string[];
    const unknown = ids.filter((id) => !(id in nameByUserId));
    if (!unknown.length) return;
    (async () => {
      const { data } = await supabase.from("elderly_profiles").select("user_id,name").in("user_id", unknown);
      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => {
        if (r.user_id) map[r.user_id] = r.name ?? t("chat.neighbour");
      });
      setNameByUserId((prev) => ({ ...prev, ...map }));
    })();
  }, [messages]);

  const [typingPeers, setTypingPeers] = useState<Record<string, { name?: string | null; at: number }>>({});
  const typingChanRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  function broadcastTyping() {
    const ch = typingChanRef.current;
    if (!ch) return;
    ch.send({ type: "broadcast", event: "typing", payload: { device_id: deviceId, name: currentUserName ?? t("chat.neighbour") } });
  }
  useEffect(() => {
    if (!activityId) return;
    const ch = supabase
      .channel(`activity_typing:${activityId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, (payload) => {
        const { device_id, name } = (payload as any).payload || {};
        if (!device_id || device_id === deviceId) return;
        setTypingPeers((prev) => ({ ...prev, [device_id]: { name, at: Date.now() } }));
      })
      .subscribe();
    typingChanRef.current = ch;
    const interval = setInterval(() => {
      setTypingPeers((prev) => {
        const now = Date.now();
        const next: typeof prev = {};
        Object.entries(prev).forEach(([k, v]) => {
          if (now - v.at < 2200) next[k] = v;
        });
        return next;
      });
    }, 1000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(interval);
      typingChanRef.current = null;
      setTypingPeers({});
    };
  }, [activityId, deviceId, currentUserName]);

  useEffect(() => {
    setMessages((prev) => dedupeMessages(prev));
  }, [messages.length]);

  const [lastReadAt, setLastReadAt] = useState<number | null>(null);
  const [didAutoJump, setDidAutoJump] = useState(false);
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(lastReadKey);
      if (raw) {
        const n = Number(raw);
        if (!Number.isNaN(n)) setLastReadAt(n);
      }
    })();
  }, [lastReadKey]);

  const isMine = (m: Msg) =>
    (currentUserId && m.sender_user_id === currentUserId) || (!currentUserId && m.sender_device_id === deviceId);

  const myLatestTs = useMemo(() => {
    let ts = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (isMine(messages[i])) {
        ts = new Date(messages[i].created_at).getTime();
        break;
      }
    }
    return ts || null;
  }, [messages, currentUserId, deviceId]);

  const effectiveLastRead = useMemo(() => Math.max(lastReadAt ?? 0, myLatestTs ?? 0), [lastReadAt, myLatestTs]);

  const unreadFirstIndex = useMemo(() => {
    if (!messages.length) return -1;
    for (let i = 0; i < messages.length; i++) {
      const ts = new Date(messages[i].created_at).getTime();
      if (ts > effectiveLastRead && !isMine(messages[i])) return i;
    }
    return -1;
  }, [messages, effectiveLastRead]);

  const listData: ListItem[] = useMemo(() => {
    if (!messages.length) return [];
    if (unreadFirstIndex === -1) {
      return messages.map((m) => ({ type: "msg", key: m.id, msg: m }));
    }
    const out: ListItem[] = [];
    messages.forEach((m, idx) => {
      if (idx === unreadFirstIndex) out.push({ type: "sep", key: "unread-sep" });
      out.push({ type: "msg", key: m.id, msg: m });
    });
    return out;
  }, [messages, unreadFirstIndex]);

  useEffect(() => {
    if (loading || didAutoJump || !listData.length) return;
    const sepIndex = listData.findIndex((it) => it.type === "sep");
    requestAnimationFrame(() => {
      if (sepIndex >= 0) {
        listRef.current?.scrollToIndex({ index: sepIndex, animated: false, viewPosition: 0 });
      } else {
        listRef.current?.scrollToEnd({ animated: false });
      }
      setDidAutoJump(true);
    });
  }, [loading, listData, didAutoJump]);

  async function markReadNow(ts?: number) {
    const when = ts ?? Date.now();
    setLastReadAt(when);
    await AsyncStorage.setItem(lastReadKey, String(when));
  }

  useEffect(() => {
    return () => {
      markReadNow().catch(() => {});
    };
  }, []);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const bottomGap = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    const nowAtBottom = bottomGap < 20;
    setAtBottom(nowAtBottom);
    if (nowAtBottom) {
      setNewSinceScroll(false);
      markReadNow().catch(() => {});
    }
  }

  function onScrollToIndexFailed(info: { index: number; averageItemLength: number }) {
    const offset = Math.max(0, info.averageItemLength * info.index);
    listRef.current?.scrollToOffset({ offset, animated: false });
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0 });
    }, 80);
  }

  function scrollToBottom() {
    listRef.current?.scrollToEnd({ animated: true });
    setNewSinceScroll(false);
    markReadNow().catch(() => {});
  }

  async function send() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setText("");
    const optimistic: Msg = {
      id: `local_${Math.random().toString(36).slice(2)}`,
      activity_id: activityId,
      sender_user_id: currentUserId ?? null,
      sender_device_id: deviceId,
      body,
      created_at: new Date().toISOString(),
      sender_name: currentUserName ?? null,
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 40);
    await markReadNow(new Date(optimistic.created_at).getTime());

    const { error } = await supabase
      .from("activity_messages")
      .insert([
        {
          activity_id: activityId,
          body,
          sender_user_id: currentUserId ?? null,
          sender_device_id: deviceId,
          sender_name: currentUserName ?? null,
        },
      ])
      .select("id")
      .single();

    if (error) {
      Alert.alert(t("errors.sendTitle"), error.message || t("errors.sendBody"));
    } else {
      notifyChatMessageClientSide({
        supabaseClient: supabase,
        activityId,
        activityTitle: headerTitle,
        senderUserId: currentUserId ?? null,
        senderDeviceId: deviceId,
        senderName: currentUserName ?? null,
        body,
      }).catch(() => {});
    }
    setSending(false);
  }

  async function pickAndSendImage() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t("errors.permissionTitle"), t("errors.permissionBody"));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsMultipleSelection: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: Math.min(asset.width ?? 1600, 1600) } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      const res = await fetch(manipulated.uri);
      if (!res.ok) {
        Alert.alert(t("errors.uploadTitle"), t("errors.uploadReadBody"));
        return;
      }
      const ab = await res.arrayBuffer();
      const path = `${activityId}/${deviceId}/${Date.now()}.jpg`;
      const up = await supabase.storage.from("activity_uploads").upload(path, ab, { contentType: "image/jpeg", upsert: true });
      if (up.error) {
        Alert.alert(t("errors.uploadTitle"), up.error.message || t("errors.uploadGenericBody"));
        return;
      }
      const signed = await supabase.storage.from("activity_uploads").createSignedUrl(path, 60 * 5);
      const pub = supabase.storage.from("activity_uploads").getPublicUrl(path).data.publicUrl;
      const displayUrl = signed.data?.signedUrl ?? `${pub}?v=${Date.now()}`;

      const optimistic: Msg = {
        id: `local_${Math.random().toString(36).slice(2)}`,
        activity_id: activityId,
        sender_user_id: currentUserId ?? null,
        sender_device_id: deviceId,
        body: "[img]" + displayUrl,
        created_at: new Date().toISOString(),
        sender_name: currentUserName ?? null,
        image_url: displayUrl,
      };
      setMessages((prev) => [...prev, optimistic]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 40);
      await markReadNow(new Date(optimistic.created_at).getTime());

      const { error: insertErr } = await supabase
        .from("activity_messages")
        .insert([
          {
            activity_id: activityId,
            body: "[img]" + displayUrl,
            sender_user_id: currentUserId ?? null,
            sender_device_id: deviceId,
            sender_name: currentUserName ?? null,
          },
        ])
        .select("id")
        .single();

      if (insertErr) {
        Alert.alert(t("errors.sendTitle"), insertErr.message || t("errors.sendBody"));
      } else {
        notifyChatMessageClientSide({
          supabaseClient: supabase,
          activityId,
          activityTitle: headerTitle,
          senderUserId: currentUserId ?? null,
          senderDeviceId: deviceId,
          senderName: currentUserName ?? null,
          body: "[img]" + displayUrl,
        }).catch(() => {});
      }
    } catch (e: any) {
      Alert.alert(t("errors.unexpected"), e?.message ?? String(e));
    }
  }

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === "sep") {
      return (
        <View style={styles.sepWrap}>
          <View style={styles.unreadPill}>
            <AppText variant="caption" weight="900" color="#6B7280">Unread</AppText>
          </View>
        </View>
      );
    }
    const m = item.msg;
    const mine = isMine(m);
    const derivedName =
      m.sender_name ?? (m.sender_user_id ? nameByUserId[m.sender_user_id] : undefined) ?? t("chat.neighbour");
    const isHost = !!ownerId && m.sender_user_id === ownerId;
    const img = imageUrlOf(m);
    const bg = colorFor(m.sender_user_id || m.sender_device_id || "", mine);
    const fg = mine ? "#fff" : textColorFor(bg);
    return (
      <View style={[styles.bubbleRow, mine ? styles.rowEnd : styles.rowStart]}>
        <View style={[styles.bubble, { backgroundColor: bg }, mine ? { borderTopRightRadius: 4 } : { borderTopLeftRadius: 4 }]}>
          {!mine && (
            <AppText variant="caption" weight="800" color={isHost ? "#166534" : "#0F172A"} style={{ marginBottom: 2 }}>
              {derivedName}
              {isHost ? ` ${t("chat.hostBadge")}` : ""}
            </AppText>
          )}
          {img ? (
            <Pressable onPress={() => Linking.openURL(img)} hitSlop={6}>
              <Image
                source={{ uri: img }}
                style={{ width: 220, height: 220, borderRadius: 8, marginBottom: 6, backgroundColor: "#EEE" }}
                resizeMode="cover"
              />
            </Pressable>
          ) : (
            <AppText variant="body" weight="600" color={fg}>{m.body}</AppText>
          )}
          <AppText variant="caption" weight="700" color={mine ? "#E5E7EB" : "#6B7280"} style={{ marginTop: 4 }}>
            {new Date(m.created_at).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false })}
          </AppText>
        </View>
      </View>
    );
  };

  const showJump = listData.length > 0 && !atBottom;

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.select({ ios: 0, android: 0 })}
    >
      <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <Pressable onPress={() => { markReadNow().finally(onClose); }} hitSlop={8} style={{ padding: 6 }}>
              <Ionicons name="chevron-back" size={24} color="#111827" />
            </Pressable>
            <AppText variant="label" weight="800" color="#111827" style={styles.title}>
              {headerTitle}{ownerName ? ` ${t("chat.hostColon")} ${ownerName}` : ""}
            </AppText>
            <View style={{ width: 30 }} />
          </View>

          {loading ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator />
            </View>
          ) : (
            <>
              <FlatList
                ref={listRef}
                data={listData}
                keyExtractor={(it) => it.key}
                renderItem={renderItem}
                contentContainerStyle={{ padding: 12, paddingBottom: 10 }}
                onScroll={handleScroll}
                scrollEventThrottle={80}
                onScrollToIndexFailed={onScrollToIndexFailed}
                getItemLayout={(_, index) => {
                  const SEP_H = 36;
                  const AVG_MSG_H = 84;
                  const item = listData[index];
                  const length = item?.type === "sep" ? SEP_H : AVG_MSG_H;
                  return { length, offset: length * index, index };
                }}
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="handled"
              />

              {showJump && (
                <View pointerEvents="box-none" style={styles.fabContainer}>
                  <Pressable
                    onPress={scrollToBottom}
                    style={[styles.fab, newSinceScroll && styles.fabNew]}
                    accessibilityLabel="Jump to latest messages"
                  >
                    <Ionicons name="arrow-down" size={20} color="#fff" />
                  </Pressable>
                  {newSinceScroll && <View style={styles.fabBadge} />}
                </View>
              )}
            </>
          )}

          {Object.keys(typingPeers).length > 0 && (
            <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
              <View style={{ alignSelf: "flex-start", backgroundColor: "#E5E7EB", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 }}>
                <AppText variant="body" weight="600" color="#111827">
                  {Object.values(typingPeers).map((ti) => ti.name || t("chat.neighbour")).slice(0, 2).join(", ")}
                  {Object.keys(typingPeers).length > 2 ? " +…" : ""} {t("chat.typing")}
                </AppText>
              </View>
            </View>
          )}

          <View style={styles.composerRow}>
            <Pressable onPress={pickAndSendImage} style={styles.addBtn} hitSlop={8}>
              <Ionicons name="add" size={22} color="#111827" />
            </Pressable>
            <TextInput
              value={text}
              onChangeText={(v) => { setText(v); broadcastTyping(); }}
              onFocus={() => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 0)}
              placeholder={t("chat.placeholder")}
              style={styles.input}
              multiline
            />
            <Pressable onPress={send} disabled={sending || !text.trim()} style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}>
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFAF0" },
  header: {
    height: 52,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
  },
  title: { flex: 1, textAlign: "center" },
  bubbleRow: { paddingVertical: 4, flexDirection: "row", paddingHorizontal: 8 },
  rowStart: { justifyContent: "flex-start" },
  rowEnd: { justifyContent: "flex-end" },
  bubble: { maxWidth: "78%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  sepWrap: { alignItems: "center", paddingVertical: 8 },
  unreadPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    gap: 8,
    backgroundColor: "#FFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  addBtn: {
    backgroundColor: "#E5E7EB",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#111827",
  },
  sendBtn: { backgroundColor: "#000000", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },

  fabContainer: {
    position: "absolute",
    right: 16,
    bottom: 86,
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827CC",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabNew: {
    backgroundColor: "#0EA5E9",
  },
  fabBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#EF4444",
    borderWidth: 2,
    borderColor: "#FFF",
  },
});
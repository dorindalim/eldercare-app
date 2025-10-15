import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../src/lib/supabase";

const DEVICE_ID_KEY = "bulletin:device_id_v1";
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
  useEffect(() => { getDeviceId().then(setDeviceId); }, []);

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
        const { data: prof } = await supabase
          .from("elderly_profiles")
          .select("name")
          .eq("user_id", act.user_id)
          .maybeSingle();
        setOwnerName(prof?.name ?? null);
      }
    })();
  }, [activityId]);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const listRef = useRef<FlatList<Msg>>(null);

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
    const server = list.filter(m => !m.id.startsWith("local_"));
    const locals = list.filter(m => m.id.startsWith("local_"));
    const drop = new Set<string>();
    for (const l of locals) {
      const match = server.find(s => isNearDuplicate(l, s));
      if (match) drop.add(l.id);
    }
    return drop.size ? list.filter(m => !drop.has(m.id)) : list;
  }

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
      if (error) {
        setMessages([]);
      } else {
        setMessages(data as Msg[]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 0);
      }
      setLoading(false);
    })();

    const channel = supabase
      .channel(`activity_messages:${activityId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_messages", filter: `activity_id=eq.${activityId}` },
        (payload) => {
          const msg = payload.new as Msg;
          setMessages(prev => {
            const next = [...prev, msg];
            return dedupeMessages(next);
          });
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); mounted = false; };
  }, [activityId]);

  const [typingPeers, setTypingPeers] = useState<Record<string, { name?: string | null; at: number }>>({});
  const typingChanRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  function broadcastTyping() {
    const ch = typingChanRef.current;
    if (!ch) return;
    ch.send({
      type: "broadcast",
      event: "typing",
      payload: { device_id: deviceId, name: currentUserName ?? t("chat.neighbour") },
    });
  }

  useEffect(() => {
    if (!activityId) return;
    const ch = supabase
      .channel(`activity_typing:${activityId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, (payload) => {
        const { device_id, name } = (payload as any).payload || {};
        if (!device_id || device_id === deviceId) return;
        setTypingPeers(prev => ({ ...prev, [device_id]: { name, at: Date.now() } }));
      })
      .subscribe();
    typingChanRef.current = ch;

    const interval = setInterval(() => {
      setTypingPeers(prev => {
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
    setMessages(prev => dedupeMessages(prev));
  }, [messages.length]);

  const [nameByUserId, setNameByUserId] = useState<Record<string,string>>({});
  useEffect(() => {
    const ids = Array.from(new Set(messages.map(m => m.sender_user_id).filter(Boolean))) as string[];
    const unknown = ids.filter(id => !(id in nameByUserId));
    if (!unknown.length) return;
    (async () => {
      const { data } = await supabase
        .from("elderly_profiles")
        .select("user_id,name")
        .in("user_id", unknown);
      const map: Record<string,string> = {};
      (data || []).forEach((r: any) => { if (r.user_id) map[r.user_id] = r.name ?? t("chat.neighbour"); });
      setNameByUserId(prev => ({ ...prev, ...map }));
    })();
  }, [messages]);

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
    setMessages(prev => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 40);

    const { error } = await supabase.from("activity_messages").insert([{
      activity_id: activityId,
      body,
      sender_user_id: currentUserId ?? null,
      sender_device_id: deviceId,
      sender_name: currentUserName ?? null,
    }]);
    if (error) {
      Alert.alert(t("errors.sendTitle"), error.message || t("errors.sendBody"));
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
      const up = await supabase.storage
        .from("activity_uploads")
        .upload(path, ab, { contentType: "image/jpeg", upsert: true });

      if (up.error) {
        Alert.alert(t("errors.uploadTitle"), up.error.message || t("errors.uploadGenericBody"));
        return;
      }

      const signed = await supabase
        .storage
        .from("activity_uploads")
        .createSignedUrl(path, 60 * 5);

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
      setMessages(prev => [...prev, optimistic]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 40);

      const { error: insertErr } = await supabase.from("activity_messages").insert([{
        activity_id: activityId,
        body: "[img]" + displayUrl,
        sender_user_id: currentUserId ?? null,
        sender_device_id: deviceId,
        sender_name: currentUserName ?? null,
      }]);
      if (insertErr) {
        Alert.alert(t("errors.sendTitle"), insertErr.message || t("errors.sendBody"));
      }
    } catch (e: any) {
      Alert.alert(t("errors.unexpected"), e?.message ?? String(e));
    }
  }

  const renderItem = ({ item }: { item: Msg }) => {
    const mine = (currentUserId && item.sender_user_id === currentUserId) ||
                 (!currentUserId && item.sender_device_id === deviceId);

    const derivedName =
      item.sender_name ??
      (item.sender_user_id ? nameByUserId[item.sender_user_id] : undefined) ??
      t("chat.neighbour");

    const isHost = !!ownerId && item.sender_user_id === ownerId;

    const img = imageUrlOf(item);

    return (
      <View style={[styles.bubbleRow, mine ? styles.rowEnd : styles.rowStart]}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
          {!mine && (
            <Text style={[styles.name, isHost ? { color: "#166534" } : null]}>
              {derivedName}{isHost ? ` ${t("chat.hostBadge")}` : ""}
            </Text>
          )}

          {img && (
            <Pressable onPress={() => Linking.openURL(img)} hitSlop={6}>
              <Image
                source={{ uri: img }}
                style={{ width: 220, height: 220, borderRadius: 8, marginBottom: 6, backgroundColor: "#EEE" }}
                resizeMode="cover"
              />
            </Pressable>
          )}

          {!img && (
            <Text style={[styles.body, mine ? { color: "#fff" } : { color: "#111827" }]}>{item.body}</Text>
          )}

          <Text style={[styles.ts, mine ? { color: "#E5E7EB" } : { color: "#6B7280" }]}>
            {new Date(item.created_at).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {headerTitle}{ownerName ? ` ${t("chat.hostColon")} ${ownerName}` : ""}
        </Text>
        <View style={{ width: 30 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 10 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {Object.keys(typingPeers).length > 0 && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
          <View style={{ alignSelf: "flex-start", backgroundColor: "#E5E7EB", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ color: "#111827", fontWeight: "600" }}>
              {Object.values(typingPeers).map(ti => ti.name || t("chat.neighbour")).slice(0, 2).join(", ")}
              {Object.keys(typingPeers).length > 2 ? " +…" : ""} {t("chat.typing")}
            </Text>
          </View>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={52}
      >
        <View style={styles.composerRow}>
          <Pressable onPress={pickAndSendImage} style={styles.addBtn} hitSlop={8}>
            <Ionicons name="add" size={22} color="#111827" />
          </Pressable>

          <TextInput
            value={text}
            onChangeText={(tval) => { setText(tval); broadcastTyping(); }}
            onFocus={() => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 0)}
            placeholder={t("chat.placeholder")}
            style={styles.input}
            multiline
          />
          <Pressable
            onPress={send}
            disabled={sending || !text.trim()}
            style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    height: 52, paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E5E7EB",
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#FFF",
  },
  title: { fontSize: 16, fontWeight: "800", color: "#111827", flex: 1, textAlign: "center" },

  bubbleRow: { paddingVertical: 4, flexDirection: "row", paddingHorizontal: 8 },
  rowStart: { justifyContent: "flex-start" },
  rowEnd: { justifyContent: "flex-end" },
  bubble: { maxWidth: "78%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  bubbleMine: { backgroundColor: "#0EA5E9", borderTopRightRadius: 4 },
  bubbleOther: { backgroundColor: "#E5E7EB", borderTopLeftRadius: 4 },

  name: { fontSize: 12, fontWeight: "800", marginBottom: 2, color: "#0F172A" },
  body: { fontSize: 15, fontWeight: "600" },
  ts: { fontSize: 11, marginTop: 4 },

  composerRow: {
    flexDirection: "row", alignItems: "center",
    padding: 10, gap: 8, backgroundColor: "#FFF",
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E5E7EB",
  },
  addBtn: {
    backgroundColor: "#E5E7EB",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  input: {
    flex: 1, minHeight: 42, maxHeight: 120,
    backgroundColor: "#F3F4F6", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
    color: "#111827",
  },
  sendBtn: { backgroundColor: "#000000", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
});

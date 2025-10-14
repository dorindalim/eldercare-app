import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
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
  const [deviceId, setDeviceId] = useState<string>("");
  useEffect(() => { getDeviceId().then(setDeviceId); }, []);

  const [headerTitle, setHeaderTitle] = useState<string>(activityTitle ?? "Activity Chat");
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
      setHeaderTitle(act?.title ?? activityTitle ?? "Activity Chat");

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
      if (error) { console.warn("load messages error", error); setMessages([]); }
      else { setMessages(data as Msg[]); setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 0); }
      setLoading(false);
    })();

    const channel = supabase
      .channel(`activity_messages:${activityId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_messages", filter: `activity_id=eq.${activityId}` },
        (payload) => {
          const msg = payload.new as Msg;
          setMessages(prev => [...prev, msg]);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); mounted = false; };
  }, [activityId]);

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
      (data || []).forEach((r: any) => { if (r.user_id) map[r.user_id] = r.name ?? "Neighbour"; });
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
    if (error) console.warn("send error", error);
    setSending(false);
  }

  const renderItem = ({ item }: { item: Msg }) => {
    const mine = (currentUserId && item.sender_user_id === currentUserId) ||
                 (!currentUserId && item.sender_device_id === deviceId);

    const derivedName =
      item.sender_name ??
      (item.sender_user_id ? nameByUserId[item.sender_user_id] : undefined) ??
      "Neighbour";

    const isHost = !!ownerId && item.sender_user_id === ownerId;

    return (
      <View style={[styles.bubbleRow, mine ? styles.rowEnd : styles.rowStart]}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
          {!mine && (
            <Text style={[styles.name, isHost ? { color: "#166534" } : null]}>
              {derivedName}{isHost ? " · Host" : ""}
            </Text>
          )}
          <Text style={[styles.body, mine ? { color: "#fff" } : { color: "#111827" }]}>{item.body}</Text>
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
          {headerTitle}{ownerName ? ` · Host: ${ownerName}` : ""}
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

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.composerRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message…"
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
  input: {
    flex: 1, minHeight: 42, maxHeight: 120,
    backgroundColor: "#F3F4F6", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
    color: "#111827",
  },
  sendBtn: { backgroundColor: "#16A34A", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
});

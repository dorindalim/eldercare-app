import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () =>
    ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    } as Notifications.NotificationBehavior),
});

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;

  const current = await Notifications.getPermissionsAsync();
  let granted =
    current.granted ||
    current.ios?.status ===
      (Notifications.IosAuthorizationStatus as any)?.PROVISIONAL;

  if (!granted) {
    const req = await Notifications.requestPermissionsAsync();
    granted =
      req.granted ||
      req.ios?.status ===
        (Notifications.IosAuthorizationStatus as any)?.PROVISIONAL;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  return !!granted;
}

export async function scheduleLocalAt(params: {
  title: string;
  body: string;
  date: Date;
}): Promise<string> {
  const ok = await ensureNotificationPermission();
  if (!ok) throw new Error("Notification permission not granted.");

  return Notifications.scheduleNotificationAsync({
    content: { title: params.title, body: params.body },
    trigger: { date: params.date } as Notifications.DateTriggerInput,
  });
}

export async function scheduleLocalIn(params: {
  title: string;
  body: string;
  minutes: number;
}): Promise<string> {
  const ok = await ensureNotificationPermission();
  if (!ok) throw new Error("Notification permission not granted.");

  const seconds = Math.max(1, Math.round(params.minutes * 60));
  return Notifications.scheduleNotificationAsync({
    content: { title: params.title, body: params.body },
    trigger: { seconds, repeats: false } as Notifications.TimeIntervalTriggerInput,
  });
}

export async function cancelNotification(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export type ScheduledReminder = {
  id: string;
  title: string;
  body: string;
  date?: Date;
  seconds?: number;
};

export async function listScheduled(): Promise<ScheduledReminder[]> {
  const arr = await Notifications.getAllScheduledNotificationsAsync();
  return arr.map((n) => {
    const t = n.trigger as any;
    return {
      id: n.identifier,
      title: n.content.title ?? "",
      body: n.content.body ?? "",
      date: t?.date ? new Date(t.date) : undefined,
      seconds: typeof t?.seconds === "number" ? t.seconds : undefined,
    };
  });
}

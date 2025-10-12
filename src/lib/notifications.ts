import * as Device from "expo-device";
import type {
  NotificationBehavior,
  NotificationHandler
} from "expo-notifications";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export async function initNotifications(): Promise<void> {
  const handler: NotificationHandler = {
    handleNotification: async (): Promise<NotificationBehavior> => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  };
  Notifications.setNotificationHandler(handler);

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
      vibrationPattern: [250, 250],
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return !!req.granted;
}

export async function presentNow(params: {
  title: string;
  body: string;
}): Promise<void> {
  const ok = await ensureNotificationPermission();
  if (!ok) throw new Error("Notification permission not granted.");

  await Notifications.scheduleNotificationAsync({
    content: { title: params.title, body: params.body, sound: true },
    trigger: { seconds: 1, repeats: false } as any,
  });
}

export async function scheduleLocalAt(params: {
  title: string;
  body: string;
  date: Date;
}): Promise<string> {
  const ok = await ensureNotificationPermission();
  if (!ok) throw new Error("Notification permission not granted.");

  return Notifications.scheduleNotificationAsync({
    content: { title: params.title, body: params.body, sound: true },
    trigger: params.date as any,
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
    content: { title: params.title, body: params.body, sound: true },
    trigger: { seconds, repeats: false } as any,
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
    const t: any = n.trigger;
    return {
      id: n.identifier,
      title: n.content?.title ?? "",
      body: n.content?.body ?? "",
      date: t?.date ? new Date(t.date) : undefined,
      seconds: typeof t?.seconds === "number" ? t.seconds : undefined,
    };
  });
}

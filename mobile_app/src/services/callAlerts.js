import * as Notifications from "expo-notifications";

// Notifee is a native module: present in builds made after the call-style
// feature, absent in older binaries that may still pull OTA JS. A guarded
// require keeps the app safe either way (call-style ringing simply stays off
// on old binaries) and makes OTA publishing safe.
let notifee = null;
let AndroidImportance = null;
let AndroidCategory = null;
let EventType = null;
try {
  const mod = require("@notifee/react-native");
  notifee = mod.default;
  AndroidImportance = mod.AndroidImportance;
  AndroidCategory = mod.AndroidCategory;
  EventType = mod.EventType;
} catch (e) {
  notifee = null;
}

const CALL_CHANNEL_ID = "insight-emergency-call";
const CALL_SOUND = "emergency_ring"; // res/raw/emergency_ring.wav (expo-notifications plugin)
let currentNotificationId = null;

export function callAlertsSupported() {
  return Boolean(notifee);
}

function toFlatStrings(obj) {
  const out = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v === null || v === undefined) return;
    out[k] = typeof v === "string" ? v : String(v);
  });
  return out;
}

async function ensureChannel() {
  if (!notifee) return;
  try {
    await notifee.createChannel({
      id: CALL_CHANNEL_ID,
      name: "Emergency call alerts",
      importance: AndroidImportance.HIGH,
      sound: CALL_SOUND,
      vibration: true,
      bypassDnd: true,
      lights: true,
      lightColor: "#DC2626",
    });
  } catch (e) {}
}

/**
 * Display a phone-call-style notification: the ring tone loops continuously
 * (Notifee `loopSound`) until it is dismissed or the alert is handled.
 */
export async function showIncomingCall(data = {}) {
  if (!notifee) return;
  try {
    await ensureChannel();
    const id = `call-${data.alertId || "alert"}`;
    currentNotificationId = id;
    await notifee.displayNotification({
      id,
      title: `EMERGENCY: ${data.elderName || "Resident"}`,
      body: `${data.eventType || "Fall"} at ${data.roomLocation || "their room"} - tap to respond`,
      data: toFlatStrings(data),
      android: {
        channelId: CALL_CHANNEL_ID,
        loopSound: true,
        ongoing: true,
        autoCancel: false,
        importance: AndroidImportance.HIGH,
        category: AndroidCategory.CALL,
        color: "#DC2626",
        pressAction: { id: "default", launchActivity: "default" },
      },
    });
  } catch (e) {}
}

export async function cancelIncomingCall() {
  if (!notifee) return;
  const id = currentNotificationId;
  currentNotificationId = null;
  try {
    if (id) await notifee.cancelNotification(id);
  } catch (e) {}
}

/**
 * Wire call-style ringing:
 *  - foreground push received (tier >= 2) -> looping ring, before any tap
 *  - pressing the call notification -> cancel ring + open the alert screen
 * Returns a cleanup function.
 */
export function initCallAlerts({ navigationRef } = {}) {
  if (!notifee) return () => {};

  const unsubReceived = Notifications.addNotificationReceivedListener((n) => {
    const data = n?.request?.content?.data || {};
    if (Number(data.tier) >= 2) showIncomingCall(data);
  });

  const unsubNotifee = notifee.onForegroundEvent(({ type, detail }) => {
    if (type !== EventType.PRESS && type !== EventType.ACTION_PRESS) return;
    cancelIncomingCall();
    const data = detail?.notification?.data || {};
    if (!data.alertId || !navigationRef?.isReady?.()) return;
    // The modal fetches the live doc by id; pass a minimal seed.
    navigationRef.navigate("CaretakerAlert", {
      alert: { id: data.alertId, eventType: data.eventType, tier: Number(data.tier) },
    });
  });

  return () => {
    try { unsubReceived && unsubReceived(); } catch (e) {}
    try { unsubNotifee && unsubNotifee(); } catch (e) {}
  };
}

import { Platform } from "react-native";

// Client-side emergency push. The Python gateway sends the same payload shape for
// camera/dashboard alerts; this path covers alerts the app itself creates (SOS).
const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EMERGENCY_CHANNEL_ID = "emergency-alerts-v4";

export function buildEmergencyPush({ token, alertId, elderId, elderName, roomLocation, eventType, tier, elderPhone, assignedCaretakerId }) {
  const label = eventType === "MANUAL_SOS" ? "SOS" : eventType || "Emergency";
  return {
    to: token,
    title: `Emergency: ${elderName || "Resident"}`,
    body: `${label} in ${roomLocation || "their room"}`,
    sound: "default",
    priority: "high",
    channelId: EMERGENCY_CHANNEL_ID,
    interruptionLevel: "time-sensitive",
    data: {
      alertId,
      elderId,
      eventType: eventType || "MANUAL_SOS",
      tier: tier ?? 2,
      elderPhone: elderPhone || null,
      assignedCaretakerId: assignedCaretakerId || null,
    },
  };
}

export function buildAlertStatusPush({ token, alertId, elderId, elderName, statusMessage, status }) {
  return {
    to: token,
    title: `Alert update: ${elderName || "Resident"}`,
    body: statusMessage,
    sound: "default",
    priority: "high",
    channelId: EMERGENCY_CHANNEL_ID,
    data: { alertId, elderId, status: status || "RESOLVED" },
  };
}

async function sendPush(message, purpose) {
  if (Platform.OS === "web" || !message?.to) {
    console.warn(`${purpose} push was not sent: no device token is available.`);
    return false;
  }
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 8000) : null;
  try {
    const res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(message),
      ...(controller ? { signal: controller.signal } : {}),
    });
    const json = await res.json();
    if (!res.ok || json?.data?.status !== "ok") {
      console.error(`${purpose} push was rejected by Expo.`, {
        httpStatus: res.status,
        error: json?.data?.message || json?.errors?.[0]?.message || "Unknown push error",
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error(`${purpose} push request failed.`, error?.message || error);
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function sendEmergencyPush(args) {
  return sendPush(buildEmergencyPush(args), "Emergency");
}

export async function sendAlertStatusPush(args) {
  return sendPush(buildAlertStatusPush(args), "Alert status");
}

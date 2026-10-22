import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { doc, updateDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../config/firebase";
import { linkedElderIds } from "./linking";
import { syncVolunteerDirectory } from "./volunteerDirectory";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const ANDROID_EMERGENCY_CHANNEL_ID = "emergency-alerts";
// Call-style channel: rings on the ALARM audio stream even in Do Not Disturb,
// with a long ring-like vibration pattern and the bundled 30s phone-ring tone.
// New ids (never mutate) because Android channel settings are immutable after
// creation: v2 shipped with the system default sound; v3's name used a hyphen
// and its build failed (res/raw names allow a-z 0-9 _ only) - v4 carries the
// fixed `emergency_ring.wav` sound.
const ANDROID_EMERGENCY_CALL_CHANNEL_ID = "emergency-alerts-v4";
const ANDROID_WARNINGS_CHANNEL_ID = "warnings";

function expoProjectId() {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    "792ec601-55f0-42ff-9456-1edfa21c2508"
  );
}

export async function registerPushTokenForUser(user, profile) {
  if (!isFirebaseConfigured || !user || !profile) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ANDROID_EMERGENCY_CHANNEL_ID, {
      name: "Emergency alerts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 700, 250, 700],
      lightColor: "#DC2626",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: "default",
    });
    // Phone-call-style emergency channel: loud ring tone, long ringing
    // vibration, alarm audio stream (plays at alarm volume), bypasses DND.
    await Notifications.setNotificationChannelAsync(ANDROID_EMERGENCY_CALL_CHANNEL_ID, {
      name: "Emergency alerts (call style)",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 1500, 800, 1500, 800, 1500, 800, 1500, 800, 1500],
      enableVibrate: true,
      lightColor: "#DC2626",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: "emergency_ring.wav",
      bypassDnd: true,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    });
    // Tier-1 "checking" pushes: gently notify, never ring like an emergency.
    await Notifications.setNotificationChannelAsync(ANDROID_WARNINGS_CHANNEL_ID, {
      name: "Check-in warnings",
      importance: Notifications.AndroidImportance.DEFAULT,
      enableVibrate: false,
      sound: null,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let finalStatus = current.status;
  if (finalStatus !== "granted") {
    const requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowCriticalAlerts: false,
      },
    });
    finalStatus = requested.status;
  }
  if (finalStatus !== "granted") return null;

  const result = await Notifications.getExpoPushTokenAsync({ projectId: expoProjectId() });
  const token = result?.data;
  if (!token) return null;

  if (token !== profile.expoPushToken || token !== profile.pushToken) {
    await updateDoc(doc(db, "users", user.uid), {
      expoPushToken: token,
      pushToken: token,
      notificationsUpdatedAt: new Date().toISOString(),
    });
  }

  if (profile.role === "caretaker") {
    // Keep the mirrored token fresh on every linked resident so their SOS can
    // send a push even when this caretaker app has never been opened since the
    // link was made.
    const now = new Date().toISOString();
    for (const elderId of linkedElderIds(profile)) {
      try {
        await updateDoc(doc(db, "users", elderId), {
          caretakerPushToken: token,
          updatedAt: now,
        });
      } catch (e) {}
    }
  }

  if (profile.role === "volunteer") {
    await syncVolunteerDirectory(user, profile, token);
  }
  return token;
}

export { ANDROID_EMERGENCY_CHANNEL_ID, ANDROID_EMERGENCY_CALL_CHANNEL_ID, ANDROID_WARNINGS_CHANNEL_ID };

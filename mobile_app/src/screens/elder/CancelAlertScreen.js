import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { markAlertSafeByElder } from "../../services/alertResponses";
import { sendAlertStatusPush } from "../../services/alertPush";
import { listOnDutyVolunteers } from "../../services/volunteerDirectory";
import ScreenContainer from "../../components/ScreenContainer";
import { palette, type, space, radius, shadow } from "../../theme";

/**
 * Elder "Are you OK?" screen. Shown automatically while a pre-impact warning
 * (or an emergency) is open for this elder.
 *
 *  - "I'm OK"       -> records an elder confirmation and closes this alert.
 *  - "I Need Help"  -> status CONFIRMED (keeps the emergency alive, flags distress).
 *
 * Closes itself if the episode resolves elsewhere (gateway auto-cancel).
 * Expects route param { alertId } or { alert: { id } }.
 */
export default function CancelAlertScreen({ navigation, route }) {
  const { user, profile } = useAuth();
  const alertId = route?.params?.alertId || route?.params?.alert?.id;
  const [busy, setBusy] = useState(null);
  const [status, setStatus] = useState(route?.params?.alert?.status || "WARNING");
  const [liveAlert, setLiveAlert] = useState(route?.params?.alert || {});
  const [actionError, setActionError] = useState("");

  // Live: close by itself when the episode auto-cancels (gateway saw recovery).
  useEffect(() => {
    if (!isFirebaseConfigured || !alertId) return;
    const unsub = onSnapshot(doc(db, "alerts", alertId), (snap) => {
      if (!snap.exists()) return;
      const alert = { id: snap.id, ...snap.data() };
      setLiveAlert(alert);
      const s = alert.status;
      setStatus(s);
      if (s === "AUTO_CANCELLED" || s === "RESOLVED" || s === "RESOLVED_FALSE_ALARM") {
        navigation.goBack();
      }
    }, () => {
      setActionError("Live alert updates are unavailable. Check your connection before responding.");
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertId]);

  const notifyResponders = async (message, nextStatus) => {
    const tokens = [];
    if (profile?.caretakerPushToken) tokens.push(profile.caretakerPushToken);
    if (liveAlert.escalatedToVolunteers) {
      const volunteers = await listOnDutyVolunteers();
      tokens.push(...volunteers.map((volunteer) => volunteer.expoPushToken));
    }
    const uniqueTokens = [...new Set(tokens.filter(Boolean))];
    if (!uniqueTokens.length) return;
    await Promise.all(uniqueTokens.map((token) => sendAlertStatusPush({
      token,
      alertId,
      elderId: user?.uid,
      elderName: profile?.name || "Resident",
      statusMessage: message,
      status: nextStatus,
    })));
  };

  const setStatusAndClose = async (nextStatus, which) => {
    setBusy(which);
    setActionError("");
    let savedStatus = nextStatus;
    if (!isFirebaseConfigured || !alertId) {
      setActionError("The alert service is unavailable. Please call your caretaker.");
      setBusy(null);
      return;
    }
    try {
      if (which === "ok") {
        const updated = await markAlertSafeByElder(alertId, user, profile);
        savedStatus = updated.status;
      } else {
        await updateDoc(doc(db, "alerts", alertId), {
          status: nextStatus,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      setActionError(error?.message || "We could not update this alert. Check your connection and try again.");
      setBusy(null);
      return;
    }
    setBusy(null);
    const message = which === "ok"
      ? `${profile?.name || "The resident"} marked themselves safe.`
      : `${profile?.name || "The resident"} still needs help.`;
    notifyResponders(message, savedStatus).catch((error) => {
      console.error("Unable to notify responders about the resident's update.", error?.message || error);
    });
    navigation.goBack();
  };

  const resolved = status === "AUTO_CANCELLED" || status === "RESOLVED" || status === "RESOLVED_FALSE_ALARM";

  return (
    <ScreenContainer center>
      <View style={styles.iconWrap}>
        <Ionicons name="help-buoy" size={72} color={palette.warn} />
      </View>
      <Text style={styles.title}>Are you okay?</Text>
      <Text style={styles.sub}>
        {liveAlert.eventType === "MANUAL_SOS"
          ? "Your SOS is active. Let your caretaker know if you are safe or still need help."
          : "We noticed you might have lost your balance. Let us know how you are."}
      </Text>

      <Pressable
        onPress={() => setStatusAndClose("AUTO_CANCELLED", "ok")}
        accessibilityRole="button"
        accessibilityLabel="I am okay, cancel the alert"
        disabled={resolved || Boolean(busy)}
        style={({ pressed }) => [styles.btn, styles.okBtn, pressed && { opacity: 0.9 }]}
      >
        {busy === "ok"
          ? <ActivityIndicator size="large" color={palette.white} />
          : <Ionicons name="checkmark-circle" size={34} color={palette.white} />}
        <Text style={styles.btnTxt}>I'm OK — Mark Safe</Text>
      </Pressable>

      <Pressable
        onPress={() => setStatusAndClose("CONFIRMED", "help")}
        accessibilityRole="button"
        accessibilityLabel="I need help"
        disabled={resolved || Boolean(busy)}
        style={({ pressed }) => [styles.btn, styles.helpBtn, pressed && { opacity: 0.9 }]}
      >
        {busy === "help"
          ? <ActivityIndicator size="large" color={palette.white} />
          : <Ionicons name="alert-circle" size={34} color={palette.white} />}
        <Text style={styles.btnTxt}>I Need Help</Text>
      </Pressable>

      {actionError ? <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text> : null}
      <Text style={styles.footer}>
        Your update is shared with your caretaker and any responding volunteers.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  iconWrap: { alignItems: "center", marginBottom: space.md },
  title: { fontSize: type.xxl, fontWeight: type.weightBold, color: palette.text, textAlign: "center" },
  sub: { fontSize: type.md, color: palette.textMuted, textAlign: "center", marginTop: space.sm, marginBottom: space.xl },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: radius.xl, minHeight: 88, marginVertical: space.sm, ...shadow.card,
  },
  okBtn: { backgroundColor: palette.success },
  helpBtn: { backgroundColor: palette.danger },
  btnTxt: { color: palette.white, fontSize: type.xl, fontWeight: type.weightBold, marginLeft: space.sm },
  footer: { fontSize: type.sm, color: palette.textFaint, textAlign: "center", marginTop: space.lg },
  error: { color: palette.danger, fontSize: type.sm, textAlign: "center", marginTop: space.sm },
});

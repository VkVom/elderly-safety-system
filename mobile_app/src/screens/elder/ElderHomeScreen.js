import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Animated, Easing, Linking, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import { db, isFirebaseConfigured } from "../../config/firebase";
import { placeCall, armAutoAnswer, disarmAutoAnswer } from "../../services/autoCall";
import { sendEmergencyPush } from "../../services/alertPush";
import { listOnDutyVolunteers } from "../../services/volunteerDirectory";
import { palette, type, space, radius, shadow } from "../../theme";

// Grace period after an emergency alert before the elder phone places the
// fallback call. The push notification is the first response; the call only
// happens if the caretaker has not acknowledged by then.
const ACK_WAIT_MS = 20000;
// After the unanswered fallback call, open the alert to the volunteer
// community so someone is paged even if the caretaker phone never responded.
const VOLUNTEER_ESCALATE_MS = 45000;

export default function ElderHomeScreen({ navigation }) {
  const { user, profile, logout } = useAuth();
  const [activeAlerts, setActiveAlerts] = useState([]);
  const pulse = useRef(new Animated.Value(0)).current;
  const promptedRef = useRef(false);
  const autoCallRef = useRef(null);
  const callTimerRef = useRef(null);
  const volunteerTimerRef = useRef(null);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const firstName = profile?.name ? profile.name.split(" ")[0] : "there";
  const caretakerName = profile?.caretakerName;
  const caretakerPhone = profile?.caretakerPhone || profile?.emergencyContact;
  const isLinked = Boolean(profile?.caretakerId);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  // Keep the resident's active alerts visible. Fall warnings still open the
  // check-in automatically; SOS emergencies remain on the home list.
  // For emergency tiers the caretaker gets the push first; if nobody acknowledges within
  // ACK_WAIT_MS the phone places the call, and arms auto-answer so the
  // caretaker's callback connects even if the elder cannot tap.
  useEffect(() => {
    const uid = user?.uid || profile?.uid;
    if (!isFirebaseConfigured || !uid) return;
    const q = query(
      collection(db, "alerts"),
      where("elderId", "==", uid),
      where("status", "in", ["CREATED", "WARNING", "CONFIRMED"])
    );

    const clearCallTimer = () => {
      if (callTimerRef.current) {
        clearTimeout(callTimerRef.current);
        callTimerRef.current = null;
      }
    };

    const clearVolunteerTimer = () => {
      if (volunteerTimerRef.current) {
        clearTimeout(volunteerTimerRef.current);
        volunteerTimerRef.current = null;
      }
    };

    const scheduleVolunteerEscalation = (alertId) => {
      if (volunteerTimerRef.current) return;
      volunteerTimerRef.current = setTimeout(async () => {
        volunteerTimerRef.current = null;
        try {
          // Re-check the live doc: the caretaker may have answered meanwhile.
          const snap = await getDoc(doc(db, "alerts", alertId));
          const data = snap.exists() ? snap.data() : null;
          if (
            !data
            || hasActiveResponder(data)
            || isLegacyAcknowledgement(data)
            || data.escalatedToVolunteers
          ) return;
          if (!["CREATED", "WARNING", "CONFIRMED"].includes(data.status)) return;
          await updateDoc(doc(db, "alerts", alertId), { escalatedToVolunteers: true });
          const volunteers = await listOnDutyVolunteers();
          for (const v of volunteers) {
            sendEmergencyPush({
              token: v.expoPushToken,
              alertId,
              elderId: uid,
              elderName: data.elderName || profile?.name,
              roomLocation: data.roomLocation || profile?.roomLocation,
              eventType: data.eventType,
              tier: 3,
              elderPhone: data.elderPhone || null,
              assignedCaretakerId: data.assignedCaretakerId || null,
            }).catch(() => {});
          }
        } catch (e) {}
      }, VOLUNTEER_ESCALATE_MS);
    };

    const placeEmergencyCall = (alertId) => {
      if (!caretakerPhone) return;
      autoCallRef.current = alertId;
      placeCall(caretakerPhone).then((ok) => {
        if (!ok) return;
        armAutoAnswer(180000);
        updateDoc(doc(db, "alerts", alertId), {
          callPlacedAt: new Date().toISOString(),
        }).catch(() => {});
        scheduleVolunteerEscalation(alertId);
      });
    };

    const unsub = onSnapshot(q, (snap) => {
      const alerts = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
      setActiveAlerts(alerts);
      const pending = alerts.find((alert) => alert.status === "WARNING") || alerts[0] || null;
      const warning = alerts.find((alert) => alert.status === "WARNING");
      if (warning && !promptedRef.current) {
        promptedRef.current = true;
        navigation.navigate("CancelAlert", { alertId: warning.id, alert: warning });
      } else if (!warning) {
        promptedRef.current = false;
      }
      if (!alerts.length) {
        autoCallRef.current = null;
        clearCallTimer();
        clearVolunteerTimer();
        disarmAutoAnswer();
      }
      if (!pending) return;

      // A responder who committed to help suppresses the fallback call. A
      // stale acknowledgement does not suppress escalation after stand-down.
      if (hasActiveResponder(pending) || isLegacyAcknowledgement(pending)) {
        clearCallTimer();
        clearVolunteerTimer();
        disarmAutoAnswer();
        return;
      }
      // Call already placed (e.g. app restarted mid-episode): just keep the
      // answer window armed so the caretaker's callback still connects.
      if (pending.callPlacedAt) {
        clearCallTimer();
        const placedAt = Date.parse(pending.callPlacedAt) || 0;
        if (Date.now() - placedAt < 240000) armAutoAnswer(180000);
        if (!pending.escalatedToVolunteers) scheduleVolunteerEscalation(pending.id);
        return;
      }

      const isEmergency =
        Number(pending.tier) >= 2
        || pending.eventType === "MANUAL_SOS"
        || pending.eventType === "FALL_IMPACT"
        || pending.eventType === "LONG_LIE_ALERT"
        || pending.eventType === "POSE_LOST_WHILE_FALLEN";
      if (!isEmergency || !caretakerPhone) return;
      if (autoCallRef.current === pending.id || callTimerRef.current) return;

      const startedAt = Date.parse(pending.timestamp || pending.escalationTimerStart || "") || Date.now();
      const delay = Math.max(0, startedAt + ACK_WAIT_MS - Date.now());
      autoCallRef.current = pending.id;
      callTimerRef.current = setTimeout(() => {
        callTimerRef.current = null;
        placeEmergencyCall(pending.id);
      }, delay);
    });
    return () => {
      unsub();
      clearCallTimer();
      clearVolunteerTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, profile?.uid, caretakerPhone, navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      {/* Top bar: greeting + sign out */}
      <View style={styles.topbar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello} numberOfLines={1}>Hello, {firstName}</Text>
          <Text style={styles.tagline}>You are protected</Text>
        </View>
        <Pressable
          onPress={logout}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          hitSlop={10}
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="log-out-outline" size={20} color={palette.textMuted} />
          <Text style={styles.logoutTxt}>Sign Out</Text>
        </Pressable>
      </View>

      {/* Body fills the rest of the screen with no scrolling */}
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Compact status row */}
        <View style={styles.statusRow}>
          <Animated.View style={[styles.shield, { transform: [{ scale }] }]}>
            <Ionicons name="shield-checkmark" size={34} color={palette.white} />
          </Animated.View>
          <View style={{ flex: 1, marginLeft: space.md }}>
            <Text style={styles.statusTitle}>Safety System Active</Text>
            <Text style={styles.statusSub}>We are keeping watch. Rest easy.</Text>
          </View>
        </View>

        {/* Keep SOS large and reachable even when the alert list needs scrolling. */}
        <Pressable
          onPress={() => navigation.navigate("SOS")}
          accessibilityRole="button"
          accessibilityLabel="Send SOS for help"
          style={({ pressed }) => [styles.sos, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
        >
          <Ionicons name="hand-left" size={64} color={palette.white} />
          <Text style={styles.sosText}>SOS</Text>
          <Text style={styles.sosSub}>Tap here if you need help</Text>
        </Pressable>

        {activeAlerts.length ? (
          <View style={styles.activeAlerts}>
            <View style={styles.activeHeading}>
              <Text style={styles.activeTitle}>Active alerts</Text>
              <Text style={styles.activeCount}>{activeAlerts.length}</Text>
            </View>
            {activeAlerts.map((alert) => (
              <Pressable
                key={alert.id}
                onPress={() => navigation.navigate("CancelAlert", { alertId: alert.id, alert })}
                accessibilityRole="button"
                accessibilityLabel={`Open ${alert.eventType === "MANUAL_SOS" ? "SOS" : "safety"} alert for ${alert.roomLocation || "your room"}`}
                style={({ pressed }) => [styles.activeAlert, pressed && { opacity: 0.88 }]}
              >
                <View style={styles.activeAlertIcon}>
                  <Ionicons name="alert-circle" size={23} color={palette.danger} />
                </View>
                <View style={{ flex: 1, marginLeft: space.sm }}>
                  <Text style={styles.activeAlertTitle}>
                    {alert.eventType === "MANUAL_SOS" ? "SOS request" : "Safety check"}
                  </Text>
                  <Text style={styles.activeAlertSub}>
                    {alert.roomLocation || "Location unavailable"} · {alert.status === "CONFIRMED" ? "Help requested" : "Waiting for response"}
                  </Text>
                  {getActiveResponder(alert) ? (
                    <Text style={styles.activeResponder}>
                      {getActiveResponder(alert).name || (getActiveResponder(alert).role === "caretaker" ? "Caretaker" : "A volunteer")}
                      {getActiveResponder(alert).status === "ARRIVED" ? " has arrived" : " is on the way"}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={22} color={palette.textMuted} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Caretaker card: linked -> call; not linked -> show pairing code to share */}
        {isLinked ? (
          <Pressable
            onPress={() => caretakerPhone && Linking.openURL(`tel:${caretakerPhone}`)}
            accessibilityRole="button"
            accessibilityLabel="Call your caretaker"
            style={({ pressed }) => [styles.callCard, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
          >
            <View style={styles.callTop}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={26} color={palette.safeDark} />
              </View>
              <View style={{ flex: 1, marginLeft: space.md }}>
                <Text style={styles.careLabel}>Your Caretaker</Text>
                <Text style={styles.careName} numberOfLines={1}>{caretakerName || "Caretaker"}</Text>
              </View>
            </View>
            <View style={styles.callAction}>
              <Ionicons name="call" size={26} color={palette.white} />
              <Text style={styles.callTxt}>Call Caretaker</Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.linkCard}>
            <Ionicons name="key" size={28} color={palette.safeDark} />
            <Text style={styles.linkLabel}>Share this code with your caretaker</Text>
            <Text style={styles.linkCode}>{profile?.pairingCode || "…"}</Text>
            <Text style={styles.linkHint}>They enter it in their app to connect with you.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function hasActiveResponder(alert) {
  return [alert.caretakerResponse, alert.volunteerResponse]
    .some((response) => response && ["ON_THE_WAY", "ARRIVED"].includes(response.status));
}

function getActiveResponder(alert) {
  return [alert.caretakerResponse, alert.volunteerResponse]
    .find((response) => response && ["ON_THE_WAY", "ARRIVED"].includes(response.status));
}

function isLegacyAcknowledgement(alert) {
  return Boolean(
    alert.acknowledgedBy
    && !alert.caretakerResponse
    && !alert.volunteerResponse
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },

  topbar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md,
  },
  hello: { fontSize: type.xl, fontWeight: type.weightBold, color: palette.text },
  tagline: { fontSize: type.sm, color: palette.safeDark, fontWeight: type.weightMed, marginTop: 2 },
  logoutBtn: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: palette.surfaceAlt, borderRadius: radius.pill,
    paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  logoutTxt: { color: palette.textMuted, fontSize: type.sm, fontWeight: type.weightMed, marginLeft: space.xs },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: space.lg, paddingBottom: space.lg },

  statusRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: palette.safeSoft, borderRadius: radius.lg, padding: space.md,
  },
  shield: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: palette.safe,
    alignItems: "center", justifyContent: "center",
  },
  statusTitle: { fontSize: type.md, fontWeight: type.weightBold, color: palette.safeDark },
  statusSub: { fontSize: type.sm, color: palette.textMuted, marginTop: 2 },

  sos: {
    minHeight: 260,
    backgroundColor: palette.danger,
    borderRadius: radius.xl,
    alignItems: "center", justifyContent: "center",
    marginVertical: space.md,
    ...shadow.floating,
  },
  sosText: { color: palette.white, fontSize: 60, fontWeight: type.weightBold, letterSpacing: 2, marginTop: space.sm },
  sosSub: { color: palette.white, fontSize: type.lg, fontWeight: type.weightMed, marginTop: space.xs },

  activeAlerts: { marginBottom: space.md },
  activeHeading: { flexDirection: "row", alignItems: "center", marginBottom: space.sm },
  activeTitle: { flex: 1, fontSize: type.lg, fontWeight: type.weightBold, color: palette.text },
  activeCount: {
    minWidth: 28, textAlign: "center", borderRadius: radius.pill,
    overflow: "hidden", backgroundColor: palette.dangerSoft, color: palette.danger,
    fontSize: type.sm, fontWeight: type.weightBold, paddingHorizontal: space.xs, paddingVertical: 2,
  },
  activeAlert: {
    minHeight: 76, flexDirection: "row", alignItems: "center", backgroundColor: palette.surface,
    borderRadius: radius.lg, padding: space.md, marginBottom: space.sm, ...shadow.card,
  },
  activeAlertIcon: {
    width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center",
    backgroundColor: palette.dangerSoft,
  },
  activeAlertTitle: { color: palette.text, fontSize: type.md, fontWeight: type.weightSemi },
  activeAlertSub: { color: palette.textMuted, fontSize: type.sm, marginTop: 3 },
  activeResponder: { color: palette.safeDark, fontSize: type.sm, fontWeight: type.weightSemi, marginTop: 4 },

  callCard: {
    minHeight: 148,
    backgroundColor: palette.surface, borderRadius: radius.xl,
    padding: space.lg, justifyContent: "space-between", ...shadow.card,
  },
  callTop: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: palette.safeSoft, alignItems: "center", justifyContent: "center" },
  careLabel: { fontSize: type.sm, color: palette.textMuted },
  careName: { fontSize: type.lg, fontWeight: type.weightSemi, color: palette.text, marginTop: 2 },
  callAction: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: palette.safe, borderRadius: radius.lg, paddingVertical: space.md,
  },
  callTxt: { color: palette.white, fontSize: type.lg, fontWeight: type.weightSemi, marginLeft: space.sm },

  linkCard: {
    minHeight: 148, backgroundColor: palette.safeSoft, borderRadius: radius.xl,
    padding: space.lg, alignItems: "center", justifyContent: "center",
  },
  linkLabel: { fontSize: type.sm, color: palette.textMuted, marginTop: space.sm },
  linkCode: { fontSize: type.xxl, fontWeight: type.weightBold, color: palette.safeDark, letterSpacing: 4, marginVertical: space.xs },
  linkHint: { fontSize: type.xs, color: palette.textMuted, textAlign: "center" },
});

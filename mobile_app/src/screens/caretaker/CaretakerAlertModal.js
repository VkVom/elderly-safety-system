import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Vibration, Animated, Easing, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { updateAlertResponse } from "../../services/alertResponses";
import { cancelIncomingCall } from "../../services/callAlerts";
import { placeCall } from "../../services/autoCall";
import { sendEmergencyPush } from "../../services/alertPush";
import { listOnDutyVolunteers } from "../../services/volunteerDirectory";
import Button from "../../components/Button";
import { palette, type, space, radius, shadow, EVENT_META } from "../../theme";

const ESCALATION_SECONDS = 20;

/**
 * Tier-driven alert modal:
 *   warning   (PRE_FALL_WARNING / status WARNING)  -> amber "checking" UI, NO siren.
 *   emergency (status CREATED, tier >= 2)          -> red UI + siren + 20s volunteer
 *                                                     countdown.
 *   cancelled (status AUTO_CANCELLED)              -> green "recovered", auto-dismiss.
 *
 * The alert doc is watched LIVE: a warning that becomes an impact upgrades this very
 * screen in place (amber -> red + siren). No second modal ever stacks.
 */
export default function CaretakerAlertModal({ navigation, route }) {
  const { user, profile } = useAuth();
  const initial = route?.params?.alert || {};
  const [live, setLive] = useState(initial);
  const [count, setCount] = useState(ESCALATION_SECONDS);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const doneRef = useRef(false);
  const emergencyStartedRef = useRef(false);
  const escalationTimerRef = useRef(null);
  const soundRef = useRef(null);
  const flash = useRef(new Animated.Value(0)).current;

  const phase = resolvePhase(live);
  const meta = EVENT_META[live.eventType] || { label: live.eventType, color: palette.danger, icon: "alert-circle" };
  const phone = live.elderPhone || live.emergencyContact || null;
  const volunteerResponse = live.volunteerResponse;
  const caretakerResponse = live.caretakerResponse;
  const volunteerIsResponding = volunteerResponse && ["ON_THE_WAY", "ARRIVED"].includes(volunteerResponse.status);
  const caretakerIsResponding = caretakerResponse && ["ON_THE_WAY", "ARRIVED"].includes(caretakerResponse.status);
  const hasResponder = Boolean(volunteerIsResponding || caretakerIsResponding);

  // Live doc watch — the episode doc transitions WARNING -> CREATED or AUTO_CANCELLED.
  useEffect(() => {
    if (!isFirebaseConfigured || !initial.id) return;
    const unsub = onSnapshot(doc(db, "alerts", initial.id), (snap) => {
      if (snap.exists()) setLive({ id: snap.id, ...snap.data() });
    });
    return unsub;
  }, [initial.id]);

  // Auto-callback (tier-3 chain, caretaker side): the elder's phone already
  // auto-called us. If nobody has responded ~40s after that call was placed,
  // dial the elder automatically — once per episode — so the connection still
  // happens if the caretaker couldn't pick up the first call.
  useEffect(() => {
    if (phase !== "emergency" || !initial.id) return;
    if (!live.callPlacedAt || live.callBackAt || live.acknowledgedBy || !phone) return;
    const placedAt = Date.parse(live.callPlacedAt) || Date.now();
    const delay = Math.max(0, placedAt + 40000 - Date.now());
    const t = setTimeout(async () => {
      if (doneRef.current) return;
      const ok = await placeCall(phone);
      if (ok) {
        try {
          await updateDoc(doc(db, "alerts", initial.id), {
            callBackAt: new Date().toISOString(),
          });
        } catch (e) {}
      }
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, live.callPlacedAt, live.callBackAt, live.acknowledgedBy, phone]);

  // Emergency upgrade: start siren + vibration + countdown exactly once.
  useEffect(() => {
    if (
      phase !== "emergency"
      || hasResponder
      || live.escalatedToVolunteers
      || emergencyStartedRef.current
    ) return;
    emergencyStartedRef.current = true;
    startSiren();
    Animated.loop(
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(flash, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    ).start();
    const id = setInterval(() => {
      setCount((c) => {
        if (c <= 1) { clearInterval(id); escalate(); return 0; }
        return c - 1;
      });
    }, 1000);
    escalationTimerRef.current = id;
    return () => {
      clearInterval(id);
      escalationTimerRef.current = null;
      stopAlarm();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, hasResponder, live.escalatedToVolunteers]);

  // Warning / cancelled states must never make noise (covers downgrades + late cancels).
  useEffect(() => {
    if (phase !== "emergency") stopAlarm();
  }, [phase]);

  // Auto-cancelled: show the green recovered state briefly, then leave.
  useEffect(() => {
    if (phase !== "cancelled") return;
    const t = setTimeout(() => { if (!doneRef.current) navigation.goBack(); }, 2400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const startSiren = () => {
    Vibration.vibrate([0, 600, 300, 600], true);
    (async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: false,
          staysActiveInBackground: true,
        });
        const { sound } = await Audio.Sound.createAsync(
          require("../../../assets/alarm.wav"),
          { isLooping: true, volume: 1.0, shouldPlay: true }
        );
        if (emergencyStartedRef.current && phaseRef.current !== "cancelled") {
          soundRef.current = sound;
        } else {
          await sound.unloadAsync();
        }
      } catch (e) {}
    })();
  };

  // Keep the latest phase available to async callbacks (audio load races).
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const stopAlarm = async () => {
    Vibration.cancel();
    const sound = soundRef.current;
    soundRef.current = null;
    if (sound) {
      try {
        await sound.stopAsync();
        await sound.unloadAsync();
      } catch (e) {}
    }
  };

  useEffect(() => {
    // The modal rings on its own (siren) - stop the phone-call-style loop.
    cancelIncomingCall();
    return () => { Vibration.cancel(); stopAlarm(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = async () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setBusy(true);
    setActionError("");
    if (escalationTimerRef.current) clearInterval(escalationTimerRef.current);
    stopAlarm();
    try {
      await updateAlertResponse(live.id, user, profile, "accept");
      navigation.replace("ActiveResponse", { alert: live });
    } catch (error) {
      doneRef.current = false;
      setActionError(error?.message || "We could not save your response. Please try again or call the resident.");
      stopAlarm();
    }
    setBusy(false);
  };

  const escalate = async () => {
    if (doneRef.current) return;
    setBusy(true);
    setActionError("");
    stopAlarm();
    if (isFirebaseConfigured && live.id) {
      try {
        await updateDoc(doc(db, "alerts", live.id), { escalatedToVolunteers: true });
        doneRef.current = true;
      } catch (error) {
        doneRef.current = false;
        setBusy(false);
        setActionError("We could not notify the volunteer community. Please try again or call the resident.");
        return;
      }
      // Page on-duty volunteers even when their app is closed. Each volunteer
      // keeps a directory entry with their token; the in-app queue is fed by
      // the Firestore flag above.
      try {
        const volunteers = await listOnDutyVolunteers();
        for (const v of volunteers) {
          sendEmergencyPush({
            token: v.expoPushToken,
            alertId: live.id,
            elderId: live.elderId,
            elderName: live.elderName,
            roomLocation: live.roomLocation,
            eventType: live.eventType,
            tier: 3,
            elderPhone: phone,
            assignedCaretakerId: live.assignedCaretakerId || null,
          }).catch(() => {});
        }
      } catch (e) {}
    }
    navigation.goBack();
  };

  const callElder = () => {
    if (phone) Linking.openURL(`tel:${phone}`);
  };

  const headerBg = phase === "emergency"
    ? flash.interpolate({ inputRange: [0, 1], outputRange: [palette.danger, palette.dangerDark] })
    : phase === "warning" ? palette.warn : palette.success;
  const headerText = phase === "emergency" ? "EMERGENCY" : phase === "warning" ? "CHECKING" : "RECOVERED";
  const headerSub = phase === "cancelled" ? "Balance regained - auto-cancelled" : meta.label;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <Animated.View style={[styles.header, { backgroundColor: headerBg }]}>
        <Ionicons
          name={phase === "emergency" ? meta.icon : phase === "warning" ? "eye" : "checkmark-circle"}
          size={40} color={palette.white}
        />
        <Text style={styles.headerText}>{headerText}</Text>
        <Text style={styles.headerSub}>{headerSub}</Text>
      </Animated.View>

      <View style={styles.body}>
        <View style={styles.teleBox}>
          <Row icon="person" label="Elder" value={live.elderName} />
          <Row icon="location" label="Location" value={live.roomLocation} />
          <Row icon="pulse" label="Fall Probability" value={formatProbability(live.fallProbability)} />
          {phase !== "cancelled" ? (
            <>
              <Row icon="body" label="Posture" value={live.postureState} />
              <Row icon="cube" label="Context" value={live.furnitureContext} />
            </>
          ) : null}
        </View>

        {phase === "warning" ? (
          <View style={styles.infoWrap}>
            <Ionicons name="information-circle-outline" size={22} color={palette.warn} />
            <Text style={styles.infoText}>
              {live.elderName || "Resident"} may have lost balance. No impact confirmed yet -
              call to check before escalating.
            </Text>
          </View>
        ) : null}

        {phase === "emergency" && !hasResponder && !live.escalatedToVolunteers ? (
          <View style={styles.timerWrap}>
            <View style={styles.timerRing}>
              <Text style={styles.timerText}>{count}</Text>
            </View>
            <Text style={styles.timerLabel}>auto-escalates to volunteers</Text>
          </View>
        ) : null}
        {phase === "emergency" && (hasResponder || live.escalatedToVolunteers) ? (
          <View style={styles.responseWrap}>
            <Ionicons name={hasResponder ? "walk" : "people"} size={22} color={palette.safeDark} />
            <Text style={styles.responseText}>
              {volunteerIsResponding && caretakerIsResponding
                ? `${volunteerResponse.name || "A volunteer"} and you are responding.`
                : volunteerIsResponding
                  ? `${volunteerResponse.name || "A volunteer"} is ${volunteerResponse.status === "ARRIVED" ? "at the resident" : "on the way"}. This alert stays open until someone marks the resident safe.`
                  : caretakerIsResponding
                    ? "You are responding. The alert stays open until the resident is marked safe."
                    : "Volunteers have been notified. Waiting for someone to accept."}
            </Text>
          </View>
        ) : null}
        {actionError ? <Text accessibilityRole="alert" style={styles.actionError}>{actionError}</Text> : null}

        {phase === "cancelled" ? (
          <View style={styles.infoWrap}>
            <Ionicons name="shield-checkmark-outline" size={22} color={palette.safeDark} />
            <Text style={styles.infoText}>No action needed - this closes by itself.</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        {phase === "warning" ? (
          <>
            {phone ? <Button title="Call Elder Now" icon="call" variant="primary" size="lg" onPress={callElder} /> : null}
            <Button title="I'm Coming" icon="walk" variant="secondary" onPress={accept} loading={busy} />
          </>
        ) : phase === "emergency" ? (
          <>
            {!caretakerIsResponding ? (
              <Button title={volunteerIsResponding ? "I'M ALSO RESPONDING" : "I'M COMING"} icon="walk" variant="success" size="lg" onPress={accept} loading={busy} />
            ) : null}
            {phone ? <Button title="Call Elder Now" icon="call" variant="primary" onPress={callElder} /> : null}
            {!live.escalatedToVolunteers && !hasResponder ? (
              <Button title="Find Someone Else" icon="people" variant="secondary" onPress={escalate} loading={busy} />
            ) : (
              <Button title="Back to Monitoring" icon="arrow-back" variant="secondary" onPress={() => navigation.goBack()} disabled={busy} />
            )}
          </>
        ) : (
          <Button title="Done" icon="checkmark" variant="success" size="lg" onPress={() => navigation.goBack()} />
        )}
      </View>
    </SafeAreaView>
  );
}

/** warning = tier-1 pre-impact episode; cancelled = auto-resolved; else emergency. */
function resolvePhase(alert) {
  const status = alert?.status;
  const tier = typeof alert?.tier === "number" ? alert.tier : null;
  if (status === "AUTO_CANCELLED" || status === "RESOLVED" || status === "RESOLVED_FALSE_ALARM") {
    return "cancelled";
  }
  if (status === "WARNING" || alert?.eventType === "PRE_FALL_WARNING" || tier === 1) {
    return "warning";
  }
  return "emergency";
}

function formatProbability(value) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "N/A";
}

function Row({ icon, label, value }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={palette.textMuted} style={{ width: 26 }} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value ?? "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  header: { alignItems: "center", paddingVertical: space.lg, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  headerText: { color: palette.white, fontSize: type.xxl, fontWeight: type.weightBold, letterSpacing: 2, marginTop: space.xs },
  headerSub: { color: palette.white, fontSize: type.md, fontWeight: type.weightMed, marginTop: 2 },
  body: { flex: 1, padding: space.lg, justifyContent: "center" },
  teleBox: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md, ...shadow.card },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space.sm },
  rowLabel: { color: palette.textMuted, fontSize: type.sm, width: 120 },
  rowValue: { color: palette.text, fontSize: type.md, fontWeight: type.weightSemi, flex: 1, textAlign: "right" },
  infoWrap: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.lg, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, padding: space.md },
  infoText: { flex: 1, color: palette.textMuted, fontSize: type.sm, lineHeight: 20 },
  timerWrap: { alignItems: "center", marginTop: space.xl },
  timerRing: {
    width: 110, height: 110, borderRadius: 55, borderWidth: 8, borderColor: palette.warn,
    alignItems: "center", justifyContent: "center", backgroundColor: palette.warnSoft,
  },
  timerText: { fontSize: 44, fontWeight: type.weightBold, color: palette.warn },
  timerLabel: { color: palette.textMuted, fontSize: type.sm, marginTop: space.sm },
  responseWrap: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.lg, backgroundColor: palette.safeSoft, borderRadius: radius.md, padding: space.md },
  responseText: { flex: 1, color: palette.safeDark, fontSize: type.md, fontWeight: type.weightMed, lineHeight: 22 },
  actionError: { color: palette.dangerDark, fontSize: type.sm, textAlign: "center", marginTop: space.md },
  actions: { padding: space.lg, gap: space.sm },
});

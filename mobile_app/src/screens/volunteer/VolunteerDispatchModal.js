import React, { useEffect, useRef, useState } from "react";
import { Alert, View, Text, StyleSheet, Vibration, Animated, Easing, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { doc, onSnapshot } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { updateAlertResponse } from "../../services/alertResponses";
import Button from "../../components/Button";
import { palette, type, space, radius, shadow, EVENT_META } from "../../theme";

const ACTIVE_ALERT_STATUSES = new Set(["CREATED", "WARNING", "CONFIRMED"]);
const ACTIVE_RESPONSE_STATUSES = new Set(["ON_THE_WAY", "ARRIVED"]);

export default function VolunteerDispatchModal({ navigation, route }) {
  const { user, profile } = useAuth();
  const initial = route?.params?.alert || {};
  const [live, setLive] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const flash = useRef(new Animated.Value(0)).current;
  const meta = EVENT_META[live.eventType] || { label: live.eventType, color: palette.danger, icon: "alert-circle" };
  const myResponse = live.volunteerResponse?.uid === user?.uid ? live.volunteerResponse : null;
  const myResponseActive = myResponse && ACTIVE_RESPONSE_STATUSES.has(myResponse.status);
  const caretakerResponse = live.caretakerResponse;
  const caretakerActive = caretakerResponse && ACTIVE_RESPONSE_STATUSES.has(caretakerResponse.status);
  const anotherVolunteerActive =
    live.volunteerResponse?.uid !== user?.uid
    && ACTIVE_RESPONSE_STATUSES.has(live.volunteerResponse?.status);
  const isClosed = !ACTIVE_ALERT_STATUSES.has(live.status);
  const isUnavailable = caretakerActive || anotherVolunteerActive;

  useEffect(() => {
    if (!isFirebaseConfigured || !initial.id) return;
    const unsubscribe = onSnapshot(doc(db, "alerts", initial.id), (snapshot) => {
      if (snapshot.exists()) setLive({ id: snapshot.id, ...snapshot.data() });
    }, () => {
      setActionError("Live alert updates are unavailable. Check your connection before responding.");
    });
    return unsubscribe;
  }, [initial.id]);

  useEffect(() => {
    const shouldRing =
      !isClosed
      && !isUnavailable
      && !myResponseActive
      && myResponse?.status !== "STOOD_DOWN";
    if (!shouldRing) {
      Vibration.cancel();
      return;
    }
    Vibration.vibrate([0, 500, 300, 500], true);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(flash, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );
    animation.start();
    return () => {
      Vibration.cancel();
      animation.stop();
    };
  }, [flash, isClosed, isUnavailable, myResponse?.status, myResponseActive]);

  const act = async (action) => {
    setBusy(true);
    setActionError("");
    Vibration.cancel();
    try {
      await updateAlertResponse(live.id, user, profile, action);
      if (action === "stand_down") navigation.goBack();
    } catch (error) {
      setActionError(error?.message || "We could not save your response. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirmStandDown = () => {
    Alert.alert(
      "Stop responding?",
      "You will be marked as no longer on the way. The alert will remain open for other responders.",
      [
        { text: "Keep responding", style: "cancel" },
        { text: "Stand down", style: "destructive", onPress: () => act("stand_down") },
      ]
    );
  };

  const headerBg = isClosed || myResponseActive || isUnavailable || myResponse?.status === "STOOD_DOWN"
    ? palette.safeDark
    : flash.interpolate({ inputRange: [0, 1], outputRange: [palette.danger, palette.dangerDark] });
  const headerTitle = isClosed
    ? "ALERT CLOSED"
    : myResponseActive
      ? myResponse.status === "ARRIVED" ? "YOU HAVE ARRIVED" : "YOU'RE ON THE WAY"
      : isUnavailable ? "RESPONDER CONFIRMED" : "ESCALATED EMERGENCY";
  const headerSub = isClosed
    ? `Closed by ${live.resolvedByName || "a responder"}`
    : myResponseActive
      ? caretakerActive ? "The caretaker is also responding" : "Your response is shared with the caretaker"
      : isUnavailable
        ? `${caretakerResponse?.name || live.volunteerResponse?.name || "A responder"} is already responding`
        : "The primary caretaker has not responded";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <Animated.View style={[styles.header, { backgroundColor: headerBg }]}>
        <Ionicons name={isClosed ? "checkmark-circle" : myResponseActive ? "walk" : meta.icon} size={38} color={palette.white} />
        <Text style={styles.headerText}>{headerTitle}</Text>
        <Text style={styles.headerSub}>{headerSub}</Text>
      </Animated.View>

      <View style={styles.body}>
        <View style={styles.teleBox}>
          <Row icon="person" label="Resident" value={live.elderName} />
          <Row icon="location" label="Room / location" value={live.roomLocation} />
          <Row icon={meta.icon} label="Event" value={meta.label} />
          <Row icon="pulse" label="Fall probability" value={formatProbability(live.fallProbability)} />
          <Row icon="time" label="Since" value={shortTime(live.escalationTimerStart || live.timestamp)} />
        </View>

        {!isClosed && myResponseActive && caretakerActive ? (
          <View style={styles.responseBox}>
            <Ionicons name="people" size={22} color={palette.safeDark} />
            <Text style={styles.responseText}>
              Caretaker {caretakerResponse.name || "is responding"} · you remain on the way until you stand down or the alert is resolved.
            </Text>
          </View>
        ) : null}
        {!isClosed && isUnavailable && !myResponseActive ? (
          <View style={styles.responseBox}>
            <Ionicons name="information-circle" size={22} color={palette.safeDark} />
            <Text style={styles.responseText}>
              This alert is no longer requesting another volunteer. It will remain in recent updates.
            </Text>
          </View>
        ) : null}
        {isClosed ? (
          <View style={styles.responseBox}>
            <Ionicons name="checkmark-circle" size={22} color={palette.safeDark} />
            <Text style={styles.responseText}>This alert has been closed. The outcome remains in your recent updates.</Text>
          </View>
        ) : null}
        {actionError ? <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text> : null}
      </View>

      <View style={styles.actions}>
        {isClosed ? (
          <Button title="Close" variant="secondary" size="lg" onPress={() => navigation.goBack()} />
        ) : myResponseActive ? (
          <>
            <Button title="Call Emergency Services" icon="call" variant="danger" onPress={() => Linking.openURL("tel:911")} />
            {myResponse.status === "ON_THE_WAY" ? (
              <Button title="Mark Arrived" icon="location" variant="secondary" onPress={() => act("arrive")} loading={busy} />
            ) : null}
            {myResponse.status === "ARRIVED" ? (
              <Button title="Resident Safe — Resolve Alert" icon="checkmark-circle" variant="success" onPress={() => act("resolve")} loading={busy} />
            ) : (
              <Text style={styles.responseText}>After you arrive and confirm the resident is safe, mark the alert resolved. The resident can mark safe at any time.</Text>
            )}
            <Button title="I Can No Longer Respond" variant="ghost" onPress={confirmStandDown} disabled={busy} />
          </>
        ) : isUnavailable || myResponse?.status === "STOOD_DOWN" ? (
          <>
            <Button title="Call Emergency Services" icon="call" variant="danger" onPress={() => Linking.openURL("tel:911")} />
            <Button title="Close" variant="secondary" size="lg" onPress={() => navigation.goBack()} />
          </>
        ) : (
          <>
            <Button title="I'M ON MY WAY" icon="walk" variant="success" size="lg" onPress={() => act("accept")} loading={busy} />
            <Button title="Call Emergency Services" icon="call" variant="danger" onPress={() => Linking.openURL("tel:911")} />
            <Button title="I Can't Respond" variant="ghost" onPress={() => navigation.goBack()} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
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

function shortTime(ts) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleTimeString(); } catch (e) { return String(ts); }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  header: { alignItems: "center", paddingVertical: space.lg, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  headerText: { color: palette.white, fontSize: type.xl, fontWeight: type.weightBold, letterSpacing: 1, marginTop: space.xs, textAlign: "center" },
  headerSub: { color: palette.white, fontSize: type.sm, marginTop: 2, textAlign: "center", paddingHorizontal: space.md },
  body: { flex: 1, padding: space.lg, justifyContent: "center" },
  teleBox: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md, ...shadow.card },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space.sm },
  rowLabel: { color: palette.textMuted, fontSize: type.sm, width: 130 },
  rowValue: { color: palette.text, fontSize: type.md, fontWeight: type.weightSemi, flex: 1, textAlign: "right" },
  responseBox: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.safeSoft, borderRadius: radius.md, padding: space.md, marginTop: space.lg },
  responseText: { color: palette.safeDark, fontSize: type.md, fontWeight: type.weightMed, flex: 1, lineHeight: 22 },
  error: { color: palette.dangerDark, fontSize: type.sm, textAlign: "center", marginTop: space.md },
  actions: { padding: space.lg, gap: space.sm },
});

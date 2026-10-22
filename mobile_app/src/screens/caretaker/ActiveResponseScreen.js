import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { doc, onSnapshot } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { updateAlertResponse } from "../../services/alertResponses";
import ScreenContainer from "../../components/ScreenContainer";
import Card from "../../components/Card";
import Button from "../../components/Button";
import { palette, type, space, radius } from "../../theme";
import { EVENT_META } from "../../theme";

const ACTIVE_RESPONDER_STATES = new Set(["ON_THE_WAY", "ARRIVED"]);

export default function ActiveResponseScreen({ navigation, route }) {
  const { user, profile } = useAuth();
  const [alert, setAlert] = useState(route?.params?.alert || {});
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const meta = EVENT_META[alert.eventType] || { label: alert.eventType, icon: "alert-circle" };
  const myResponse = alert.caretakerResponse;
  const isResolved = ["RESOLVED", "RESOLVED_FALSE_ALARM", "AUTO_CANCELLED"].includes(alert.status);
  const otherResponses = [
    alert.caretakerResponse,
    alert.volunteerResponse,
  ].filter((response) =>
    response
    && response.uid !== user?.uid
    && ACTIVE_RESPONDER_STATES.has(response.status)
  );

  useEffect(() => {
    if (!isFirebaseConfigured || !alert.id) return;
    const unsubscribe = onSnapshot(doc(db, "alerts", alert.id), (snapshot) => {
      if (snapshot.exists()) setAlert({ id: snapshot.id, ...snapshot.data() });
    }, () => {
      setActionError("Live alert updates are unavailable. Check your connection before taking action.");
    });
    return unsubscribe;
  }, [alert.id]);

  const update = async (action) => {
    setBusy(true);
    setActionError("");
    try {
      await updateAlertResponse(alert.id, user, profile, action);
      if (action === "resolve") navigation.navigate("CaretakerHome");
    } catch (error) {
      setActionError(error?.message || "We could not save that update. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer scroll>
      <Card style={styles.banner}>
        <Ionicons name={isResolved ? "checkmark-circle" : "walk"} size={28} color={isResolved ? palette.safeDark : palette.safeDark} />
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTxt}>{isResolved ? "Alert resolved" : "Response in progress"}</Text>
          <Text style={styles.bannerSub}>
            {isResolved
              ? `Closed by ${alert.resolvedByName || "a responder"}`
              : myResponse?.status === "ARRIVED" ? "You marked that you have arrived" : "You are marked as on the way"}
          </Text>
        </View>
      </Card>

      <Card style={styles.info}>
        <View style={styles.avatar}><Ionicons name="person" size={30} color={palette.safeDark} /></View>
        <Text style={styles.name}>{alert.elderName || "Resident"}</Text>
        <View style={styles.locRow}>
          <Ionicons name="location" size={18} color={palette.textMuted} />
          <Text style={styles.loc}>{alert.roomLocation || "Location unavailable"}</Text>
        </View>
        <View style={styles.eventPill}>
          <Ionicons name={meta.icon} size={16} color={palette.dangerDark} />
          <Text style={styles.eventTxt}>{meta.label}</Text>
        </View>
      </Card>

      {!isResolved && otherResponses.length > 0 ? (
        <Card style={styles.responders}>
          <Text style={styles.sectionTitle}>Also responding</Text>
          {otherResponses.map((response) => (
            <View key={response.uid} style={styles.responderRow}>
              <Ionicons name="person-circle-outline" size={24} color={palette.safeDark} />
              <Text style={styles.responderText}>
                {response.name || (response.role === "volunteer" ? "Volunteer" : "Caretaker")}
                {" · "}
                {response.status === "ARRIVED" ? "Arrived" : "On the way"}
              </Text>
            </View>
          ))}
          <Text style={styles.handoffHint}>They remain listed until they stand down or this alert is resolved.</Text>
        </Card>
      ) : null}

      {actionError ? <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text> : null}

      {!isResolved ? (
        <>
          <Button title="Call Emergency Services" icon="call" variant="danger" size="lg" onPress={() => Linking.openURL("tel:911")} />
          {myResponse?.status === "ON_THE_WAY" ? (
            <Button title="Mark Arrived" icon="location" variant="secondary" onPress={() => update("arrive")} loading={busy} />
          ) : null}
          {myResponse?.status === "ARRIVED" ? (
            <Button title="Resident Safe — Resolve Alert" icon="checkmark-circle" variant="success" onPress={() => update("resolve")} loading={busy} />
          ) : (
            <Text style={styles.handoffHint}>After you arrive and confirm the resident is safe, mark the alert resolved. The resident can mark safe at any time.</Text>
          )}
        </>
      ) : (
        <Button title="Back to Monitoring" icon="arrow-back" variant="primary" onPress={() => navigation.navigate("CaretakerHome")} />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md, backgroundColor: palette.safeSoft },
  bannerTxt: { fontSize: type.lg, fontWeight: type.weightBold, color: palette.safeDark },
  bannerSub: { fontSize: type.sm, color: palette.textMuted, marginTop: 2 },
  info: { alignItems: "center", paddingVertical: space.xl },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: palette.safeSoft, alignItems: "center", justifyContent: "center", marginBottom: space.md },
  name: { fontSize: type.xxl, fontWeight: type.weightBold, color: palette.text, textAlign: "center" },
  locRow: { flexDirection: "row", alignItems: "center", marginTop: space.sm, gap: space.xs },
  loc: { fontSize: type.md, color: palette.textMuted, textAlign: "center" },
  eventPill: { flexDirection: "row", alignItems: "center", gap: space.xs, backgroundColor: palette.dangerSoft, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs, marginTop: space.md },
  eventTxt: { color: palette.dangerDark, fontWeight: type.weightSemi, fontSize: type.sm },
  responders: { marginBottom: space.md },
  sectionTitle: { fontSize: type.md, fontWeight: type.weightBold, color: palette.text, marginBottom: space.sm },
  responderRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.xs },
  responderText: { flex: 1, fontSize: type.md, color: palette.text },
  handoffHint: { fontSize: type.sm, lineHeight: 20, color: palette.textMuted, marginTop: space.sm },
  error: { color: palette.dangerDark, fontSize: type.sm, textAlign: "center", marginVertical: space.sm },
});

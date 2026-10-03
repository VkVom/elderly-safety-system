import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Vibration, Animated, Easing, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import Button from "../../components/Button";
import { palette, type, space, radius, shadow, EVENT_META } from "../../theme";

export default function VolunteerDispatchModal({ navigation, route }) {
  const { user } = useAuth();
  const alert = route?.params?.alert || {};
  const meta = EVENT_META[alert.eventType] || { label: alert.eventType, color: palette.danger, icon: "alert-circle" };
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState(false); // another responder already accepted
  const flash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Vibration.vibrate([0, 500, 300, 500], true);
    Animated.loop(
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(flash, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    ).start();
    return () => Vibration.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = () => Vibration.cancel();

  // "I'm Coming" — claim it, but guard against a race (someone else already took it).
  const accept = async () => {
    stop();
    if (!isFirebaseConfigured || !alert.id || !user) { navigation.goBack(); return; }
    setBusy(true);
    try {
      const snap = await getDoc(doc(db, "alerts", alert.id));
      const cur = snap.exists() ? snap.data() : null;
      if (cur && cur.status === "ACKNOWLEDGED") {
        setTaken(true); setBusy(false); return;
      }
      await updateDoc(doc(db, "alerts", alert.id), {
        status: "ACKNOWLEDGED", acknowledgedBy: user.uid, respondedByRole: "volunteer",
      });
    } catch (e) {}
    setBusy(false);
    navigation.goBack();
  };

  const decline = () => { stop(); navigation.goBack(); };

  const headerBg = flash.interpolate({ inputRange: [0, 1], outputRange: [palette.danger, palette.dangerDark] });

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <Animated.View style={[styles.header, { backgroundColor: headerBg }]}>
        <Ionicons name="megaphone" size={38} color={palette.white} />
        <Text style={styles.headerText}>ESCALATED EMERGENCY</Text>
        <Text style={styles.headerSub}>Primary caretaker did not respond</Text>
      </Animated.View>

      <View style={styles.body}>
        <View style={styles.teleBox}>
          <Row icon="person" label="Resident" value={alert.elderName} />
          <Row icon="location" label="Location" value={alert.roomLocation} />
          <Row icon={meta.icon} label="Event" value={meta.label} />
          <Row icon="pulse" label="Fall Probability" value={`${Math.round((alert.fallProbability || 0) * 100)}%`} />
          <Row icon="time" label="Since" value={shortTime(alert.escalationTimerStart || alert.timestamp)} />
        </View>

        {taken ? (
          <View style={styles.takenBox}>
            <Ionicons name="checkmark-done-circle" size={28} color={palette.success} />
            <Text style={styles.takenTxt}>Another responder is already on the way.</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        {taken ? (
          <Button title="Close" variant="secondary" size="lg" onPress={() => navigation.goBack()} />
        ) : (
          <>
            <Button title="I'M COMING" icon="walk" variant="success" size="lg" onPress={accept} loading={busy} />
            <Button title="Call Emergency Services" icon="call" variant="danger" onPress={() => Linking.openURL("tel:911")} />
            <Button title="I Can't Respond" variant="ghost" onPress={decline} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
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
  headerText: { color: palette.white, fontSize: type.xl, fontWeight: type.weightBold, letterSpacing: 1, marginTop: space.xs },
  headerSub: { color: palette.white, fontSize: type.sm, marginTop: 2 },
  body: { flex: 1, padding: space.lg, justifyContent: "center" },
  teleBox: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md, ...shadow.card },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space.sm },
  rowLabel: { color: palette.textMuted, fontSize: type.sm, width: 130 },
  rowValue: { color: palette.text, fontSize: type.md, fontWeight: type.weightSemi, flex: 1, textAlign: "right" },
  takenBox: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: palette.safeSoft, borderRadius: radius.md, padding: space.md, marginTop: space.lg },
  takenTxt: { color: palette.safeDark, fontSize: type.md, fontWeight: type.weightMed, flex: 1 },
  actions: { padding: space.lg },
});

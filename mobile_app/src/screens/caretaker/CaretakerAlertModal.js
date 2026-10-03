import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Vibration, Animated, Easing } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { doc, updateDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import Button from "../../components/Button";
import { palette, type, space, radius, shadow, EVENT_META } from "../../theme";

const ESCALATION_SECONDS = 20;

export default function CaretakerAlertModal({ navigation, route }) {
  const { user } = useAuth();
  const alert = route?.params?.alert || {};
  const meta = EVENT_META[alert.eventType] || { label: alert.eventType, color: palette.danger, icon: "alert-circle" };
  const [count, setCount] = useState(ESCALATION_SECONDS);
  const doneRef = useRef(false);
  const flash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Vibration.vibrate([0, 600, 300, 600], true);
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
    return () => { clearInterval(id); Vibration.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = () => { doneRef.current = true; Vibration.cancel(); };

  const accept = async () => {
    if (doneRef.current) return;
    stop();
    if (isFirebaseConfigured && alert.id && user) {
      try { await updateDoc(doc(db, "alerts", alert.id), { status: "ACKNOWLEDGED", acknowledgedBy: user.uid }); } catch (e) {}
    }
    navigation.replace("ActiveResponse", { alert });
  };

  const escalate = async () => {
    if (doneRef.current) return;
    stop();
    if (isFirebaseConfigured && alert.id) {
      try { await updateDoc(doc(db, "alerts", alert.id), { escalatedToVolunteers: true }); } catch (e) {}
    }
    navigation.goBack();
  };

  const headerBg = flash.interpolate({ inputRange: [0, 1], outputRange: [palette.danger, palette.dangerDark] });

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <Animated.View style={[styles.header, { backgroundColor: headerBg }]}>
        <Ionicons name={meta.icon} size={40} color={palette.white} />
        <Text style={styles.headerText}>EMERGENCY</Text>
        <Text style={styles.headerSub}>{meta.label}</Text>
      </Animated.View>

      <View style={styles.body}>
        <View style={styles.teleBox}>
          <Row icon="person" label="Elder" value={alert.elderName} />
          <Row icon="location" label="Location" value={alert.roomLocation} />
          <Row icon="pulse" label="Fall Probability" value={`${Math.round((alert.fallProbability || 0) * 100)}%`} />
          <Row icon="body" label="Posture" value={alert.postureState} />
          <Row icon="cube" label="Context" value={alert.furnitureContext} />
        </View>

        <View style={styles.timerWrap}>
          <View style={styles.timerRing}>
            <Text style={styles.timerText}>{count}</Text>
          </View>
          <Text style={styles.timerLabel}>auto-escalates to volunteers</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button title="I'M COMING" icon="walk" variant="success" size="lg" onPress={accept} />
        <Button title="Find Someone Else" icon="people" variant="secondary" onPress={escalate} />
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
  timerWrap: { alignItems: "center", marginTop: space.xl },
  timerRing: {
    width: 110, height: 110, borderRadius: 55, borderWidth: 8, borderColor: palette.warn,
    alignItems: "center", justifyContent: "center", backgroundColor: palette.warnSoft,
  },
  timerText: { fontSize: 44, fontWeight: type.weightBold, color: palette.warn },
  timerLabel: { color: palette.textMuted, fontSize: type.sm, marginTop: space.sm },
  actions: { padding: space.lg },
});

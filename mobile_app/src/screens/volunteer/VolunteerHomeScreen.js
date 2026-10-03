import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import Card from "../../components/Card";
import { palette, type, space, radius, shadow, EVENT_META } from "../../theme";

export default function VolunteerHomeScreen({ navigation }) {
  const { logout } = useAuth();
  const [onDuty, setOnDuty] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const seenRef = useRef(new Set());

  useEffect(() => {
    if (!isFirebaseConfigured || !onDuty) { setAlerts([]); return; }
    // Single-field query (no composite index needed); filter status client-side.
    const q = query(
      collection(db, "alerts"),
      where("escalatedToVolunteers", "==", true)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.status === "CREATED") list.push({ id: d.id, ...data });
      });
      setAlerts(list);
      for (const a of list) {
        if (!seenRef.current.has(a.id)) {
          seenRef.current.add(a.id);
          navigation.navigate("VolunteerDispatch", { alert: a });
          break;
        }
      }
    });
    return unsub;
  }, [onDuty, navigation]);

  const renderItem = ({ item }) => {
    const meta = EVENT_META[item.eventType] || { label: item.eventType, color: palette.textMuted, icon: "alert" };
    return (
      <Pressable onPress={() => navigation.navigate("VolunteerDispatch", { alert: item })}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
        <View style={[styles.iconWrap, { backgroundColor: palette.dangerSoft }]}>
          <Ionicons name={meta.icon} size={22} color={meta.color} />
        </View>
        <View style={{ flex: 1, marginLeft: space.md }}>
          <Text style={styles.name}>{item.elderName}</Text>
          <Text style={styles.sub}>{meta.label} · {item.roomLocation}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={palette.textFaint} />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.topbar}>
        <Text style={styles.title}>Community Queue</Text>
        <Pressable onPress={logout} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="log-out-outline" size={24} color={palette.textMuted} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <Card tone={onDuty ? "safe" : "alt"} style={styles.dutyCard}>
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            <Ionicons name={onDuty ? "radio-button-on" : "radio-button-off"} size={24} color={onDuty ? palette.success : palette.textFaint} />
            <Text style={[styles.dutyLabel, { color: onDuty ? palette.safeDark : palette.textMuted }]}>
              {onDuty ? "Active — On Duty" : "Off Duty"}
            </Text>
          </View>
          <Switch value={onDuty} onValueChange={setOnDuty} trackColor={{ true: palette.safe }} />
        </Card>

        <Text style={styles.sectionLabel}>Escalated Emergencies</Text>
        <FlatList
          data={alerts}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={alerts.length === 0 && styles.emptyWrap}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name={onDuty ? "heart-outline" : "moon-outline"} size={48} color={palette.textFaint} />
              <Text style={styles.emptyTxt}>{onDuty ? "No escalated alerts" : "You're off duty"}</Text>
              <Text style={styles.emptyHint}>
                {onDuty ? "Thank you for standing by to help." : "Toggle on-duty to receive alerts."}
              </Text>
            </View>
          }
        />
        {!isFirebaseConfigured && <Text style={styles.warn}>Firebase not configured — live queue disabled.</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md },
  title: { fontSize: type.xxl, fontWeight: type.weightBold, color: palette.text },
  iconBtn: { padding: space.xs, backgroundColor: palette.surfaceAlt, borderRadius: radius.pill },
  body: { flex: 1, paddingHorizontal: space.lg },
  dutyCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dutyLabel: { fontSize: type.md, fontWeight: type.weightSemi, marginLeft: space.sm },
  sectionLabel: { fontSize: type.sm, color: palette.textMuted, fontWeight: type.weightMed, marginTop: space.md, marginBottom: space.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md, marginBottom: space.sm, ...shadow.card },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  name: { fontSize: type.md, fontWeight: type.weightSemi, color: palette.text },
  sub: { fontSize: type.sm, color: palette.textMuted, marginTop: 2 },
  emptyWrap: { flexGrow: 1, justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: space.xxl },
  emptyTxt: { fontSize: type.lg, fontWeight: type.weightSemi, color: palette.textMuted, marginTop: space.md },
  emptyHint: { fontSize: type.sm, color: palette.textFaint, marginTop: space.xs, textAlign: "center" },
  warn: { color: palette.warn, textAlign: "center", fontSize: type.xs, paddingVertical: space.sm },
});

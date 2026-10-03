import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import Card from "../../components/Card";
import { palette, type, space, radius, shadow, EVENT_META } from "../../theme";

export default function CaretakerHomeScreen({ navigation }) {
  const { profile, logout } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const seenRef = useRef(new Set());

  const elderId = profile?.assignedElderId;

  useEffect(() => {
    if (!isFirebaseConfigured || !elderId) return;
    // Single-field query on elderId (no composite index); filter status client-side.
    const q = query(collection(db, "alerts"), where("elderId", "==", elderId));
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
          navigation.navigate("CaretakerAlert", { alert: a });
          break;
        }
      }
    });
    return unsub;
  }, [navigation, elderId]);

  const hasAlerts = alerts.length > 0;

  const renderItem = ({ item }) => {
    const meta = EVENT_META[item.eventType] || { label: item.eventType, color: palette.textMuted, icon: "alert" };
    return (
      <Pressable onPress={() => navigation.navigate("CaretakerAlert", { alert: item })}
        style={({ pressed }) => [styles.alertCard, pressed && { opacity: 0.9 }]}>
        <View style={[styles.alertIcon, { backgroundColor: palette.dangerSoft }]}>
          <Ionicons name={meta.icon} size={24} color={meta.color} />
        </View>
        <View style={{ flex: 1, marginLeft: space.md }}>
          <Text style={styles.alertName}>{item.elderName}</Text>
          <Text style={styles.alertSub}>{meta.label} · {item.roomLocation}</Text>
        </View>
        <View style={styles.probPill}>
          <Text style={styles.probTxt}>{Math.round((item.fallProbability || 0) * 100)}%</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      {/* Top bar */}
      <View style={styles.topbar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Monitoring</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {profile?.assignedElderName ? `Watching ${profile.assignedElderName}` : "No resident linked"}
          </Text>
        </View>
        <Pressable onPress={() => navigation.navigate("AlertHistory")} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="time-outline" size={24} color={palette.textMuted} />
        </Pressable>
        <Pressable onPress={logout} hitSlop={8} style={[styles.iconBtn, { marginLeft: space.sm }]}>
          <Ionicons name="log-out-outline" size={24} color={palette.textMuted} />
        </Pressable>
      </View>

      {/* Overall status banner */}
      <View style={styles.body}>
        {/* Linked resident — tap for full details */}
        <Pressable
          onPress={() => navigation.navigate("ElderDetails")}
          accessibilityRole="button"
          style={({ pressed }) => [styles.elderCard, pressed && { opacity: 0.9 }]}
        >
          <View style={styles.elderAvatar}>
            <Ionicons name="person" size={24} color={palette.safeDark} />
          </View>
          <View style={{ flex: 1, marginLeft: space.md }}>
            <Text style={styles.elderLabel}>Watching over</Text>
            <Text style={styles.elderName} numberOfLines={1}>{profile?.assignedElderName || "—"}</Text>
          </View>
          {profile?.assignedElderRoom ? (
            <View style={styles.roomPill}>
              <Ionicons name="location" size={14} color={palette.safeDark} />
              <Text style={styles.roomTxt}>{profile.assignedElderRoom}</Text>
            </View>
          ) : null}
          <Ionicons name="chevron-forward" size={20} color={palette.textFaint} style={{ marginLeft: space.xs }} />
        </Pressable>

        <Card tone={hasAlerts ? "danger" : "safe"} style={styles.statusCard}>
          <Ionicons
            name={hasAlerts ? "warning" : "checkmark-circle"}
            size={30}
            color={hasAlerts ? palette.danger : palette.safeDark}
          />
          <Text style={[styles.statusText, { color: hasAlerts ? palette.dangerDark : palette.safeDark }]}>
            {hasAlerts ? `${alerts.length} active alert${alerts.length > 1 ? "s" : ""}` : "All clear · System nominal"}
          </Text>
        </Card>

        <Text style={styles.sectionLabel}>Active Alerts</Text>
        <FlatList
          data={alerts}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={alerts.length === 0 && styles.emptyWrap}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="shield-checkmark-outline" size={48} color={palette.textFaint} />
              <Text style={styles.emptyTxt}>No active alerts</Text>
              <Text style={styles.emptyHint}>You'll be notified the moment something happens.</Text>
            </View>
          }
        />

        {!isFirebaseConfigured && <Text style={styles.warn}>Firebase not configured — live alerts disabled.</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  topbar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md },
  title: { fontSize: type.xxl, fontWeight: type.weightBold, color: palette.text },
  subtitle: { fontSize: type.sm, color: palette.textMuted, marginTop: 2 },
  iconBtn: { padding: space.xs, backgroundColor: palette.surfaceAlt, borderRadius: radius.pill },
  body: { flex: 1, paddingHorizontal: space.lg },
  elderCard: { flexDirection: "row", alignItems: "center", backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md, marginVertical: space.sm, ...shadow.card },
  elderAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: palette.safeSoft, alignItems: "center", justifyContent: "center" },
  elderLabel: { fontSize: type.xs, color: palette.textMuted },
  elderName: { fontSize: type.lg, fontWeight: type.weightSemi, color: palette.text, marginTop: 1 },
  roomPill: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: palette.safeSoft, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: space.xs },
  roomTxt: { fontSize: type.xs, color: palette.safeDark, fontWeight: type.weightSemi },
  statusCard: { flexDirection: "row", alignItems: "center", gap: space.sm },
  statusText: { fontSize: type.md, fontWeight: type.weightSemi },
  sectionLabel: { fontSize: type.sm, color: palette.textMuted, fontWeight: type.weightMed, marginTop: space.md, marginBottom: space.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  alertCard: { flexDirection: "row", alignItems: "center", backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md, marginBottom: space.sm, ...shadow.card },
  alertIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  alertName: { fontSize: type.md, fontWeight: type.weightSemi, color: palette.text },
  alertSub: { fontSize: type.sm, color: palette.textMuted, marginTop: 2 },
  probPill: { backgroundColor: palette.dangerSoft, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs },
  probTxt: { color: palette.dangerDark, fontWeight: type.weightBold, fontSize: type.md },
  emptyWrap: { flexGrow: 1, justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: space.xxl },
  emptyTxt: { fontSize: type.lg, fontWeight: type.weightSemi, color: palette.textMuted, marginTop: space.md },
  emptyHint: { fontSize: type.sm, color: palette.textFaint, marginTop: space.xs, textAlign: "center" },
  warn: { color: palette.warn, textAlign: "center", fontSize: type.xs, paddingVertical: space.sm },
});

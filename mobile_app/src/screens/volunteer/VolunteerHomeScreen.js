import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import Card from "../../components/Card";
import { syncVolunteerDirectory } from "../../services/volunteerDirectory";
import { classifyVolunteerAlert, getVolunteerUpdateLabel } from "../../services/alertResponses";
import { palette, type, space, radius, shadow, EVENT_META } from "../../theme";

export default function VolunteerHomeScreen({ navigation }) {
  const { user, profile, logout } = useAuth();
  const [onDuty, setOnDuty] = useState(profile?.onDuty ?? true);
  const [alerts, setAlerts] = useState([]);
  const [myResponses, setMyResponses] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [dutyError, setDutyError] = useState("");
  const seenRef = useRef(new Set());

  useEffect(() => {
    setOnDuty(profile?.onDuty ?? true);
  }, [profile?.onDuty]);

  const changeDuty = async (nextValue) => {
    if (!user) return;
    const previous = onDuty;
    setOnDuty(nextValue);
    setDutyError("");
    try {
      await updateDoc(doc(db, "users", user.uid), {
        onDuty: nextValue,
        updatedAt: new Date().toISOString(),
      });
      await syncVolunteerDirectory(
        user,
        { ...(profile || {}), onDuty: nextValue },
        profile?.expoPushToken || profile?.pushToken
      );
    } catch (error) {
      setOnDuty(previous);
      setDutyError("We could not save your availability. Check your connection and try again.");
    }
  };

  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid) {
      setAlerts([]);
      setMyResponses([]);
      setUpdates([]);
      return;
    }
    const activeQuery = query(
      collection(db, "alerts"),
      where("escalatedToVolunteers", "==", true),
      where("status", "in", ["CREATED", "WARNING", "CONFIRMED"])
    );
    const updatesQuery = query(
      collection(db, "alerts"),
      where("escalatedToVolunteers", "==", true),
      orderBy("updatedAt", "desc"),
      limit(10)
    );
    let activeAlerts = [];
    let recentlyUpdatedAlerts = [];
    const publish = () => {
      const queue = [];
      const responding = [];
      const recent = [];
      const byId = new Map(recentlyUpdatedAlerts.map((item) => [item.id, item]));
      for (const item of activeAlerts) byId.set(item.id, item);
      for (const item of byId.values()) {
        const queueState = classifyVolunteerAlert(item, user.uid, onDuty);
        if (queueState === "responding") {
          responding.push({ ...item, queueState });
        } else if (queueState === "actionable") {
          queue.push({ ...item, queueState });
        } else if (
          (queueState === "handled" || queueState === "closed")
          && recentlyUpdatedAlerts.some((recentItem) => recentItem.id === item.id)
        ) {
          recent.push({ ...item, queueState });
        }
      }
      queue.sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
      responding.sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
      recent.sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
      setAlerts(queue);
      setMyResponses(responding);
      setUpdates(recent.slice(0, 10));
      for (const a of queue) {
        if (!seenRef.current.has(a.id)) {
          seenRef.current.add(a.id);
          navigation.navigate("VolunteerDispatch", { alert: a });
          break;
        }
      }
    };
    const onError = () => {
      setDutyError("We could not load alerts. Check your connection.");
    };
    const unsubActive = onSnapshot(activeQuery, (snap) => {
      activeAlerts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      publish();
    }, onError);
    const unsubUpdates = onSnapshot(updatesQuery, (snap) => {
      recentlyUpdatedAlerts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      publish();
    }, onError);
    return () => {
      unsubActive();
      unsubUpdates();
    };
  }, [onDuty, navigation, user?.uid]);

  const renderItem = ({ item }) => {
    const meta = EVENT_META[item.eventType] || { label: item.eventType, color: palette.textMuted, icon: "alert" };
    const iconColor = item.queueState === "actionable" ? palette.danger : palette.safeDark;
    const stateLabel = item.queueState === "responding"
      ? item.volunteerResponse?.status === "ARRIVED" ? "You have arrived" : "You are on the way"
      : item.queueState === "actionable"
        ? "Needs a volunteer"
        : getVolunteerUpdateLabel(item, user?.uid);
    return (
      <Pressable onPress={() => navigation.navigate("VolunteerDispatch", { alert: item })}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
        <View style={[styles.iconWrap, { backgroundColor: item.queueState === "actionable" ? palette.dangerSoft : palette.safeSoft }]}>
          <Ionicons name={item.queueState === "responding" ? "walk" : meta.icon} size={22} color={iconColor} />
        </View>
        <View style={{ flex: 1, marginLeft: space.md }}>
          <Text style={styles.name}>{item.elderName}</Text>
          <Text style={styles.sub}>{meta.label} · {item.roomLocation}</Text>
          <Text style={[styles.stateText, item.queueState === "actionable" && styles.actionableText]}>{stateLabel}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={palette.textFaint} />
      </Pressable>
    );
  };

  const listData = [
    ...myResponses.map((item) => ({ ...item, sectionTitle: "Your response" })),
    ...alerts.map((item) => ({ ...item, sectionTitle: "Escalated emergencies" })),
    ...updates.map((item) => ({ ...item, sectionTitle: "Recent updates" })),
  ];

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
          <Switch
            value={onDuty}
            onValueChange={changeDuty}
            trackColor={{ true: palette.safe }}
            accessibilityLabel="Volunteer on duty"
            accessibilityRole="switch"
          />
        </Card>
        {dutyError ? <Text accessibilityRole="alert" style={styles.warn}>{dutyError}</Text> : null}

        <FlatList
          data={listData}
          keyExtractor={(i) => i.id}
          renderItem={({ item, index }) => (
            <View>
              {(index === 0 || listData[index - 1].sectionTitle !== item.sectionTitle) ? (
                <Text style={styles.sectionLabel}>{item.sectionTitle}</Text>
              ) : null}
              {renderItem({ item })}
            </View>
          )}
          contentContainerStyle={listData.length === 0 && styles.emptyWrap}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name={onDuty ? "heart-outline" : "moon-outline"} size={48} color={palette.textFaint} />
              <Text style={styles.emptyTxt}>{onDuty ? "No escalated alerts" : "You're off duty"}</Text>
              <Text style={styles.emptyHint}>
                {onDuty ? "Thank you for standing by to help." : "Your accepted responses remain visible while you're off duty."}
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
  stateText: { fontSize: type.sm, color: palette.safeDark, fontWeight: type.weightMed, marginTop: space.xs },
  actionableText: { color: palette.dangerDark },
  emptyWrap: { flexGrow: 1, justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: space.xxl },
  emptyTxt: { fontSize: type.lg, fontWeight: type.weightSemi, color: palette.textMuted, marginTop: space.md },
  emptyHint: { fontSize: type.sm, color: palette.textFaint, marginTop: space.xs, textAlign: "center" },
  warn: { color: palette.warn, textAlign: "center", fontSize: type.xs, paddingVertical: space.sm },
});

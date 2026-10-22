import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, query, where, limit, onSnapshot } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { linkedElderIds } from "../../services/linking";
import ScreenContainer from "../../components/ScreenContainer";
import { palette, type, space, radius, shadow, EVENT_META } from "../../theme";

const STATUS_TONE = {
  CREATED: palette.danger,
  ACKNOWLEDGED: palette.warn,
  RESOLVED: palette.success,
  RESOLVED_FALSE_ALARM: palette.textMuted,
  CONFIRMED: palette.danger,
};

export default function AlertHistoryScreen() {
  const { user, profile } = useAuth();
  const [items, setItems] = useState([]);
  const elderIds = linkedElderIds(profile);
  const elderIdsKey = elderIds.join("|");
  const uid = profile?.uid || user?.uid;

  useEffect(() => {
    if (!isFirebaseConfigured || !uid) return;
    // Equality on assignedCaretakerId keeps the list query provable against the
    // alerts security rule; multi-elder filtering is client-side.
    const q = query(
      collection(db, "alerts"),
      where("assignedCaretakerId", "==", uid),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      const linked = new Set(elderIds);
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        if (linked.has(data.elderId)) list.push({ id: d.id, ...data });
      });
      list.sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
      setItems(list);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elderIdsKey, uid]);

  const renderItem = ({ item }) => {
    const meta = EVENT_META[item.eventType] || { label: item.eventType, color: palette.textMuted, icon: "alert" };
    const tone = STATUS_TONE[item.status] || palette.textMuted;
    return (
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: meta.color + "22" }]}>
          <Ionicons name={meta.icon} size={20} color={meta.color} />
        </View>
        <View style={{ flex: 1, marginLeft: space.md }}>
          <Text style={styles.name}>{item.elderName} · {meta.label}</Text>
          <Text style={styles.time}>{formatTime(item.timestamp)}</Text>
          {historySummary(item) ? <Text style={styles.summary}>{historySummary(item)}</Text> : null}
        </View>
        <View style={[styles.statusDot, { backgroundColor: tone }]} />
      </View>
    );
  };

  return (
    <ScreenContainer>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="file-tray-outline" size={44} color={palette.textFaint} />
            <Text style={styles.emptyTxt}>{isFirebaseConfigured ? "No past alerts" : "Firebase not configured"}</Text>
          </View>
        }
      />
    </ScreenContainer>
  );
}

function formatTime(ts) {
  if (!ts) return "";
  try { return new Date(ts).toLocaleString(); } catch (e) { return ts; }
}

function historySummary(alert) {
  const events = Array.isArray(alert.responseEvents) ? alert.responseEvents.slice(-3) : [];
  if (events.length) {
    return events.map((event) => {
      const action = {
        accept: "started responding",
        arrive: "arrived",
        stand_down: "stood down",
        resolve: "marked the resident safe",
        mark_safe: "confirmed they are safe",
      }[event.action] || "updated the response";
      return `${event.actorName || "Responder"} ${action} · ${formatTime(event.timestamp)}`;
    }).join("\n");
  }
  if (alert.resolvedByName) return `Closed by ${alert.resolvedByName}`;
  if (alert.volunteerResponse?.status === "ON_THE_WAY") {
    return `${alert.volunteerResponse.name || "A volunteer"} is on the way`;
  }
  if (alert.caretakerResponse?.status === "ON_THE_WAY") return "Caretaker is responding";
  return "";
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", backgroundColor: palette.surface, borderRadius: radius.md, padding: space.md, marginBottom: space.sm, ...shadow.card },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  name: { fontSize: type.md, fontWeight: type.weightSemi, color: palette.text },
  time: { fontSize: type.xs, color: palette.textMuted, marginTop: 2 },
  summary: { fontSize: type.sm, color: palette.safeDark, marginTop: space.xs, lineHeight: 20 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  empty: { alignItems: "center", paddingVertical: space.xxl },
  emptyTxt: { fontSize: type.md, color: palette.textMuted, marginTop: space.md },
});

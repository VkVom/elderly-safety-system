import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../../config/firebase";
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
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const q = query(collection(db, "alerts"), orderBy("timestamp", "desc"), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setItems(list);
    });
    return unsub;
  }, []);

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

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", backgroundColor: palette.surface, borderRadius: radius.md, padding: space.md, marginBottom: space.sm, ...shadow.card },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  name: { fontSize: type.md, fontWeight: type.weightSemi, color: palette.text },
  time: { fontSize: type.xs, color: palette.textMuted, marginTop: 2 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  empty: { alignItems: "center", paddingVertical: space.xxl },
  emptyTxt: { fontSize: type.md, color: palette.textMuted, marginTop: space.md },
});

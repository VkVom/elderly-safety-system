import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Linking, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { doc, getDoc, collection, query, where, onSnapshot } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { unlinkCaretaker } from "../../services/linking";
import ScreenContainer from "../../components/ScreenContainer";
import Card from "../../components/Card";
import Button from "../../components/Button";
import { palette, type, space, radius, EVENT_META } from "../../theme";

export default function ElderDetailsScreen({ navigation }) {
  const { profile, refreshProfile } = useAuth();
  const [elder, setElder] = useState(null);
  const [recentCount, setRecentCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const elderId = profile?.assignedElderId;

  useEffect(() => {
    if (!isFirebaseConfigured || !elderId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", elderId));
        if (snap.exists()) setElder(snap.data());
      } catch (e) {}
    })();
    // live count of active alerts for this elder
    const q = query(collection(db, "alerts"), where("elderId", "==", elderId));
    const unsub = onSnapshot(q, (snap) => {
      let n = 0;
      snap.forEach((d) => { if (d.data().status === "CREATED") n++; });
      setRecentCount(n);
    });
    return unsub;
  }, [elderId]);

  const unlink = () => {
    Alert.alert("Unlink resident?", "You will stop receiving their alerts.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unlink", style: "destructive",
        onPress: async () => {
          setBusy(true);
          try { await unlinkCaretaker(profile); await refreshProfile(); } catch (e) {}
          setBusy(false);
          navigation.goBack();
        },
      },
    ]);
  };

  const phone = elder?.emergencyContact;
  const statusTone = recentCount > 0 ? "danger" : "safe";

  return (
    <ScreenContainer scroll>
      <Card style={styles.hero}>
        <View style={styles.avatar}><Ionicons name="person" size={34} color={palette.safeDark} /></View>
        <Text style={styles.name}>{profile?.assignedElderName || elder?.name || "Resident"}</Text>
        {(profile?.assignedElderRoom || elder?.roomLocation) ? (
          <View style={styles.roomRow}>
            <Ionicons name="location" size={16} color={palette.textMuted} />
            <Text style={styles.room}>{profile?.assignedElderRoom || elder?.roomLocation}</Text>
          </View>
        ) : null}
      </Card>

      <Card tone={statusTone} style={styles.statusCard}>
        <Ionicons name={recentCount > 0 ? "warning" : "checkmark-circle"} size={26}
          color={recentCount > 0 ? palette.danger : palette.safeDark} />
        <Text style={[styles.statusTxt, { color: recentCount > 0 ? palette.dangerDark : palette.safeDark }]}>
          {recentCount > 0 ? `${recentCount} active alert${recentCount > 1 ? "s" : ""}` : "All clear right now"}
        </Text>
      </Card>

      <Text style={styles.section}>Details</Text>
      <Card>
        <DetailRow icon="call-outline" label="Emergency contact" value={phone || "Not set"} />
        <DetailRow icon="key-outline" label="Pairing code" value={elder?.pairingCode || "—"} />
        <DetailRow icon="finger-print-outline" label="Resident ID" value={elderId} mono />
      </Card>

      {phone ? (
        <Button title="Call Resident" icon="call" variant="primary" size="lg" onPress={() => Linking.openURL(`tel:${phone}`)} />
      ) : null}
      <Button title="View Alert History" icon="time-outline" variant="secondary" onPress={() => navigation.navigate("AlertHistory")} />
      <Button title="Unlink Resident" icon="unlink-outline" variant="ghost" onPress={unlink} loading={busy} />
    </ScreenContainer>
  );
}

function DetailRow({ icon, label, value, mono }) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={18} color={palette.textMuted} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, mono && styles.mono]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingVertical: space.xl, marginTop: space.sm },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: palette.safeSoft, alignItems: "center", justifyContent: "center", marginBottom: space.md },
  name: { fontSize: type.xxl, fontWeight: type.weightBold, color: palette.text },
  roomRow: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xs },
  room: { fontSize: type.md, color: palette.textMuted },
  statusCard: { flexDirection: "row", alignItems: "center", gap: space.sm },
  statusTxt: { fontSize: type.md, fontWeight: type.weightSemi },
  section: { fontSize: type.sm, color: palette.textMuted, fontWeight: type.weightMed, marginTop: space.md, marginBottom: space.xs, textTransform: "uppercase", letterSpacing: 0.5 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  detailLabel: { fontSize: type.sm, color: palette.textMuted, flex: 1 },
  detailValue: { fontSize: type.md, color: palette.text, fontWeight: type.weightSemi, maxWidth: "55%", textAlign: "right" },
  mono: { fontSize: type.xs, color: palette.textMuted },
});

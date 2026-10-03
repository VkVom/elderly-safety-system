import React, { useState } from "react";
import { View, Text, StyleSheet, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { doc, updateDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../../config/firebase";
import ScreenContainer from "../../components/ScreenContainer";
import Card from "../../components/Card";
import Button from "../../components/Button";
import { palette, type, space, radius } from "../../theme";
import { EVENT_META } from "../../theme";

export default function ActiveResponseScreen({ navigation, route }) {
  const alert = route?.params?.alert || {};
  const meta = EVENT_META[alert.eventType] || { label: alert.eventType, icon: "alert-circle" };
  const [busy, setBusy] = useState(false);

  const resolve = async () => {
    setBusy(true);
    if (isFirebaseConfigured && alert.id) {
      try { await updateDoc(doc(db, "alerts", alert.id), { status: "RESOLVED" }); } catch (e) {}
    }
    setBusy(false);
    navigation.navigate("CaretakerHome");
  };

  return (
    <ScreenContainer scroll>
      <Card tone="safe" style={styles.banner}>
        <Ionicons name="walk" size={28} color={palette.safeDark} />
        <Text style={styles.bannerTxt}>You're responding</Text>
      </Card>

      <Card style={styles.info}>
        <View style={styles.avatar}><Ionicons name="person" size={30} color={palette.safeDark} /></View>
        <Text style={styles.name}>{alert.elderName}</Text>
        <View style={styles.locRow}>
          <Ionicons name="location" size={18} color={palette.textMuted} />
          <Text style={styles.loc}>{alert.roomLocation}</Text>
        </View>
        <View style={styles.eventPill}>
          <Ionicons name={meta.icon} size={16} color={palette.dangerDark} />
          <Text style={styles.eventTxt}>{meta.label}</Text>
        </View>
      </Card>

      <Button title="Call Emergency Services" icon="call" variant="danger" size="lg" onPress={() => Linking.openURL("tel:911")} />
      <Button title="Mark Safe / Resolve" icon="checkmark-circle" variant="success" onPress={resolve} loading={busy} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
  bannerTxt: { fontSize: type.lg, fontWeight: type.weightBold, color: palette.safeDark },
  info: { alignItems: "center", paddingVertical: space.xl },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: palette.safeSoft, alignItems: "center", justifyContent: "center", marginBottom: space.md },
  name: { fontSize: type.xxl, fontWeight: type.weightBold, color: palette.text },
  locRow: { flexDirection: "row", alignItems: "center", marginTop: space.sm, gap: space.xs },
  loc: { fontSize: type.md, color: palette.textMuted },
  eventPill: { flexDirection: "row", alignItems: "center", gap: space.xs, backgroundColor: palette.dangerSoft, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs, marginTop: space.md },
  eventTxt: { color: palette.dangerDark, fontWeight: type.weightSemi, fontSize: type.sm },
});

import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { doc, updateDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../../config/firebase";
import ScreenContainer from "../../components/ScreenContainer";
import { palette, type, space, radius, shadow, touch } from "../../theme";

/**
 * Shown when the backend detects a fall. Calm, reassuring, two large choices.
 * Expects route param { alertId }.
 */
export default function CancelAlertScreen({ navigation, route }) {
  const alertId = route?.params?.alertId;
  const [busy, setBusy] = useState(null);

  const setStatus = async (status, which) => {
    setBusy(which);
    if (isFirebaseConfigured && alertId) {
      try {
        await updateDoc(doc(db, "alerts", alertId), { status });
      } catch (e) {}
    }
    setBusy(null);
    navigation.goBack();
  };

  return (
    <ScreenContainer center>
      <View style={styles.iconWrap}>
        <Ionicons name="help-buoy" size={72} color={palette.warn} />
      </View>
      <Text style={styles.title}>Are you okay?</Text>
      <Text style={styles.sub}>We noticed something. Let us know how you are.</Text>

      <Pressable
        onPress={() => setStatus("RESOLVED_FALSE_ALARM", "ok")}
        accessibilityRole="button"
        accessibilityLabel="I am okay, cancel the alert"
        style={({ pressed }) => [styles.btn, styles.okBtn, pressed && { opacity: 0.9 }]}
      >
        <Ionicons name="checkmark-circle" size={34} color={palette.white} />
        <Text style={styles.btnTxt}>I'm OK</Text>
      </Pressable>

      <Pressable
        onPress={() => setStatus("CONFIRMED", "help")}
        accessibilityRole="button"
        accessibilityLabel="I need help"
        style={({ pressed }) => [styles.btn, styles.helpBtn, pressed && { opacity: 0.9 }]}
      >
        <Ionicons name="alert-circle" size={34} color={palette.white} />
        <Text style={styles.btnTxt}>I Need Help</Text>
      </Pressable>

      <Text style={styles.footer}>If you do nothing, your caretaker will be alerted.</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  iconWrap: { alignItems: "center", marginBottom: space.md },
  title: { fontSize: type.xxl, fontWeight: type.weightBold, color: palette.text, textAlign: "center" },
  sub: { fontSize: type.md, color: palette.textMuted, textAlign: "center", marginTop: space.sm, marginBottom: space.xl },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: radius.xl, minHeight: 88, marginVertical: space.sm, ...shadow.card,
  },
  okBtn: { backgroundColor: palette.success },
  helpBtn: { backgroundColor: palette.danger },
  btnTxt: { color: palette.white, fontSize: type.xl, fontWeight: type.weightBold, marginLeft: space.sm },
  footer: { fontSize: type.sm, color: palette.textFaint, textAlign: "center", marginTop: space.lg },
});

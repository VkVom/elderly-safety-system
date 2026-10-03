import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated, Easing, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { palette, type, space, radius, shadow } from "../../theme";

export default function ElderHomeScreen({ navigation }) {
  const { profile, logout } = useAuth();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const firstName = profile?.name ? profile.name.split(" ")[0] : "there";
  const caretakerName = profile?.caretakerName;
  const caretakerPhone = profile?.caretakerPhone || profile?.emergencyContact;
  const isLinked = Boolean(profile?.caretakerId);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      {/* Top bar: greeting + sign out */}
      <View style={styles.topbar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello} numberOfLines={1}>Hello, {firstName}</Text>
          <Text style={styles.tagline}>You are protected</Text>
        </View>
        <Pressable
          onPress={logout}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          hitSlop={10}
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="log-out-outline" size={20} color={palette.textMuted} />
          <Text style={styles.logoutTxt}>Sign Out</Text>
        </Pressable>
      </View>

      {/* Body fills the rest of the screen with no scrolling */}
      <View style={styles.body}>
        {/* Compact status row */}
        <View style={styles.statusRow}>
          <Animated.View style={[styles.shield, { transform: [{ scale }] }]}>
            <Ionicons name="shield-checkmark" size={34} color={palette.white} />
          </Animated.View>
          <View style={{ flex: 1, marginLeft: space.md }}>
            <Text style={styles.statusTitle}>Safety System Active</Text>
            <Text style={styles.statusSub}>We are keeping watch. Rest easy.</Text>
          </View>
        </View>

        {/* Giant SOS — flexes to fill remaining space, always visible */}
        <Pressable
          onPress={() => navigation.navigate("SOS")}
          accessibilityRole="button"
          accessibilityLabel="Send SOS for help"
          style={({ pressed }) => [styles.sos, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
        >
          <Ionicons name="hand-left" size={64} color={palette.white} />
          <Text style={styles.sosText}>SOS</Text>
          <Text style={styles.sosSub}>Tap here if you need help</Text>
        </Pressable>

        {/* Caretaker card: linked -> call; not linked -> show pairing code to share */}
        {isLinked ? (
          <Pressable
            onPress={() => caretakerPhone && Linking.openURL(`tel:${caretakerPhone}`)}
            accessibilityRole="button"
            accessibilityLabel="Call your caretaker"
            style={({ pressed }) => [styles.callCard, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
          >
            <View style={styles.callTop}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={26} color={palette.safeDark} />
              </View>
              <View style={{ flex: 1, marginLeft: space.md }}>
                <Text style={styles.careLabel}>Your Caretaker</Text>
                <Text style={styles.careName} numberOfLines={1}>{caretakerName || "Caretaker"}</Text>
              </View>
            </View>
            <View style={styles.callAction}>
              <Ionicons name="call" size={26} color={palette.white} />
              <Text style={styles.callTxt}>Call Caretaker</Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.linkCard}>
            <Ionicons name="key" size={28} color={palette.safeDark} />
            <Text style={styles.linkLabel}>Share this code with your caretaker</Text>
            <Text style={styles.linkCode}>{profile?.pairingCode || "…"}</Text>
            <Text style={styles.linkHint}>They enter it in their app to connect with you.</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },

  topbar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md,
  },
  hello: { fontSize: type.xl, fontWeight: type.weightBold, color: palette.text },
  tagline: { fontSize: type.sm, color: palette.safeDark, fontWeight: type.weightMed, marginTop: 2 },
  logoutBtn: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: palette.surfaceAlt, borderRadius: radius.pill,
    paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  logoutTxt: { color: palette.textMuted, fontSize: type.sm, fontWeight: type.weightMed, marginLeft: space.xs },

  body: { flex: 1, paddingHorizontal: space.lg, paddingBottom: space.lg },

  statusRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: palette.safeSoft, borderRadius: radius.lg, padding: space.md,
  },
  shield: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: palette.safe,
    alignItems: "center", justifyContent: "center",
  },
  statusTitle: { fontSize: type.md, fontWeight: type.weightBold, color: palette.safeDark },
  statusSub: { fontSize: type.sm, color: palette.textMuted, marginTop: 2 },

  sos: {
    flex: 3,                       // dominant, but shares space with the call card
    backgroundColor: palette.danger,
    borderRadius: radius.xl,
    alignItems: "center", justifyContent: "center",
    marginVertical: space.md,
    ...shadow.floating,
  },
  sosText: { color: palette.white, fontSize: 60, fontWeight: type.weightBold, letterSpacing: 2, marginTop: space.sm },
  sosSub: { color: palette.white, fontSize: type.lg, fontWeight: type.weightMed, marginTop: space.xs },

  callCard: {
    flex: 2,                       // meaningful presence, ~2/3 the height of SOS
    backgroundColor: palette.surface, borderRadius: radius.xl,
    padding: space.lg, justifyContent: "space-between", ...shadow.card,
  },
  callTop: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: palette.safeSoft, alignItems: "center", justifyContent: "center" },
  careLabel: { fontSize: type.sm, color: palette.textMuted },
  careName: { fontSize: type.lg, fontWeight: type.weightSemi, color: palette.text, marginTop: 2 },
  callAction: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: palette.safe, borderRadius: radius.lg, paddingVertical: space.md,
  },
  callTxt: { color: palette.white, fontSize: type.lg, fontWeight: type.weightSemi, marginLeft: space.sm },

  linkCard: {
    flex: 2, backgroundColor: palette.safeSoft, borderRadius: radius.xl,
    padding: space.lg, alignItems: "center", justifyContent: "center",
  },
  linkLabel: { fontSize: type.sm, color: palette.textMuted, marginTop: space.sm },
  linkCode: { fontSize: type.xxl, fontWeight: type.weightBold, color: palette.safeDark, letterSpacing: 4, marginVertical: space.xs },
  linkHint: { fontSize: type.xs, color: palette.textMuted, textAlign: "center" },
});

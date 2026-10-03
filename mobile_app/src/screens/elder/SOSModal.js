import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Animated, Easing, Vibration } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, addDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import ScreenContainer from "../../components/ScreenContainer";
import { palette, type, space, radius, shadow, touch } from "../../theme";

const COUNTDOWN = 5;

export default function SOSModal({ navigation }) {
  const { user, profile } = useAuth();
  const [count, setCount] = useState(COUNTDOWN);
  const firedRef = useRef(false);
  const ring = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Vibration.vibrate(400);
    const id = setInterval(() => {
      setCount((c) => {
        Animated.timing(ring, { toValue: 0, duration: 950, easing: Easing.linear, useNativeDriver: true }).start(() =>
          ring.setValue(1)
        );
        if (c <= 1) {
          clearInterval(id);
          fireSos();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fireSos = async () => {
    if (firedRef.current) return;
    firedRef.current = true;
    Vibration.vibrate([0, 300, 150, 300]);
    if (isFirebaseConfigured && user) {
      try {
        await addDoc(collection(db, "alerts"), {
          elderId: user.uid,
          elderName: profile?.name || "Elder",
          roomLocation: profile?.roomLocation || "Unknown",
          eventType: "MANUAL_SOS",
          status: "CREATED",
          fallProbability: 1.0,
          postureState: "UNKNOWN",
          furnitureContext: "manual",
          assignedCaretakerId: profile?.caretakerId || null,
          acknowledgedBy: null,
          escalatedToVolunteers: false,
          escalationTimerStart: new Date().toISOString(),
          timestamp: new Date().toISOString(),
        });
      } catch (e) {}
    }
    navigation.goBack();
  };

  const scale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  return (
    <ScreenContainer center>
      <View style={styles.wrap}>
        <Text style={styles.header}>Getting help for you</Text>
        <Text style={styles.sub}>Your caretaker will be alerted in</Text>

        <Animated.View style={[styles.ring, { transform: [{ scale }] }]}>
          <Text style={styles.count}>{count}</Text>
        </Animated.View>

        <Text style={styles.reassure}>Stay calm. Help is on the way.</Text>

        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Cancel SOS, I am okay"
          style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.9 }]}
        >
          <Ionicons name="close-circle" size={30} color={palette.white} />
          <Text style={styles.cancelTxt}>I'm OK — Cancel</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  header: { fontSize: type.xxl, fontWeight: type.weightBold, color: palette.text, textAlign: "center" },
  sub: { fontSize: type.md, color: palette.textMuted, marginTop: space.sm, textAlign: "center" },
  ring: {
    width: 200, height: 200, borderRadius: 100, borderWidth: 10, borderColor: palette.danger,
    alignItems: "center", justifyContent: "center", marginVertical: space.xl, backgroundColor: palette.dangerSoft,
  },
  count: { fontSize: 96, fontWeight: type.weightBold, color: palette.danger },
  reassure: { fontSize: type.lg, color: palette.text, textAlign: "center", marginBottom: space.xl },
  cancel: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: palette.success, borderRadius: radius.xl, minHeight: touch.elder,
    paddingHorizontal: space.xl, width: "100%", ...shadow.card,
  },
  cancelTxt: { color: palette.white, fontSize: type.xl, fontWeight: type.weightBold, marginLeft: space.sm },
});

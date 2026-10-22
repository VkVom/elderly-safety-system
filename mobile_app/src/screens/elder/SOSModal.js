import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Animated, Easing, Vibration, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { sendEmergencyPush } from "../../services/alertPush";
import ScreenContainer from "../../components/ScreenContainer";
import { palette, type, space, radius, shadow, touch } from "../../theme";

const COUNTDOWN = 5;

export default function SOSModal({ navigation }) {
  const { user, profile } = useAuth();
  const [count, setCount] = useState(COUNTDOWN);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
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
    if (firedRef.current || sending) return;
    firedRef.current = true;
    setSending(true);
    setError("");
    Vibration.vibrate([0, 300, 150, 300]);
    if (!isFirebaseConfigured || !user?.uid) {
      setError("The safety service is unavailable. Please call your caretaker.");
      setSending(false);
      firedRef.current = false;
      return;
    }

    let existing;
    try {
      existing = await getDocs(query(
        collection(db, "alerts"),
        where("elderId", "==", user.uid),
        where("status", "in", ["CREATED", "WARNING", "CONFIRMED"])
      ));
    } catch (requestError) {
      console.error("Unable to check for an existing active alert.", requestError?.message || requestError);
      setError("We could not check whether another alert is active. Please try again or call your caretaker.");
      setSending(false);
      firedRef.current = false;
      return;
    }

    if (!existing.empty) {
      const snapshot = existing.docs[0];
      navigation.replace("CancelAlert", {
        alertId: snapshot.id,
        alert: { id: snapshot.id, ...snapshot.data() },
      });
      return;
    }

    const now = new Date().toISOString();
    const elderPhone = profile?.phone || profile?.emergencyContact || null;
    let ref;
    try {
      ref = await addDoc(collection(db, "alerts"), {
        elderId: user.uid,
        elderName: profile?.name || "Elder",
        roomLocation: profile?.roomLocation || "Unknown",
        eventType: "MANUAL_SOS",
        status: "CREATED",
        tier: 2,
        fallProbability: 1.0,
        postureState: "UNKNOWN",
        furnitureContext: "manual",
        assignedCaretakerId: profile?.caretakerId || null,
        elderPhone,
        acknowledgedBy: null,
        escalatedToVolunteers: false,
        escalationTimerStart: now,
        timestamp: now,
      });
    } catch (requestError) {
      console.error("Unable to create the SOS alert.", requestError?.message || requestError);
      setError("We could not send your SOS. Check your connection and try again or call your caretaker.");
      setSending(false);
      firedRef.current = false;
      return;
    }

    const pushAccepted = await sendEmergencyPush({
      token: profile?.caretakerPushToken,
      alertId: ref.id,
      elderId: user.uid,
      elderName: profile?.name || "Elder",
      roomLocation: profile?.roomLocation || "Unknown",
      eventType: "MANUAL_SOS",
      tier: 2,
      elderPhone,
      assignedCaretakerId: profile?.caretakerId || null,
    });
    if (!pushAccepted) {
      Alert.alert(
        "SOS is active",
        "Your alert is saved, but we could not confirm a caretaker push notification. Keep the app open and call your caretaker if you can.",
        [{ text: "Continue", onPress: () => navigation.goBack() }]
      );
      return;
    }
    navigation.goBack();
  };

  const scale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  return (
    <ScreenContainer center>
      <View style={styles.wrap}>
        <Text style={styles.header}>Getting help for you</Text>
        <Text style={styles.sub}>
          {sending ? "Sending your alert to your caretaker…" : "Your caretaker will be alerted in"}
        </Text>

        <Animated.View style={[styles.ring, { transform: [{ scale }] }]}>
          <Text style={styles.count}>{count}</Text>
        </Animated.View>

        <Text accessibilityRole={error ? "alert" : undefined} style={error ? styles.error : styles.reassure}>
          {error || "Stay calm. Help is on the way."}
        </Text>

        <Pressable
          onPress={() => (error ? fireSos() : navigation.goBack())}
          accessibilityRole="button"
          accessibilityLabel={error ? "Retry sending SOS" : "Cancel SOS, I am okay"}
          disabled={sending}
          style={({ pressed }) => [styles.cancel, error && styles.retry, pressed && { opacity: 0.9 }, sending && { opacity: 0.6 }]}
        >
          <Ionicons name={error ? "refresh" : "close-circle"} size={30} color={palette.white} />
          <Text style={styles.cancelTxt}>{error ? "Try Again" : "I'm OK — Cancel"}</Text>
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
  retry: { backgroundColor: palette.danger },
  error: { fontSize: type.md, color: palette.danger, textAlign: "center", marginBottom: space.xl },
});

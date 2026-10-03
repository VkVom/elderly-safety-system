import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "../../config/firebase";
import { generatePairingCode } from "../../services/linking";
import ScreenContainer from "../../components/ScreenContainer";
import TextField from "../../components/TextField";
import Button from "../../components/Button";
import { palette, type, space, radius } from "../../theme";

const ROLES = [
  { key: "elder", label: "Older Adult", icon: "person" },
  { key: "caretaker", label: "Caretaker", icon: "medkit" },
  { key: "volunteer", label: "Volunteer", icon: "people" },
];

export default function SignupScreen({ navigation }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("elder");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const onRegister = async () => {
    setError(null);
    if (!isFirebaseConfigured) {
      setError("Firebase is not configured yet.");
      return;
    }
    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid, name, email: email.trim(), phone, role,
        assignedElderId: null, pushToken: null, createdAt: new Date().toISOString(),
        // Elders get a pairing code so caretakers can link to them.
        ...(role === "elder" ? { pairingCode: generatePairingCode() } : {}),
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer scroll>
      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>Join the safety network</Text>

      <TextField label="Full Name" icon="person-outline" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
      <TextField label="Email" icon="mail-outline" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
      <TextField label="Phone Number" icon="call-outline" value={phone} onChangeText={setPhone} placeholder="+1..." keyboardType="phone-pad" />
      <TextField label="Password" icon="lock-closed-outline" value={password} onChangeText={setPassword} placeholder="Choose a password" secureTextEntry />

      <Text style={styles.roleHeading}>I am a...</Text>
      <View style={styles.roleRow}>
        {ROLES.map((r) => {
          const active = role === r.key;
          return (
            <Pressable
              key={r.key}
              onPress={() => setRole(r.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.roleCard, active && styles.roleCardActive]}
            >
              <Ionicons name={r.icon} size={26} color={active ? palette.white : palette.safeDark} />
              <Text style={[styles.roleText, active && styles.roleTextActive]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={18} color={palette.danger} />
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}

      <Button title="Register Account" icon="checkmark-circle-outline" onPress={onRegister} loading={busy} size="lg" />
      <Button title="Back to Sign In" variant="ghost" onPress={() => navigation.goBack()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: type.xxl, fontWeight: type.weightBold, color: palette.text, marginTop: space.sm },
  subtitle: { fontSize: type.md, color: palette.textMuted, marginBottom: space.md },
  roleHeading: { fontSize: type.md, fontWeight: type.weightSemi, color: palette.text, marginTop: space.md, marginBottom: space.sm },
  roleRow: { flexDirection: "row", gap: space.sm },
  roleCard: {
    flex: 1, alignItems: "center", justifyContent: "center",
    backgroundColor: palette.surface, borderWidth: 1.5, borderColor: palette.border,
    borderRadius: radius.md, paddingVertical: space.md,
  },
  roleCardActive: { backgroundColor: palette.safe, borderColor: palette.safe },
  roleText: { fontSize: type.sm, color: palette.textMuted, marginTop: space.xs, fontWeight: type.weightMed },
  roleTextActive: { color: palette.white, fontWeight: type.weightSemi },
  errorRow: { flexDirection: "row", alignItems: "center", marginVertical: space.sm },
  error: { color: palette.danger, marginLeft: space.xs, fontSize: type.sm, flex: 1 },
});

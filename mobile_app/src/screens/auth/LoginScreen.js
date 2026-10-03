import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, isFirebaseConfigured } from "../../config/firebase";
import ScreenContainer from "../../components/ScreenContainer";
import TextField from "../../components/TextField";
import Button from "../../components/Button";
import { palette, type, space } from "../../theme";

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const onSignIn = async () => {
    setError(null);
    if (!isFirebaseConfigured) {
      setError("Firebase is not configured yet.");
      return;
    }
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      setError(friendly(e.code) || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer scroll center>
      <View style={styles.brandWrap}>
        <View style={styles.logo}>
          <Ionicons name="shield-checkmark" size={44} color={palette.white} />
        </View>
        <Text style={styles.brand}>INSIGHT-Fall</Text>
        <Text style={styles.sub}>Elder Safety System</Text>
      </View>

      <TextField label="Email" icon="mail-outline" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
      <TextField label="Password" icon="lock-closed-outline" value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry />

      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={18} color={palette.danger} />
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}

      <Button title="Sign In" icon="log-in-outline" onPress={onSignIn} loading={busy} size="lg" />
      <Button title="Create New Account" variant="secondary" onPress={() => navigation.navigate("Signup")} />
    </ScreenContainer>
  );
}

function friendly(code) {
  const map = {
    "auth/invalid-email": "That email doesn't look right.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/user-not-found": "No account found with that email.",
    "auth/too-many-requests": "Too many attempts. Try again shortly.",
  };
  return map[code];
}

const styles = StyleSheet.create({
  brandWrap: { alignItems: "center", marginBottom: space.xl },
  logo: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: palette.safe,
    alignItems: "center", justifyContent: "center", marginBottom: space.md,
  },
  brand: { fontSize: type.xxl, fontWeight: type.weightBold, color: palette.text },
  sub: { fontSize: type.md, color: palette.textMuted, marginTop: space.xs },
  errorRow: { flexDirection: "row", alignItems: "center", marginVertical: space.sm },
  error: { color: palette.danger, marginLeft: space.xs, fontSize: type.sm, flex: 1 },
});

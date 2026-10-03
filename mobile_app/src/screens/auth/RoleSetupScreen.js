import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { doc, updateDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { findElderByCode, linkCaretakerByCode, ensureElderPairingCode } from "../../services/linking";
import ScreenContainer from "../../components/ScreenContainer";
import Card from "../../components/Card";
import TextField from "../../components/TextField";
import Button from "../../components/Button";
import { palette, type, space, radius } from "../../theme";

export default function RoleSetupScreen() {
  const { user, role, profile, logout, refreshProfile } = useAuth();
  if (role === "elder") return <ElderSetup user={user} profile={profile} logout={logout} refreshProfile={refreshProfile} />;
  if (role === "caretaker") return <CaretakerSetup user={user} profile={profile} logout={logout} refreshProfile={refreshProfile} />;
  if (role === "volunteer") return <VolunteerSetup logout={logout} />;
  // No role resolved (unexpected / orphan) — do NOT silently show volunteer.
  return <UnknownSetup logout={logout} />;
}

function UnknownSetup({ logout }) {
  return (
    <ScreenContainer center>
      <View style={styles.headerWrap}>
        <View style={styles.headerIcon}><Ionicons name="help-circle" size={34} color={palette.white} /></View>
        <Text style={styles.title}>Account needs setup</Text>
        <Text style={styles.subtitle}>We couldn't find your profile. Please sign out and sign up again to choose your role.</Text>
      </View>
      <Button title="Sign Out" icon="log-out-outline" variant="primary" size="lg" onPress={logout} />
    </ScreenContainer>
  );
}

/* ─── ELDER: show & share pairing code, capture room + emergency contact ─── */
function ElderSetup({ user, profile, logout, refreshProfile }) {
  const [room, setRoom] = useState(profile?.roomLocation || "");
  const [contact, setContact] = useState(profile?.emergencyContact || "");
  const [code, setCode] = useState(profile?.pairingCode || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  React.useEffect(() => {
    // Guarantee a code exists (older accounts may predate code generation).
    (async () => {
      if (!code && isFirebaseConfigured && user) {
        try { setCode(await ensureElderPairingCode(user.uid, profile?.pairingCode)); } catch (e) {}
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const share = async () => {
    if (!code) return;
    try {
      await Share.share({ message: `Please link to my safety monitor. My pairing code is ${code}` });
    } catch (e) {}
  };

  const save = async () => {
    setError(null);
    if (!isFirebaseConfigured || !user) { setError("Not signed in / Firebase not configured."); return; }
    setBusy(true);
    try {
      await updateDoc(doc(db, "users", user.uid), { roomLocation: room, emergencyContact: contact });
      await refreshProfile();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <ScreenContainer scroll>
      <View style={styles.headerWrap}>
        <View style={styles.headerIcon}><Ionicons name="key" size={34} color={palette.white} /></View>
        <Text style={styles.title}>Your Pairing Code</Text>
        <Text style={styles.subtitle}>Share this with your caretaker so they can watch over you.</Text>
      </View>

      <Card tone="safe" style={styles.codeCard}>
        <Text style={styles.codeLabel}>PAIRING CODE</Text>
        <Text style={styles.codeValue}>{code || "…"}</Text>
        <Button title="Share Code" icon="share-social" onPress={share} />
      </Card>

      <Text style={styles.sectionLabel}>Your details</Text>
      <TextField label="Room Number" icon="bed-outline" value={room} onChangeText={setRoom} placeholder="e.g. Room 204" autoCapitalize="words" />
      <TextField label="Emergency Contact" icon="call-outline" value={contact} onChangeText={setContact} placeholder="+1..." keyboardType="phone-pad" />

      {error ? <ErrorRow msg={error} /> : null}
      <Button title="Save & Continue" icon="checkmark-circle-outline" onPress={save} loading={busy} size="lg" />
      <Button title="Sign Out" variant="ghost" onPress={logout} />
    </ScreenContainer>
  );
}

/* ─── CARETAKER: enter code → confirm elder → link ─── */
function CaretakerSetup({ user, profile, logout, refreshProfile }) {
  const [codeInput, setCodeInput] = useState("");
  const [found, setFound] = useState(null);       // elder preview after lookup
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const lookup = async () => {
    setError(null); setFound(null);
    if (!isFirebaseConfigured) { setError("Firebase not configured."); return; }
    setBusy(true);
    try {
      const elder = await findElderByCode(codeInput);
      if (!elder) setError("No resident found for that code. Please check and try again.");
      else setFound(elder);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const confirmLink = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await linkCaretakerByCode(
        { uid: user.uid, name: profile?.name, phone: profile?.phone },
        codeInput
      );
      if (!res.ok) setError(res.error);
      else await refreshProfile();  // AppNavigator will route to the dashboard
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <ScreenContainer scroll>
      <View style={styles.headerWrap}>
        <View style={styles.headerIcon}><Ionicons name="link" size={34} color={palette.white} /></View>
        <Text style={styles.title}>Link a Resident</Text>
        <Text style={styles.subtitle}>Enter the pairing code from the person you care for.</Text>
      </View>

      <TextField label="Pairing Code" icon="keypad-outline" value={codeInput} onChangeText={setCodeInput} placeholder="SAFE-XXXX" autoCapitalize="characters" />

      {!found ? (
        <Button title="Find Resident" icon="search" onPress={lookup} loading={busy} size="lg" />
      ) : (
        <Card tone="safe" style={styles.confirmCard}>
          <View style={styles.avatar}><Ionicons name="person" size={28} color={palette.safeDark} /></View>
          <Text style={styles.confirmName}>{found.name || "Resident"}</Text>
          {found.roomLocation ? <Text style={styles.confirmRoom}>{found.roomLocation}</Text> : null}
          <Button title="Confirm & Link" icon="checkmark-circle" variant="success" onPress={confirmLink} loading={busy} />
          <Button title="Not them — try another code" variant="ghost" onPress={() => setFound(null)} />
        </Card>
      )}

      {error ? <ErrorRow msg={error} /> : null}
      <Button title="Sign Out" variant="ghost" onPress={logout} />
    </ScreenContainer>
  );
}

/* ─── VOLUNTEER: no linking, community-wide ─── */
function VolunteerSetup({ logout }) {
  return (
    <ScreenContainer scroll>
      <View style={styles.headerWrap}>
        <View style={styles.headerIcon}><Ionicons name="people" size={34} color={palette.white} /></View>
        <Text style={styles.title}>Community Responder</Text>
        <Text style={styles.subtitle}>You'll receive escalated emergencies when caretakers are unavailable. Toggle on-duty from your home screen.</Text>
      </View>
      <Card tone="safe" style={{ alignItems: "center" }}>
        <Ionicons name="heart" size={40} color={palette.safeDark} />
        <Text style={styles.volNote}>Thank you for helping keep the community safe.</Text>
      </Card>
      <Button title="Sign Out" variant="ghost" onPress={logout} />
    </ScreenContainer>
  );
}

function ErrorRow({ msg }) {
  return (
    <View style={styles.errorRow}>
      <Ionicons name="alert-circle" size={18} color={palette.danger} />
      <Text style={styles.error}>{msg}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: { alignItems: "center", marginTop: space.md, marginBottom: space.lg },
  headerIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: palette.safe, alignItems: "center", justifyContent: "center", marginBottom: space.md },
  title: { fontSize: type.xxl, fontWeight: type.weightBold, color: palette.text, textAlign: "center" },
  subtitle: { fontSize: type.md, color: palette.textMuted, textAlign: "center", marginTop: space.xs, paddingHorizontal: space.md },

  codeCard: { alignItems: "center", paddingVertical: space.xl },
  codeLabel: { fontSize: type.xs, color: palette.textMuted, letterSpacing: 1, fontWeight: type.weightSemi },
  codeValue: { fontSize: 44, fontWeight: type.weightBold, color: palette.safeDark, letterSpacing: 4, marginVertical: space.md },

  sectionLabel: { fontSize: type.sm, color: palette.textMuted, fontWeight: type.weightMed, marginTop: space.md, marginBottom: space.xs, textTransform: "uppercase", letterSpacing: 0.5 },

  confirmCard: { alignItems: "center", paddingVertical: space.lg },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: palette.safeSoft, alignItems: "center", justifyContent: "center", marginBottom: space.sm },
  confirmName: { fontSize: type.xl, fontWeight: type.weightBold, color: palette.text },
  confirmRoom: { fontSize: type.md, color: palette.textMuted, marginBottom: space.md },

  volNote: { fontSize: type.md, color: palette.safeDark, textAlign: "center", marginTop: space.sm, fontWeight: type.weightMed },

  errorRow: { flexDirection: "row", alignItems: "center", marginVertical: space.sm },
  error: { color: palette.danger, marginLeft: space.xs, fontSize: type.sm, flex: 1 },
});

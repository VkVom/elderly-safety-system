import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { doc, getDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import {
  linkedElderIds, findElderByCode, linkCaretakerByCode, unlinkCaretaker,
} from "../../services/linking";
import ScreenContainer from "../../components/ScreenContainer";
import Card from "../../components/Card";
import TextField from "../../components/TextField";
import Button from "../../components/Button";
import { palette, type, space, radius, shadow } from "../../theme";

/**
 * Multi-elder management: list every resident this caretaker watches, add another
 * by pairing code, or unlink one. Elder side stays single-caretaker (re-link replaces).
 */
export default function ManageResidentsScreen({ navigation }) {
  const { user, profile, refreshProfile } = useAuth();
  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [codeInput, setCodeInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const elderIdsKey = linkedElderIds(profile).join("|");

  const load = useCallback(async () => {
    if (!isFirebaseConfigured) { setLoading(false); return; }
    setLoading(true);
    const ids = elderIdsKey ? elderIdsKey.split("|") : [];
    const list = [];
    for (const id of ids) {
      try {
        const snap = await getDoc(doc(db, "users", id));
        if (snap.exists()) list.push({ id, ...snap.data() });
        else list.push({ id, name: "(missing profile)", roomLocation: null });
      } catch (e) {
        list.push({ id, name: "(unreadable)", roomLocation: null });
      }
    }
    setResidents(list);
    setLoading(false);
  }, [elderIdsKey]);

  useEffect(() => { load(); }, [load]);

  const addResident = async () => {
    setError(null); setNotice(null);
    const code = codeInput.trim();
    if (!code) { setError("Enter the resident's pairing code first."); return; }
    if (!isFirebaseConfigured || !user) { setError("Not signed in / Firebase not configured."); return; }
    setBusy(true);
    try {
      // Preview + link in one shot: linkCaretakerByCode resolves the code itself.
      const found = await findElderByCode(code);
      if (!found) { setError("No resident found for that code. Check and try again."); return; }
      const res = await linkCaretakerByCode(
        {
          uid: user.uid,
          name: profile?.name,
          phone: profile?.phone,
          pushToken: profile?.expoPushToken || profile?.pushToken || null,
        },
        code
      );
      if (!res.ok) { setError(res.error); return; }
      setNotice(res.alreadyLinked
        ? `${found.name || "Resident"} is already linked.`
        : `Linked ${found.name || "Resident"}${found.roomLocation ? ` (${found.roomLocation})` : ""}.`);
      setCodeInput("");
      await refreshProfile();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeResident = (resident) => {
    Alert.alert(
      "Unlink resident?",
      `You will stop receiving alerts for ${resident.name || "this resident"}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unlink", style: "destructive",
          onPress: async () => {
            setError(null); setNotice(null);
            try {
              await unlinkCaretaker(profile, resident.id);
              await refreshProfile();
              await load();
              setNotice(`Unlinked ${resident.name || "resident"}.`);
            } catch (e) {
              setError(e.message);
            }
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer scroll>
      <Text style={styles.sectionLabel}>Your residents</Text>

      {loading ? (
        <ActivityIndicator color={palette.safeDark} style={{ marginVertical: space.lg }} />
      ) : residents.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="people-outline" size={34} color={palette.textFaint} />
          <Text style={styles.emptyTxt}>No residents linked yet.</Text>
          <Text style={styles.emptyHint}>Add one below with their pairing code.</Text>
        </Card>
      ) : (
        residents.map((r) => (
          <Card key={r.id} style={styles.residentCard}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={22} color={palette.safeDark} />
            </View>
            <View style={{ flex: 1, marginLeft: space.md }}>
              <Text style={styles.name} numberOfLines={1}>{r.name || "Resident"}</Text>
              {r.roomLocation ? <Text style={styles.room}>{r.roomLocation}</Text> : null}
            </View>
            <Pressable
              onPress={() => navigation.navigate("ElderDetails", { elderId: r.id })}
              hitSlop={8}
              style={styles.rowBtn}
            >
              <Ionicons name="chevron-forward" size={20} color={palette.textFaint} />
            </Pressable>
            <Pressable onPress={() => removeResident(r)} hitSlop={8} style={styles.rowBtn}>
              <Ionicons name="unlink-outline" size={20} color={palette.danger} />
            </Pressable>
          </Card>
        ))
      )}

      <Text style={styles.sectionLabel}>Add another resident</Text>
      <TextField
        label="Pairing Code"
        icon="keypad-outline"
        value={codeInput}
        onChangeText={setCodeInput}
        placeholder="SAFE-XXXX"
        autoCapitalize="characters"
      />
      <Button title="Link Resident" icon="link" onPress={addResident} loading={busy} size="lg" />

      {notice ? (
        <View style={styles.noticeRow}>
          <Ionicons name="checkmark-circle" size={18} color={palette.safeDark} />
          <Text style={styles.notice}>{notice}</Text>
        </View>
      ) : null}
      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={18} color={palette.danger} />
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: type.sm, color: palette.textMuted, fontWeight: type.weightMed, marginTop: space.md, marginBottom: space.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  residentCard: { flexDirection: "row", alignItems: "center", marginBottom: space.sm, ...shadow.card },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.safeSoft, alignItems: "center", justifyContent: "center" },
  name: { fontSize: type.md, fontWeight: type.weightSemi, color: palette.text },
  room: { fontSize: type.sm, color: palette.textMuted, marginTop: 2 },
  rowBtn: { padding: space.xs, marginLeft: space.xs },
  emptyCard: { alignItems: "center", paddingVertical: space.xl },
  emptyTxt: { fontSize: type.md, fontWeight: type.weightSemi, color: palette.textMuted, marginTop: space.sm },
  emptyHint: { fontSize: type.sm, color: palette.textFaint, marginTop: space.xs },
  noticeRow: { flexDirection: "row", alignItems: "center", marginVertical: space.sm },
  notice: { color: palette.safeDark, marginLeft: space.xs, fontSize: type.sm, flex: 1 },
  errorRow: { flexDirection: "row", alignItems: "center", marginVertical: space.sm },
  error: { color: palette.danger, marginLeft: space.xs, fontSize: type.sm, flex: 1 },
});

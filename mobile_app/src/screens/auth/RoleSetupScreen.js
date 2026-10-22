import React, { useMemo, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { doc, updateDoc } from "firebase/firestore";
import { getLocales } from "expo-localization";
import { db, isFirebaseConfigured } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { ensureElderPairingCode, linkCaretakerByCode, linkedElderIds } from "../../services/linking";
import { friendlyAuthError, normalizePhone, validatePhone, validateRoom } from "../../services/authFlow";
import {
  Heading,
  PrimaryButton,
  ProgressHeader,
  Screen,
  SecondaryButton,
  StepCard,
  TextField,
  UpSupportMark,
} from "../../components/auth/WithyuComponents";
import { palette } from "../../theme";

export default function RoleSetupScreen() {
  const { user, role, profile, logout, refreshProfile, setSetupFailure } = useAuth();
  const regionCode = getLocales()?.[0]?.regionCode;

  if (role === "elder") {
    return (
      <ElderSetup
        user={user}
        profile={profile}
        logout={logout}
        refreshProfile={refreshProfile}
        setSetupFailure={setSetupFailure}
        regionCode={regionCode}
      />
    );
  }
  if (role === "caretaker") {
    return (
      <CaretakerSetup
        user={user}
        profile={profile}
        logout={logout}
        refreshProfile={refreshProfile}
        setSetupFailure={setSetupFailure}
        regionCode={regionCode}
      />
    );
  }
  if (role === "volunteer") {
    return (
      <VolunteerSetup
        user={user}
        profile={profile}
        logout={logout}
        refreshProfile={refreshProfile}
        setSetupFailure={setSetupFailure}
        regionCode={regionCode}
      />
    );
  }
  return <UnknownSetup logout={logout} />;
}

function UnknownSetup({ logout }) {
  return (
    <Screen contentStyle={styles.centered}>
      <UpSupportMark size={56} />
      <Heading
        title="Account needs setup"
        description="We could not find your profile. Sign out and create your account again."
      />
      <PrimaryButton title="Sign out" onPress={logout} />
    </Screen>
  );
}

function ElderSetup({ user, profile, logout, refreshProfile, setSetupFailure, regionCode }) {
  const [room, setRoom] = useState(profile?.roomLocation || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [emergencyContact, setEmergencyContact] = useState(profile?.emergencyContact || "");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pairing = profile?.onboardingStep === "pairing";

  const saveDetails = async () => {
    const nextErrors = {
      room: validateRoom(room),
      phone: validatePhone(phone, regionCode, false),
      emergencyContact: validatePhone(emergencyContact, regionCode, false),
    };
    setErrors(Object.fromEntries(Object.entries(nextErrors).filter(([, value]) => value)));
    setMessage("");
    if (Object.values(nextErrors).some(Boolean)) return;
    if (!isFirebaseConfigured || !user) {
      setErrors({ form: "You appear to be offline. Sign in again when you are connected." });
      return;
    }
    setBusy(true);
    try {
      const pairingCode = await ensureElderPairingCode(user.uid, profile?.pairingCode);
      await updateDoc(doc(db, "users", user.uid), {
        roomLocation: room.trim(),
        phone: normalizePhone(phone, regionCode),
        emergencyContact: normalizePhone(emergencyContact, regionCode),
        pairingCode,
        setupComplete: false,
        onboardingStep: "pairing",
        updatedAt: new Date().toISOString(),
      });
      await refreshProfile();
    } catch (error) {
      await failSetup(setSetupFailure, error);
      setErrors({ form: friendlyAuthError(error.code) });
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setErrors({});
    try {
      await updateDoc(doc(db, "users", user.uid), {
        setupComplete: true,
        onboardingStep: null,
        updatedAt: new Date().toISOString(),
      });
      await refreshProfile();
    } catch (error) {
      await failSetup(setSetupFailure, error);
      setErrors({ form: friendlyAuthError(error.code) });
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    setMessage("");
    try {
      await Share.share({ message: `Please link to me on UpSupport. My pairing code is ${profile?.pairingCode}.` });
    } catch (error) {
      setMessage("We could not open sharing. You can copy the code instead.");
    }
  };

  const copy = async () => {
    setMessage("");
    try {
      await Clipboard.setStringAsync(profile?.pairingCode || "");
      setMessage("Pairing code copied.");
    } catch (error) {
      setMessage("We could not copy the code. Please share it instead.");
    }
  };

  if (pairing) {
    return (
      <Screen contentStyle={styles.centered}>
        <ProgressHeader step={3} onBack={logout} />
        <UpSupportMark size={54} />
        <Heading title="Welcome to UpSupport" description="Share this code with the person who looks after you, so they can link to you." />
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Your pairing code</Text>
          <Text selectable style={styles.code}>{profile?.pairingCode || "…"}</Text>
          <Text style={styles.codeHint}>Generated just for you</Text>
        </View>
        <PrimaryButton title="Share code" icon="share-social-outline" onPress={share} />
        <SecondaryButton title="Copy code" icon="copy-outline" onPress={copy} />
        {message ? <InlineNotice message={message} /> : null}
        {errors.form ? <InlineError message={errors.form} /> : null}
        <PrimaryButton title="Go to my home" onPress={finish} loading={busy} />
        <SecondaryButton title="Share later" onPress={finish} loading={busy} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ProgressHeader step={3} onBack={logout} />
      <Heading title="About your home" description="So help knows exactly where to come." />
      <TextField
        label="Room or location"
        value={room}
        onChangeText={setRoom}
        placeholder="e.g. Bedroom, Flat 2B"
        autoCapitalize="words"
        autoComplete="off"
        error={errors.room}
      />
      <TextField
        label="Your phone (optional)"
        value={phone}
        onChangeText={setPhone}
        placeholder="+1 555 000 0000"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        error={errors.phone}
      />
      <TextField
        label="Emergency contact phone"
        value={emergencyContact}
        onChangeText={setEmergencyContact}
        placeholder="+1 555 000 0000"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        hint="We call this person if you cannot answer."
        error={errors.emergencyContact}
      />
      {errors.form ? <InlineError message={errors.form} /> : null}
      <PrimaryButton title="Finish setup" onPress={saveDetails} loading={busy} />
    </Screen>
  );
}

function CaretakerSetup({ user, profile, logout, refreshProfile, setSetupFailure, regionCode }) {
  const initialView = profile?.onboardingStep === "linked" ? "linked" : "link";
  const [view, setView] = useState(initialView);
  const [phone, setPhone] = useState(profile?.phone || "");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const elderCount = useMemo(() => linkedElderIds(profile).length, [profile]);

  const persistPhone = async () => {
    const phoneError = validatePhone(phone, regionCode, true);
    if (phoneError) {
      setErrors({ phone: phoneError });
      return null;
    }
    const normalized = normalizePhone(phone, regionCode);
    await updateDoc(doc(db, "users", user.uid), {
      phone: normalized,
      updatedAt: new Date().toISOString(),
    });
    return normalized;
  };

  const link = async () => {
    setErrors({});
    if (!/^SAFE-[A-Z2-9]{4}$/i.test(code.trim())) {
      setErrors({ code: "Enter the SAFE-XXXX code shared by the older adult." });
      return;
    }
    if (!isFirebaseConfigured || !user) {
      setErrors({ form: "You appear to be offline. Check your connection and try again." });
      return;
    }
    setBusy(true);
    try {
      const normalizedPhone = await persistPhone();
      if (!normalizedPhone) return;
      const result = await linkCaretakerByCode(
        {
          uid: user.uid,
          name: profile?.name,
          phone: normalizedPhone,
          pushToken: profile?.expoPushToken || profile?.pushToken || null,
        },
        code.trim()
      );
      if (!result.ok) {
        setErrors({ code: result.error });
        return;
      }
      await updateDoc(doc(db, "users", user.uid), {
        setupComplete: false,
        onboardingStep: "linked",
        updatedAt: new Date().toISOString(),
      });
      await refreshProfile();
      setView("linked");
      setCode("");
    } catch (error) {
      await failSetup(setSetupFailure, error);
      setErrors({ form: friendlyAuthError(error.code) });
    } finally {
      setBusy(false);
    }
  };

  const linkLater = async () => {
    setErrors({});
    setBusy(true);
    try {
      const normalizedPhone = await persistPhone();
      if (!normalizedPhone) return;
      await updateDoc(doc(db, "users", user.uid), {
        setupComplete: true,
        onboardingStep: null,
        updatedAt: new Date().toISOString(),
      });
      await refreshProfile();
    } catch (error) {
      await failSetup(setSetupFailure, error);
      setErrors({ form: friendlyAuthError(error.code) });
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setErrors({});
    try {
      await updateDoc(doc(db, "users", user.uid), {
        setupComplete: true,
        onboardingStep: null,
        updatedAt: new Date().toISOString(),
      });
      await refreshProfile();
    } catch (error) {
      await failSetup(setSetupFailure, error);
      setErrors({ form: friendlyAuthError(error.code) });
    } finally {
      setBusy(false);
    }
  };

  if (view === "linked") {
    return (
      <Screen contentStyle={styles.centered} onBack={() => setView("link")}>
        <UpSupportMark size={54} />
        <Heading title="You are now linked" description="You will get an alert if they fall or press SOS." />
        <StepCard icon="notifications-outline" title="Alerts reach you first" description="Then volunteers if you miss it." />
        <StepCard icon="location-outline" title="See where they are" description="Room and event type show at once." />
        {errors.form ? <InlineError message={errors.form} /> : null}
        <PrimaryButton title="Go to dashboard" onPress={finish} loading={busy} />
        <SecondaryButton title="Link another person" onPress={() => setView("link")} disabled={busy} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ProgressHeader step={3} onBack={logout} />
      <Heading
        title={elderCount ? "Link another person" : "Link your first person"}
        description="Ask them for their pairing code. It is on their phone."
      />
      <TextField
        label="Your phone"
        value={phone}
        onChangeText={setPhone}
        placeholder="+1 555 000 0000"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        hint="Shown to the person you care for."
        error={errors.phone}
      />
      <TextField
        label="Pairing code"
        value={code}
        onChangeText={setCode}
        placeholder="SAFE-0000"
        autoCapitalize="characters"
        autoComplete="off"
        error={errors.code}
      />
      {errors.form ? <InlineError message={errors.form} /> : null}
      <PrimaryButton title="Link and continue" onPress={link} loading={busy} />
      {!elderCount ? <SecondaryButton title="I will link later" onPress={linkLater} loading={busy} /> : null}
    </Screen>
  );
}

function VolunteerSetup({ user, profile, logout, refreshProfile, setSetupFailure, regionCode }) {
  const [phone, setPhone] = useState(profile?.phone || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(profile?.onboardingStep === "howItWorks" ? "how" : "phone");

  const savePhone = async () => {
    const phoneError = validatePhone(phone, regionCode, true);
    if (phoneError) {
      setError(phoneError);
      return;
    }
    setError("");
    setBusy(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        phone: normalizePhone(phone, regionCode),
        onDuty: profile?.onDuty ?? true,
        setupComplete: false,
        onboardingStep: "howItWorks",
        updatedAt: new Date().toISOString(),
      });
      await refreshProfile();
      setView("how");
    } catch (nextError) {
      await failSetup(setSetupFailure, nextError);
      setError(friendlyAuthError(nextError.code));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setError("");
    try {
      await updateDoc(doc(db, "users", user.uid), {
        setupComplete: true,
        onboardingStep: null,
        updatedAt: new Date().toISOString(),
      });
      await refreshProfile();
    } catch (nextError) {
      await failSetup(setSetupFailure, nextError);
      setError(friendlyAuthError(nextError.code));
    } finally {
      setBusy(false);
    }
  };

  if (view === "how") {
    return (
      <Screen contentStyle={styles.centered} onBack={() => setView("phone")}>
        <UpSupportMark size={54} />
        <Heading title="Here is how UpSupport works" description="You only help when you choose to." />
        <StepCard icon="heart-outline" title="A neighbour needs help" description="When their caretaker cannot respond." />
        <StepCard icon="notifications-outline" title="You get an alert" description="With the room and what happened." />
        <StepCard icon="hand-right-outline" title="Tap to respond" description="Go when you are free and able." />
        {error ? <InlineError message={error} /> : null}
        <PrimaryButton title="Go to home" onPress={finish} loading={busy} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ProgressHeader step={3} onBack={logout} />
      <Heading title="How can we reach you?" description="Your number lets neighbours in need get in touch quickly." />
      <TextField
        label="Your phone"
        value={phone}
        onChangeText={setPhone}
        placeholder="+1 555 000 0000"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        hint="Only shared when you accept an alert."
        error={error}
      />
      <PrimaryButton title="Continue" onPress={savePhone} loading={busy} />
    </Screen>
  );
}

async function failSetup(setSetupFailure, error) {
  await setSetupFailure({ stage: "roleSetup", code: error?.code || null });
}

function InlineError({ message }) {
  return (
    <View accessibilityRole="alert" style={styles.errorRow}>
      <Ionicons name="alert-circle-outline" size={19} color={palette.danger} />
      <Text style={styles.error}>{message}</Text>
    </View>
  );
}

function InlineNotice({ message }) {
  return (
    <View accessibilityRole="alert" style={styles.noticeRow}>
      <Ionicons name="checkmark-circle-outline" size={19} color={palette.safeDark} />
      <Text style={styles.notice}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: "center" },
  codeCard: { width: "100%", backgroundColor: palette.surface, borderRadius: 22, padding: 22, alignItems: "center", marginVertical: 12 },
  codeLabel: { color: palette.textMuted, fontFamily: "NunitoSans_600SemiBold", fontSize: 14 },
  code: { color: palette.safeDark, fontFamily: "Fraunces_700Bold", fontSize: 34, letterSpacing: 2, marginVertical: 8 },
  codeHint: { color: palette.textMuted, fontFamily: "NunitoSans_400Regular", fontSize: 13 },
  errorRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, padding: 12, backgroundColor: "#FCE9E7", marginTop: 10 },
  error: { flex: 1, color: palette.danger, fontFamily: "NunitoSans_600SemiBold", fontSize: 14, lineHeight: 20 },
  noticeRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, padding: 12, backgroundColor: palette.safeSoft, marginTop: 10 },
  notice: { flex: 1, color: palette.safeDark, fontFamily: "NunitoSans_600SemiBold", fontSize: 14 },
});

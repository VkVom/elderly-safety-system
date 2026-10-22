import Constants from "expo-constants";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { findElderByCode } from "./linking";
import { generateUniquePairingCode } from "./pairingCodes";
import { resolveProfileName } from "./authFlow";

export function googleAuthClientIds() {
  const cfg = Constants?.expoConfig?.extra?.googleAuth || {};
  return {
    webClientId: cfg.webClientId || undefined,
    androidClientId: cfg.androidClientId || undefined,
    iosClientId: cfg.iosClientId || undefined,
  };
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export async function createProfileForUser(user, { name, phone = "", role, authProvider }) {
  if (!user || !role) throw new Error("Missing account role.");
  const displayName = resolveProfileName(name, user);
  const email = user.email || "";
  const now = new Date().toISOString();

  const profileRef = doc(db, "users", user.uid);
  const existing = await getDoc(profileRef);
  if (existing.exists()) return existing.data();
  const pairingCode = role === "elder"
    ? await generateUniquePairingCode(async (candidate) =>
      !(await findElderByCode(candidate))
    )
    : null;

  const profile = {
    uid: user.uid,
    name: displayName,
    email,
    phone: phone || "",
    role,
    authProvider: authProvider || (user.providerData?.some((provider) => provider.providerId === "password")
      ? "password"
      : "google"),
    setupComplete: false,
    onDuty: role === "volunteer",
    onboardingStep: "details",
    assignedElderId: null,
    assignedElderIds: [],
    expoPushToken: null,
    pushToken: null,
    createdAt: now,
    updatedAt: now,
    verificationSentAt: null,
    ...(pairingCode ? { pairingCode } : {}),
  };
  await setDoc(profileRef, profile);
  return profile;
}

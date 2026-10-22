import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth, db, isFirebaseConfigured } from "../config/firebase";
import { registerPushTokenForUser } from "../services/notifications";
import { removeVolunteerDirectory } from "../services/volunteerDirectory";

const AuthContext = createContext(null);
const AUTH_DRAFT_KEY = "withyu.authDraft";
const SETUP_FAILURE_KEY = "withyu.setupFailure";

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Tracks the Firebase auth session and the user's profile from Firestore.
 * The profile is kept LIVE via onSnapshot, so link changes (e.g. a caretaker
 * pairing to an elder) reflect immediately on both sides.
 *
 * `profileLoaded` becomes true once the profile snapshot has fired at least once for
 * the current user — this lets the UI distinguish "still loading" from "no profile
 * exists" (an orphan auth account), so it never wrongly shows a fallback screen.
 *
 * Exposes: { user, profile, role, loading, profileLoaded, configured, logout, refreshProfile }.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [authSetupInProgress, setAuthSetupInProgress] = useState(false);
  const [authDraft, setAuthDraft] = useState(null);
  const [authFlowLoaded, setAuthFlowLoaded] = useState(false);
  const [googleConflict, setGoogleConflict] = useState(null);
  const [googleSignupRetry, setGoogleSignupRetry] = useState(false);
  const [setupFailure, setSetupFailureState] = useState(null);
  const profileUnsubRef = useRef(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(AUTH_DRAFT_KEY),
      AsyncStorage.getItem(SETUP_FAILURE_KEY),
    ]).then(([draftValue, failureValue]) => {
      if (!active) return;
      setAuthDraft(draftValue ? JSON.parse(draftValue) : null);
      setSetupFailureState(failureValue ? JSON.parse(failureValue) : null);
      setAuthFlowLoaded(true);
    }).catch((error) => {
      console.error("Unable to restore account setup state.", error);
      if (active) setAuthFlowLoaded(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser);
      setProfileLoaded(false);
      if (profileUnsubRef.current) {
        profileUnsubRef.current();
        profileUnsubRef.current = null;
      }
      if (fbUser) {
        profileUnsubRef.current = onSnapshot(
          doc(db, "users", fbUser.uid),
          (snap) => {
            setProfile(snap.exists() ? snap.data() : null);
            setProfileLoaded(true);   // snapshot fired (doc may or may not exist)
            setLoading(false);
          },
          () => {
            setProfile(null);
            setProfileLoaded(true);   // error -> treat as resolved (no profile)
            setLoading(false);
          }
        );
      } else {
        setProfile(null);
        setProfileLoaded(false);
        setLoading(false);
      }
    });
    return () => {
      unsub();
      if (profileUnsubRef.current) profileUnsubRef.current();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!isFirebaseConfigured || !auth.currentUser) return;
    const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
    setProfile(snap.exists() ? snap.data() : null);
    setProfileLoaded(true);
    return snap.exists() ? snap.data() : null;
  }, []);

  const refreshUser = useCallback(async () => {
    if (!auth.currentUser) return null;
    await auth.currentUser.reload();
    const refreshedUser = auth.currentUser;
    setUser(refreshedUser);
    return refreshedUser;
  }, []);

  const saveAuthDraft = useCallback(async (draft) => {
    const safeDraft = {
      role: draft?.role || "elder",
      stage: draft?.stage || "role",
      name: draft?.name || "",
      email: draft?.email || "",
    };
    await AsyncStorage.setItem(AUTH_DRAFT_KEY, JSON.stringify(safeDraft));
    setAuthDraft(safeDraft);
  }, []);

  const clearAuthDraft = useCallback(async () => {
    await AsyncStorage.removeItem(AUTH_DRAFT_KEY);
    setAuthDraft(null);
  }, []);

  const setSetupFailure = useCallback(async (failure) => {
    await AsyncStorage.setItem(SETUP_FAILURE_KEY, JSON.stringify(failure));
    setSetupFailureState(failure);
  }, []);

  const clearSetupFailure = useCallback(async () => {
    await AsyncStorage.removeItem(SETUP_FAILURE_KEY);
    setSetupFailureState(null);
  }, []);

  useEffect(() => {
    if (!user || !profile) return;
    if (!["elder", "caretaker", "volunteer"].includes(profile.role)) return;
    registerPushTokenForUser(user, profile).catch((e) => {
      console.warn("Background push registration failed:", e);
    });
  }, [user, profile?.role]);

  const logout = useCallback(async () => {
    if (profileUnsubRef.current) {
      profileUnsubRef.current();
      profileUnsubRef.current = null;
    }
    if (profile?.role === "volunteer") await removeVolunteerDirectory(profile.uid);
    if (isFirebaseConfigured) await signOut(auth);
    setUser(null);
    setProfile(null);
    setProfileLoaded(false);
  }, [profile?.role, profile?.uid]);

  const clearGoogleConflict = useCallback(() => setGoogleConflict(null), []);

  const value = {
    user,
    profile,
    role: profile?.role ?? null,
    loading,
    profileLoaded,
    authSetupInProgress,
    setAuthSetupInProgress,
    authDraft,
    authFlowLoaded,
    googleConflict,
    googleSignupRetry,
    setupFailure,
    configured: isFirebaseConfigured,
    logout,
    refreshProfile,
    refreshUser,
    saveAuthDraft,
    clearAuthDraft,
    setGoogleConflict,
    clearGoogleConflict,
    setGoogleSignupRetry,
    setSetupFailure,
    clearSetupFailure,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

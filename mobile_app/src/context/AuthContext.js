import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "../config/firebase";

const AuthContext = createContext(null);

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
  const profileUnsubRef = useRef(null);

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

  const refreshProfile = async () => {
    if (!isFirebaseConfigured || !auth.currentUser) return;
    try {
      const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
      setProfile(snap.exists() ? snap.data() : null);
      setProfileLoaded(true);
    } catch (e) {}
  };

  const logout = async () => {
    if (profileUnsubRef.current) {
      profileUnsubRef.current();
      profileUnsubRef.current = null;
    }
    if (isFirebaseConfigured) await signOut(auth);
    setUser(null);
    setProfile(null);
    setProfileLoaded(false);
  };

  const value = {
    user,
    profile,
    role: profile?.role ?? null,
    loading,
    profileLoaded,
    configured: isFirebaseConfigured,
    logout,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

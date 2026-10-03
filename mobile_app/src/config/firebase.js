// Firebase configuration for the INSIGHT-Fall mobile app.
//
// NOTE: Analytics (getAnalytics) is intentionally NOT used - it is web-only and
// throws in React Native. Auth uses in-memory persistence by default; that is fine
// for development (you re-login after a full app restart).

import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getAuth, getReactNativePersistence } from "firebase/auth";
import { initializeFirestore, getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyAxa3zYIl5XHMnnxGJyeB0z0Yh1gcSqJGs",
  authDomain: "insight-fall-safety.firebaseapp.com",
  projectId: "insight-fall-safety",
  storageBucket: "insight-fall-safety.firebasestorage.app",
  messagingSenderId: "542353623576",
  appId: "1:542353623576:web:207dc95e1a599e8a50916d",
  measurementId: "G-63HL83KVZC",
};

// True once real (non-placeholder) values are present. We check the API key is a
// plausible Firebase key rather than comparing to the real value (which a find/replace
// would break). A real key starts with "AIza".
export const isFirebaseConfigured =
  typeof firebaseConfig.apiKey === "string" &&
  firebaseConfig.apiKey.startsWith("AIza") &&
  Boolean(firebaseConfig.projectId);

// Guard against re-initialising on fast-refresh / duplicate imports, which caused
// the "Firebase App named '[DEFAULT]' already exists" error.
const alreadyInit = getApps().length > 0;
const app = alreadyInit ? getApp() : initializeApp(firebaseConfig);

// Persist the auth session across app restarts using AsyncStorage. initializeAuth must
// run once; on hot-reload (app already initialized) fall back to getAuth to avoid the
// "auth already initialized" error.
let _auth;
if (alreadyInit) {
  _auth = getAuth(app);
} else {
  try {
    _auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch (e) {
    _auth = getAuth(app);
  }
}

export const auth = _auth;

// Firestore in React Native / Expo Go: the default WebChannel streaming transport
// frequently errors ("WebChannelConnection RPC 'Listen' stream transport errored"),
// which breaks real-time onSnapshot listeners (alerts never arrive). Forcing
// long-polling makes the connection reliable on mobile.
let _db;
if (alreadyInit) {
  _db = getFirestore(app);
} else {
  try {
    _db = initializeFirestore(app, { experimentalForceLongPolling: true });
  } catch (e) {
    _db = getFirestore(app);
  }
}

export const db = _db;
export default app;

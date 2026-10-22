import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Notifications from "expo-notifications";
import { doc, getDoc } from "firebase/firestore";

import { useAuth } from "../context/AuthContext";
import { db, isFirebaseConfigured } from "../config/firebase";
import { initCallAlerts } from "../services/callAlerts";
import { ensureCallPermissions } from "../services/autoCall";
import { decideAuthRoute } from "../services/authFlow";
import { colors, palette, type, space } from "../theme";

// Auth
import LoginScreen from "../screens/auth/LoginScreen";
import SignupScreen from "../screens/auth/SignupScreen";
import RoleSetupScreen from "../screens/auth/RoleSetupScreen";
import {
  ForgotPasswordScreen,
  SetupFailedScreen,
  VerifyEmailScreen,
} from "../screens/auth/AuthScreens";

// Elder
import ElderHomeScreen from "../screens/elder/ElderHomeScreen";
import SOSModal from "../screens/elder/SOSModal";
import CancelAlertScreen from "../screens/elder/CancelAlertScreen";

// Caretaker
import CaretakerHomeScreen from "../screens/caretaker/CaretakerHomeScreen";
import CaretakerAlertModal from "../screens/caretaker/CaretakerAlertModal";
import ActiveResponseScreen from "../screens/caretaker/ActiveResponseScreen";
import AlertHistoryScreen from "../screens/caretaker/AlertHistoryScreen";
import ElderDetailsScreen from "../screens/caretaker/ElderDetailsScreen";
import ManageResidentsScreen from "../screens/caretaker/ManageResidentsScreen";

// Volunteer
import VolunteerHomeScreen from "../screens/volunteer/VolunteerHomeScreen";
import VolunteerDispatchModal from "../screens/volunteer/VolunteerDispatchModal";
import { UpSupportMark } from "../components/auth/WithyuComponents";

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

/**
 * Notification-tap deep link: a push tap (foreground, background, or cold start)
 * carries data.alertId. We fetch the live alert doc and open the right screen for
 * the signed-in role. Pending taps are held until auth + navigation are ready.
 */
function useNotificationDeepLink(role, loading) {
  const [pendingAlertId, setPendingAlertId] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const readAlertId = (response) =>
      response?.notification?.request?.content?.data?.alertId || null;

    const getLast = () => {
      if (typeof Notifications.getLastNotificationResponseAsync === "function") {
        return Notifications.getLastNotificationResponseAsync();
      }
      return Promise.resolve(Notifications.getLastNotificationResponse?.());
    };

    getLast()
      .then((r) => { const id = readAlertId(r); if (id) setPendingAlertId(id); })
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const id = readAlertId(r);
      if (id) setPendingAlertId(id);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!pendingAlertId || loading) return;
    if (role !== "caretaker" && role !== "volunteer") return;
    let cancelled = false;
    let timer = null;
    const attempt = async () => {
      if (cancelled) return;
      if (!navigationRef.isReady()) {
        timer = setTimeout(attempt, 300);
        return;
      }
      const alertId = pendingAlertId;
      setPendingAlertId(null);
      try {
        const snap = await getDoc(doc(db, "alerts", alertId));
        if (!snap.exists()) return;
        const alert = { id: snap.id, ...snap.data() };
        if (role === "caretaker") navigationRef.navigate("CaretakerAlert", { alert });
        else navigationRef.navigate("VolunteerDispatch", { alert });
      } catch (e) {}
    };
    attempt();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pendingAlertId, role, loading]);
}

function Loading() {
  return (
    <View style={styles.splash}>
      <UpSupportMark size={68} variant="white" />
      <Text style={styles.brand}>UpSupport</Text>
      <Text style={styles.tagline}>Keeping watch, with care</Text>
      <ActivityIndicator size="large" color={palette.white} style={{ marginTop: space.lg }} />
    </View>
  );
}

function AuthStack({ initialRouteName = "Login" }) {
  return (
    <Stack.Navigator key={initialRouteName} initialRouteName={initialRouteName} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="RoleSetup" component={RoleSetupScreen} />
      <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="SetupFailed" component={SetupFailedScreen} />
    </Stack.Navigator>
  );
}

function ElderStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}>
      <Stack.Screen name="ElderHome" component={ElderHomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SOS" component={SOSModal} options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="CancelAlert" component={CancelAlertScreen} options={{ presentation: "modal", headerShown: false }} />
    </Stack.Navigator>
  );
}

function CaretakerStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}>
      <Stack.Screen name="CaretakerHome" component={CaretakerHomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CaretakerAlert" component={CaretakerAlertModal} options={{ presentation: "fullScreenModal", headerShown: false }} />
      <Stack.Screen name="ActiveResponse" component={ActiveResponseScreen} options={{ title: "Active Response" }} />
      <Stack.Screen name="AlertHistory" component={AlertHistoryScreen} options={{ title: "Alert History" }} />
      <Stack.Screen name="ElderDetails" component={ElderDetailsScreen} options={{ title: "Resident Details" }} />
      <Stack.Screen name="ManageResidents" component={ManageResidentsScreen} options={{ title: "Manage Residents" }} />
    </Stack.Navigator>
  );
}

function VolunteerStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }}>
      <Stack.Screen name="VolunteerHome" component={VolunteerHomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="VolunteerDispatch" component={VolunteerDispatchModal} options={{ presentation: "fullScreenModal", headerShown: false }} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const {
    user,
    role,
    profile,
    loading,
    profileLoaded,
    authSetupInProgress,
    configured,
    authFlowLoaded,
    googleSignupRetry,
    setupFailure,
  } = useAuth();

  useNotificationDeepLink(role, loading);

  // Call-style ringing for responders: foreground emergency pushes ring like a
  // phone call (looping ring tone) until handled. No-op on binaries without the
  // Notifee native module.
  useEffect(() => {
    if (role !== "caretaker" && role !== "volunteer") return;
    return initCallAlerts({ navigationRef });
  }, [role]);

  // Phone permissions for the tier-3 auto-call chain (elder auto-dials the
  // caretaker; caretaker's app auto-dials back if unanswered). Elder also
  // gets ANSWER_PHONE_CALLS so the callback connects hands-free.
  useEffect(() => {
    if (role === "elder") ensureCallPermissions({ needAnswer: true });
    else if (role === "caretaker") ensureCallPermissions({ needAnswer: false });
  }, [role]);

  const destination = decideAuthRoute({
    user,
    profile,
    loading: loading || !authFlowLoaded,
    profileLoaded,
    configured,
    authSetupInProgress,
    googleSignupRetry,
    setupFailure: Boolean(setupFailure),
  });

  return (
    <NavigationContainer ref={navigationRef}>
      {destination === "loading" ? (
        <Loading />
      ) : destination === "setupFailed" ? (
        <AuthStack initialRouteName="SetupFailed" />
      ) : destination === "googleSignupRetry" ? (
        <AuthStack initialRouteName="Signup" />
      ) : destination === "verifyEmail" ? (
        <AuthStack initialRouteName="VerifyEmail" />
      ) : destination === "roleSetup" ? (
        <AuthStack initialRouteName="RoleSetup" />
      ) : destination === "elderHome" ? (
        <ElderStack />
      ) : destination === "caretakerHome" ? (
        <CaretakerStack />
      ) : destination === "volunteerHome" ? (
        <VolunteerStack />
      ) : (
        <AuthStack initialRouteName={googleSignupRetry ? "Signup" : "Login"} />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  splash: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: palette.safe },
  brand: { color: palette.white, fontSize: type.xxl, fontWeight: type.weightBold },
  tagline: { color: palette.white, opacity: 0.88, fontSize: type.md, marginTop: space.xs },
});

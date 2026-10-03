import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../context/AuthContext";
import { colors, palette, type, space } from "../theme";

// Auth
import LoginScreen from "../screens/auth/LoginScreen";
import SignupScreen from "../screens/auth/SignupScreen";
import RoleSetupScreen from "../screens/auth/RoleSetupScreen";

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

// Volunteer
import VolunteerHomeScreen from "../screens/volunteer/VolunteerHomeScreen";
import VolunteerDispatchModal from "../screens/volunteer/VolunteerDispatchModal";

const Stack = createNativeStackNavigator();

function Loading() {
  return (
    <View style={styles.splash}>
      <View style={styles.logoCircle}>
        <Ionicons name="shield-checkmark" size={56} color={palette.white} />
      </View>
      <Text style={styles.brand}>INSIGHT-Fall</Text>
      <Text style={styles.tagline}>Keeping watch, with care</Text>
      <ActivityIndicator size="large" color={palette.white} style={{ marginTop: space.lg }} />
    </View>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="RoleSetup" component={RoleSetupScreen} />
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
  const { user, role, profile, loading, profileLoaded, configured } = useAuth();

  // Setup is "complete" when the role's required linking/details are present.
  // Elder: has a room set. Caretaker: linked to an elder. Volunteer: always ready.
  const setupComplete =
    role === "elder" ? Boolean(profile?.roomLocation)
    : role === "caretaker" ? Boolean(profile?.assignedElderId)
    : role === "volunteer" ? true
    : false;

  function RoleSetupOnly() {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="RoleSetup" component={RoleSetupScreen} />
      </Stack.Navigator>
    );
  }

  // A logged-in user whose profile hasn't been fetched yet must NOT be routed to
  // RoleSetup (that wrongly shows the volunteer fallback). Wait for the profile.
  const profilePending = user && configured && !profileLoaded;
  // Logged in, profile fetch resolved, but NO profile doc exists = orphan auth account
  // (e.g. its Firestore profile was deleted). Send them to AuthStack to sign up fresh.
  const orphan = user && configured && profileLoaded && !profile;

  return (
    <NavigationContainer>
      {loading || profilePending ? (
        <Loading />
      ) : !user || !configured || orphan ? (
        <AuthStack />
      ) : !role || !setupComplete ? (
        // Authenticated, profile loaded, but role setup / linking not finished.
        <RoleSetupOnly />
      ) : role === "elder" ? (
        <ElderStack />
      ) : role === "caretaker" ? (
        <CaretakerStack />
      ) : (
        <VolunteerStack />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  splash: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: palette.safe },
  logoCircle: {
    width: 110, height: 110, borderRadius: 55, backgroundColor: palette.safeDark,
    alignItems: "center", justifyContent: "center", marginBottom: space.lg,
  },
  brand: { color: palette.white, fontSize: type.xxl, fontWeight: type.weightBold },
  tagline: { color: palette.safeSoft, fontSize: type.md, marginTop: space.xs },
});

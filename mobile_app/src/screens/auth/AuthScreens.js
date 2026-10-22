import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import * as IntentLauncher from "expo-intent-launcher";
import {
  GoogleAuthProvider,
  applyActionCode,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "../../config/firebase";
import {
  EMAIL_VERIFICATION_ACTION_SETTINGS,
  getEmailVerificationActionCode,
  isEmailVerificationContinuationLink,
} from "../../services/emailActionLinks";
import { useAuth } from "../../context/AuthContext";
import {
  friendlyAuthError,
  googleAccountRoleLabel,
  pendingProfileSetupForEmail,
  ROLE_OPTIONS,
  resolveProfileName,
  validateEmail,
  validateName,
  validatePassword,
} from "../../services/authFlow";
import { createProfileForUser, getUserProfile, googleAuthClientIds } from "../../services/authProfiles";
import {
  BrandLockup,
  Heading,
  GoogleButton,
  PrimaryButton,
  RoleCard,
  Screen,
  SecondaryButton,
  TextField,
} from "../../components/auth/WithyuComponents";
import { palette } from "../../theme";

WebBrowser.maybeCompleteAuthSession();

export function LoginScreen({ navigation }) {
  const {
    configured,
    authDraft,
    setupFailure,
    googleConflict,
    clearGoogleConflict,
    setAuthSetupInProgress,
    clearAuthDraft,
    clearSetupFailure,
    refreshProfile,
    refreshUser,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const clientIds = googleAuthClientIds();
  const [googleRequest, googleResponse, promptGoogle] = Google.useIdTokenAuthRequest({
    ...clientIds,
    selectAccount: true,
  });

  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type !== "success") {
      setGoogleBusy(false);
      return;
    }
    const idToken = googleResponse.params?.id_token;
    if (!idToken) {
      setErrors({ form: "Google did not return a sign-in token. Please try again." });
      setGoogleBusy(false);
      return;
    }
    (async () => {
      setErrors({});
      try {
        const credential = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(auth, credential);
        const existing = await getUserProfile(result.user.uid);
        if (!existing) {
          await signOut(auth);
          setErrors({ form: "This Google account has no UpSupport profile. Create an account first." });
        } else {
          await refreshProfile();
          await refreshUser();
        }
      } catch (error) {
        setErrors({ form: friendlyAuthError(error.code) });
      } finally {
        setGoogleBusy(false);
      }
    })();
  }, [googleResponse, refreshProfile, refreshUser]);

  const submit = async () => {
    clearGoogleConflict();
    const nextErrors = {
      email: validateEmail(email),
      password: password ? null : "Enter your password.",
    };
    setErrors(Object.fromEntries(Object.entries(nextErrors).filter(([, value]) => value)));
    if (Object.values(nextErrors).some(Boolean)) return;
    if (!configured) {
      setErrors({ form: "UpSupport cannot connect to its sign-in service right now. Check your connection." });
      return;
    }
    setBusy(true);
    setAuthSetupInProgress(true);
    try {
      const normalizedEmail = email.trim();
      const result = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      await result.user.reload();
      let profile = await getUserProfile(result.user.uid);
      if (!profile) {
        const pendingSetup = pendingProfileSetupForEmail(normalizedEmail, authDraft, setupFailure);
        if (!pendingSetup) {
          try {
            await signOut(auth);
          } catch (signOutError) {
            console.warn("Could not end a sign-in session without a profile.", signOutError.code);
          }
          setErrors({
            form: "Your sign-in succeeded, but this account has no UpSupport profile yet. Please create the account again or contact support.",
          });
          return;
        }
        profile = await createProfileForUser(result.user, {
          name: pendingSetup.name,
          role: pendingSetup.role,
          authProvider: "password",
        });
      }
      await clearAuthDraft();
      await clearSetupFailure();
      await refreshProfile();
      await refreshUser();
    } catch (error) {
      setErrors({ form: friendlyAuthError(error.code) });
    } finally {
      setBusy(false);
      setAuthSetupInProgress(false);
    }
  };

  const startGoogle = async () => {
    clearGoogleConflict();
    setErrors({});
    if (!configured) {
      setErrors({ form: "UpSupport cannot connect to its sign-in service right now. Check your connection." });
      return;
    }
    if (!clientIds.webClientId && !clientIds.androidClientId && !clientIds.iosClientId) {
      setErrors({ form: "Google sign-in is not configured yet. Please contact support." });
      return;
    }
    setGoogleBusy(true);
    try {
      await promptGoogle();
    } catch (error) {
      setGoogleBusy(false);
      setErrors({ form: friendlyAuthError(error.code) });
    }
  };

  return (
    <Screen>
      <BrandLockup />
      <Heading title="Welcome back" description="Good to see you. Sign in to stay close to the people who matter." />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        error={errors.email}
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="Your password"
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        error={errors.password}
      />
      <Pressable onPress={() => navigation.navigate("ForgotPassword")} accessibilityRole="button" style={styles.forgotLink}>
        <Text style={styles.linkText}>Forgot password?</Text>
      </Pressable>
      {googleConflict ? (
        <InlineMessage
          message={`That Google account already has an UpSupport profile${googleConflict.role ? ` as a ${googleAccountRoleLabel(googleConflict.role)}` : ""}. Sign in with that account, or create an account using a different Google account.`}
          tone="success"
        />
      ) : null}
      {errors.form ? <InlineMessage message={errors.form} tone="error" /> : null}
      <PrimaryButton title="Sign in" onPress={submit} loading={busy} disabled={googleBusy} />
      <OrDivider />
      <GoogleButton
        title="Continue with Google"
        onPress={startGoogle}
        loading={googleBusy}
        disabled={busy || !googleRequest}
      />
      <Pressable
        onPress={() => {
          clearGoogleConflict();
          navigation.navigate("Signup");
        }}
        accessibilityRole="button"
        style={styles.footerLink}
      >
        <Text style={styles.footerText}>New here? <Text style={styles.linkText}>Create an account</Text></Text>
      </Pressable>
    </Screen>
  );
}

export function SignupScreen({ navigation }) {
  const {
    configured,
    authDraft,
    authFlowLoaded,
    googleSignupRetry,
    setAuthSetupInProgress,
    saveAuthDraft,
    clearAuthDraft,
    setGoogleConflict,
    setGoogleSignupRetry,
    setSetupFailure,
  } = useAuth();
  const initialRole = authDraft?.role || "elder";
  const [step, setStep] = useState(authDraft?.stage === "account" ? "account" : "role");
  const [role, setRole] = useState(initialRole);
  const [name, setName] = useState(authDraft?.name || "");
  const [email, setEmail] = useState(authDraft?.email || "");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const clientIds = googleAuthClientIds();
  const [googleRequest, googleResponse, promptGoogle] = Google.useIdTokenAuthRequest({
    ...clientIds,
    selectAccount: true,
  });

  useEffect(() => {
    if (!authFlowLoaded) return;
    if (authDraft?.stage === "account") setStep("account");
  }, [authDraft?.stage, authFlowLoaded]);

  useEffect(() => {
    if (!authFlowLoaded) return undefined;
    const timer = setTimeout(() => {
      saveAuthDraft({ role, stage: step, name, email });
    }, 200);
    return () => clearTimeout(timer);
  }, [authFlowLoaded, role, step, name, email, saveAuthDraft]);

  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type !== "success") {
      setGoogleBusy(false);
      return;
    }
    const idToken = googleResponse.params?.id_token;
    if (!idToken) {
      setErrors({ form: "Google did not return a sign-in token. Please try again." });
      setGoogleBusy(false);
      return;
    }
    (async () => {
      setErrors({});
      setAuthSetupInProgress(true);
      let signedIn = false;
      let existingAccountFound = false;
      try {
        const credential = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(auth, credential);
        signedIn = true;
        const existing = await getUserProfile(result.user.uid);
        if (existing) {
          existingAccountFound = true;
          await saveAuthDraft({ role, stage: "account", name, email });
          setGoogleSignupRetry(false);
          setGoogleConflict({
            role: existing.role,
            attemptedRole: role,
            name: existing.name,
            email: existing.email || result.user.email,
          });
          setGoogleSignupRetry(false);
          await signOut(auth);
          return;
        }
        const displayName = resolveProfileName(name, result.user);
        await createProfileForUser(result.user, { name: displayName, role, authProvider: "google" });
        await clearAuthDraft();
        setGoogleSignupRetry(false);
      } catch (error) {
        if (existingAccountFound) {
          setErrors({ form: friendlyAuthError(error.code) });
        } else if (auth.currentUser && !(await getUserProfile(auth.currentUser.uid).catch(() => null))) {
          try {
            await signOut(auth);
          } catch (signOutError) {
            console.warn("Google account setup could not clear the Firebase session.", signOutError.code);
          }
        }
        if (signedIn && !existingAccountFound) {
          await setSetupFailure({
            stage: "profile",
            provider: "google",
            role,
            name: name.trim(),
            email: email.trim(),
            errorCode: error.code || null,
          });
        } else {
          setErrors({ form: friendlyAuthError(error.code) });
        }
      } finally {
        setGoogleBusy(false);
        setAuthSetupInProgress(false);
      }
    })();
  }, [googleResponse, role, name, email, clearAuthDraft, saveAuthDraft, setGoogleConflict, setGoogleSignupRetry, setSetupFailure, setAuthSetupInProgress]);

  const chooseRole = () => {
    setErrors({});
    setStep("account");
    saveAuthDraft({ role, stage: "account", name, email });
  };

  const backFromRoleSelection = () => {
    if (googleSignupRetry) {
      setGoogleSignupRetry(false);
      return;
    }
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("Login");
  };

  const submitEmail = async () => {
    const nextErrors = {
      name: validateName(name),
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setErrors(Object.fromEntries(Object.entries(nextErrors).filter(([, value]) => value)));
    if (Object.values(nextErrors).some(Boolean)) return;
    if (!configured) {
      setErrors({ form: "UpSupport cannot connect to its sign-in service right now. Check your connection." });
      return;
    }
    setBusy(true);
    setAuthSetupInProgress(true);
    let createdUser = null;
    let profileCreated = false;
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      createdUser = credential.user;
      await createProfileForUser(createdUser, { name: name.trim(), role, authProvider: "password" });
      profileCreated = true;
      await clearAuthDraft();
      setGoogleSignupRetry(false);
      setPassword("");
      await sendEmailVerification(createdUser, EMAIL_VERIFICATION_ACTION_SETTINGS);
      await updateDoc(doc(db, "users", createdUser.uid), {
        verificationSentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (createdUser && !profileCreated) {
        try {
          await signOut(auth);
        } catch (signOutError) {
          console.warn("Email account setup could not clear the Firebase session.", signOutError.code);
        }
        await setSetupFailure({
          stage: "profile",
          provider: "password",
          role,
          name: name.trim(),
          email: email.trim(),
          errorCode: error.code || null,
        });
      } else if (createdUser && profileCreated) {
        await setSetupFailure({
          stage: "verification",
          provider: "password",
          role,
          name: name.trim(),
          email: email.trim(),
          errorCode: error.code || null,
        });
      } else {
        setErrors({ form: friendlyAuthError(error.code) });
      }
    } finally {
      setBusy(false);
      setAuthSetupInProgress(false);
    }
  };

  const startGoogle = async () => {
    if (!configured) {
      setErrors({ form: "UpSupport cannot connect to its sign-in service right now. Check your connection." });
      return;
    }
    if (!clientIds.webClientId && !clientIds.androidClientId && !clientIds.iosClientId) {
      setErrors({ form: "Google sign-in is not configured yet. Please contact support." });
      return;
    }
    setErrors({});
    setGoogleBusy(true);
    try {
      await promptGoogle();
    } catch (error) {
      setGoogleBusy(false);
      setErrors({ form: friendlyAuthError(error.code) });
    }
  };

  const chosen = ROLE_OPTIONS.find((option) => option.key === role) || ROLE_OPTIONS[0];

  return (
    <Screen>
      <ProgressHeader step={step === "role" ? 1 : 2} onBack={step === "role" ? backFromRoleSelection : () => setStep("role")} />
      {step === "role" ? (
        <>
          <Heading title="How will you use UpSupport?" description="Pick what fits best. We will shape the app around you." />
          <View accessibilityRole="radiogroup">
            {ROLE_OPTIONS.map((option) => (
              <RoleCard
                key={option.key}
                {...option}
                selected={role === option.key}
                onPress={() => setRole(option.key)}
              />
            ))}
          </View>
          <PrimaryButton title="Continue" onPress={chooseRole} />
        </>
      ) : (
        <>
          <Pressable onPress={() => setStep("role")} accessibilityRole="button" style={styles.rolePill}>
            <Text style={styles.rolePillText}>{chosen.title} · Change</Text>
          </Pressable>
          <Heading title="Create your account" description="Your UpSupport account takes about a minute." />
          <GoogleButton
            title="Continue with Google"
            onPress={startGoogle}
            loading={googleBusy}
            disabled={busy || !googleRequest}
          />
          <OrDivider label="or use email" />
          <TextField
            label="Full name"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            hint="Required for email sign-up. Google uses your Google profile name."
            error={errors.name}
          />
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            error={errors.email}
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            hint="At least 8 characters"
            error={errors.password}
          />
          {errors.form ? <InlineMessage message={errors.form} tone="error" /> : null}
          <PrimaryButton title="Create account" onPress={submitEmail} loading={busy} disabled={googleBusy} />
          <Pressable
            onPress={() => {
              setGoogleSignupRetry(false);
              navigation.navigate("Login");
            }}
            accessibilityRole="button"
            style={styles.footerLink}
          >
            <Text style={styles.footerText}>Already have an account? <Text style={styles.linkText}>Sign in</Text></Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

export function VerifyEmailScreen() {
  const { user, profile, refreshProfile, refreshUser, configured, logout } = useAuth();
  const [resendSeconds, setResendSeconds] = useState(60);
  const [changeMode, setChangeMode] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [verificationMessage, setVerificationMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingVerification, setCheckingVerification] = useState(false);
  const processedActionCodes = useRef(new Set());
  const leaveVerification = async () => {
    try {
      await logout();
    } catch (nextError) {
      setError(friendlyAuthError(nextError.code));
    }
  };

  const checkVerification = async (manual = false) => {
    if (!auth.currentUser) {
      if (manual) setError("Your session expired. Sign in again to check verification.");
      return false;
    }
    if (manual) {
      setCheckingVerification(true);
      setError("");
      setVerificationMessage("");
    }
    try {
      await auth.currentUser.reload();
      const refreshed = await refreshUser();
      const isVerified = Boolean(refreshed?.emailVerified || auth.currentUser.emailVerified);
      if (isVerified) {
        if (profile && auth.currentUser.email !== profile.email) {
          await updateDoc(doc(db, "users", auth.currentUser.uid), { email: auth.currentUser.email });
          await refreshProfile();
        }
        if (manual) setVerificationMessage("Email verified. Continuing to account setup…");
      } else if (manual) {
        setVerificationMessage("We have not received the confirmation yet. Open the verification link in your inbox, then try again.");
      }
      return isVerified;
    } catch (nextError) {
      if (manual) setError(friendlyAuthError(nextError.code));
      return false;
    } finally {
      if (manual) setCheckingVerification(false);
    }
  };

  useEffect(() => {
    if (!user || user.emailVerified) return undefined;
    checkVerification();
    const interval = setInterval(checkVerification, 5000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") checkVerification();
    });
    const cooldown = setInterval(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => {
      clearInterval(interval);
      clearInterval(cooldown);
      subscription.remove();
    };
  }, [user?.uid]);

  const checkVerificationRef = useRef(checkVerification);
  checkVerificationRef.current = checkVerification;

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    const handleActionLink = async (url) => {
      const actionCode = getEmailVerificationActionCode(url);
      if (!active) return;
      if (!actionCode) {
        if (isEmailVerificationContinuationLink(url)) {
          await checkVerificationRef.current(true);
        }
        return;
      }
      if (processedActionCodes.current.has(actionCode)) return;
      processedActionCodes.current.add(actionCode);
      setError("");
      setCheckingVerification(true);
      try {
        await applyActionCode(auth, actionCode);
        if (active && await checkVerificationRef.current(true)) {
          setVerificationMessage("Email verified. Continuing to account setup…");
        }
      } catch (nextError) {
        if (active) setError(friendlyAuthError(nextError.code));
      } finally {
        if (active) setCheckingVerification(false);
      }
    };
    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleActionLink(url);
    });
    Linking.getInitialURL()
      .then((url) => {
        if (url) return handleActionLink(url);
        return undefined;
      })
      .catch((nextError) => {
        console.error("Unable to read the email verification link that opened the app.", nextError);
      });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [user?.uid]);

  useEffect(() => {
    const sentAt = Date.parse(profile?.verificationSentAt || "");
    setResendSeconds(sentAt
      ? Math.max(0, 60 - Math.floor((Date.now() - sentAt) / 1000))
      : 60);
  }, [profile?.verificationSentAt]);

  const resend = async () => {
    if (!configured || !auth.currentUser) {
      setError("You are offline or signed out. Sign in again when you are connected.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await sendEmailVerification(auth.currentUser, EMAIL_VERIFICATION_ACTION_SETTINGS);
      const sentAt = new Date().toISOString();
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        verificationSentAt: sentAt,
        updatedAt: sentAt,
      });
      await refreshProfile();
      setResendSeconds(60);
      setNotice("A new verification link is on its way.");
    } catch (nextError) {
      setError(friendlyAuthError(nextError.code));
    } finally {
      setBusy(false);
    }
  };

  const openMail = async () => {
    setError("");
    try {
      if (Platform.OS === "android") {
        await IntentLauncher.startActivityAsync("android.intent.action.MAIN", {
          category: "android.intent.category.APP_EMAIL",
        });
      } else {
        await Linking.openURL("message://");
      }
    } catch {
      setError("We could not open your email app. Open your inbox manually and follow the verification link.");
    }
  };

  const changeEmail = async () => {
    const emailError = validateEmail(newEmail);
    if (emailError) {
      setError(emailError);
      return;
    }
    if (!auth.currentUser) {
      setError("Your session expired. Sign in again to change this email.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await verifyBeforeUpdateEmail(
        auth.currentUser,
        newEmail.trim(),
        EMAIL_VERIFICATION_ACTION_SETTINGS
      );
      const sentAt = new Date().toISOString();
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        verificationSentAt: sentAt,
        updatedAt: sentAt,
      });
      setNotice("We sent a confirmation link to the new address. Open it, then return here.");
      setChangeMode(false);
      setResendSeconds(60);
    } catch (nextError) {
      setError(friendlyAuthError(nextError.code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen onBack={leaveVerification}>
      <BrandLockup />
      <View style={styles.mailMark}>
        <Ionicons name="mail-outline" size={25} color={palette.safeDark} />
      </View>
      <Heading
        title="Check your inbox"
        description={`We sent a link to ${user?.email || profile?.email || "your email"}. Tap it to confirm your account, then return here.`}
      />
      {changeMode ? (
        <>
          <TextField
            label="New email"
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            error={error}
          />
          <PrimaryButton title="Send confirmation link" onPress={changeEmail} loading={busy} />
          <SecondaryButton title="Keep this email" onPress={() => { setChangeMode(false); setError(""); }} />
        </>
      ) : (
        <>
          <PrimaryButton title="Open mail app" icon="mail-outline" onPress={openMail} />
          <SecondaryButton
            title="I've verified my email"
            onPress={() => checkVerification(true)}
            loading={checkingVerification}
            disabled={busy}
          />
          {verificationMessage ? (
            <Text accessibilityRole="alert" style={styles.verificationHint}>{verificationMessage}</Text>
          ) : null}
          <SecondaryButton
            title={resendSeconds ? `Resend email · ${resendSeconds}s` : "Resend email"}
            onPress={resend}
            loading={busy}
            disabled={resendSeconds > 0}
          />
          <Pressable
            onPress={() => { setChangeMode(true); setNewEmail(""); setError(""); }}
            accessibilityRole="button"
            style={styles.centerLink}
          >
            <Text style={styles.linkText}>Wrong email? Change it</Text>
          </Pressable>
        </>
      )}
      {error ? <InlineMessage message={error} tone="error" /> : null}
      {notice ? <InlineMessage message={notice} tone="success" /> : null}
    </Screen>
  );
}

export function ForgotPasswordScreen({ navigation }) {
  const { configured } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    if (!configured) {
      setError("You appear to be offline. Check your connection and try again.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (nextError) {
      setError(friendlyAuthError(nextError.code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen onBack={() => {
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.navigate("Login");
    }}>
      <BrandLockup />
      <Heading
        title={sent ? "Check your inbox" : "Reset your password"}
        description={sent ? `We sent a reset link to ${email.trim()}.` : "Enter the email on your UpSupport account and we will send a reset link."}
      />
      {!sent ? (
        <>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            error={error}
          />
          <PrimaryButton title="Send reset link" onPress={submit} loading={busy} />
        </>
      ) : (
        <PrimaryButton title="Back to sign in" onPress={() => navigation.navigate("Login")} />
      )}
      {error ? <InlineMessage message={error} tone="error" /> : null}
    </Screen>
  );
}

export function SetupFailedScreen() {
  const {
    setupFailure,
    clearSetupFailure,
    clearAuthDraft,
    saveAuthDraft,
    logout,
    setGoogleSignupRetry,
    setSetupFailure,
    refreshProfile,
  } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const backToSignIn = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (setupFailure?.stage === "profile") {
        await saveAuthDraft({
          role: setupFailure.role,
          stage: "account",
          name: setupFailure.name,
          email: setupFailure.email,
        });
      }
      setGoogleSignupRetry(
        setupFailure?.stage === "profile" && setupFailure.provider === "google"
      );
      await clearSetupFailure();
      if (auth.currentUser) await logout();
    } catch (nextError) {
      setError(friendlyAuthError(nextError.code));
    } finally {
      setBusy(false);
    }
  };
  const clientIds = googleAuthClientIds();
  const [googleRequest, googleResponse, promptGoogle] = Google.useIdTokenAuthRequest({
    ...clientIds,
    selectAccount: true,
  });

  const retryEmail = async () => {
    if (!setupFailure) return;
    setError("");
    setBusy(true);
    try {
      let currentUser = auth.currentUser;
      if (!currentUser) {
        if (!password) {
          setError("Enter your password to safely resume account setup.");
          return;
        }
        const credential = await signInWithEmailAndPassword(auth, setupFailure.email, password);
        currentUser = credential.user;
      }
      if (setupFailure.stage === "profile") {
        await createProfileForUser(currentUser, {
          name: setupFailure.name,
          role: setupFailure.role,
          authProvider: "password",
        });
        await clearAuthDraft();
        await sendEmailVerification(currentUser, EMAIL_VERIFICATION_ACTION_SETTINGS);
        const sentAt = new Date().toISOString();
        await updateDoc(doc(db, "users", currentUser.uid), {
          verificationSentAt: sentAt,
          updatedAt: sentAt,
        });
      } else if (setupFailure.stage === "verification") {
        await sendEmailVerification(currentUser, EMAIL_VERIFICATION_ACTION_SETTINGS);
        const sentAt = new Date().toISOString();
        await updateDoc(doc(db, "users", currentUser.uid), {
          verificationSentAt: sentAt,
          updatedAt: sentAt,
        });
      }
      setPassword("");
      await clearSetupFailure();
      setGoogleSignupRetry(false);
      await refreshProfile();
    } catch (nextError) {
      setError(friendlyAuthError(nextError.code));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (googleResponse?.type !== "success" || setupFailure?.provider !== "google") return;
    const idToken = googleResponse.params?.id_token;
    if (!idToken) {
      setError("Google did not return a sign-in token. Please try again.");
      return;
    }
    (async () => {
      setBusy(true);
      setError("");
      try {
        const credential = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(auth, credential);
        await createProfileForUser(result.user, {
          name: setupFailure.name || result.user.displayName,
          role: setupFailure.role,
          authProvider: "google",
        });
        await clearSetupFailure();
        await clearAuthDraft();
        setGoogleSignupRetry(false);
      } catch (nextError) {
        setError(friendlyAuthError(nextError.code));
        if (auth.currentUser) await signOut(auth);
      } finally {
        setBusy(false);
      }
    })();
  }, [googleResponse, setupFailure, clearSetupFailure, clearAuthDraft]);

  const retry = async () => {
    if (setupFailure?.provider === "google" && setupFailure.stage === "profile") {
      if (!googleRequest || (!clientIds.webClientId && !clientIds.androidClientId && !clientIds.iosClientId)) {
        setError("Google sign-in is not configured yet. Please contact support.");
        return;
      }
      setBusy(true);
      try {
        await promptGoogle();
      } catch (nextError) {
        setError(friendlyAuthError(nextError.code));
        setBusy(false);
      }
      return;
    }
    if (setupFailure?.stage === "roleSetup") {
      await clearSetupFailure();
      await refreshProfile();
      return;
    }
    await retryEmail();
  };

  return (
    <Screen contentStyle={styles.centeredScreen} onBack={backToSignIn}>
      <BrandLockup centered />
      <View style={styles.warningMark}>
        <Ionicons name="warning-outline" size={25} color={palette.accent} />
      </View>
      <Heading
        title="We could not finish setup"
        description={setupFailure?.errorCode
          ? `${friendlyAuthError(setupFailure.errorCode)} Your details are safe. Please try again. Reference: ${setupFailure.errorCode}.`
          : "Your details are safe. Please try again in a moment."}
        style={styles.centeredHeading}
      />
      {setupFailure?.provider === "password" && setupFailure.stage === "profile" && !auth.currentUser ? (
        <TextField
          label="Password to resume"
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
        />
      ) : null}
      {error ? <InlineMessage message={error} tone="error" /> : null}
      <PrimaryButton title="Try again" onPress={retry} loading={busy} />
      <SecondaryButton
        title="Contact support"
        onPress={async () => {
          try {
            await Linking.openURL("mailto:?subject=UpSupport%20setup%20help");
          } catch {
            setError("No mail app is available. Please contact your UpSupport administrator.");
          }
        }}
      />
    </Screen>
  );
}

function ProgressHeader({ step, onBack }) {
  return (
    <View style={styles.progressWrap}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back" style={styles.backCircle}>
        <Ionicons name="chevron-back" size={21} color={palette.text} />
      </Pressable>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(step / 3) * 100}%` }]} />
      </View>
      <Text style={styles.progressLabel}>Step {step} of 3</Text>
    </View>
  );
}

function OrDivider({ label = "or" }) {
  return (
    <View style={styles.orRow}>
      <View style={styles.orLine} />
      <Text style={styles.orText}>{label}</Text>
      <View style={styles.orLine} />
    </View>
  );
}

function InlineMessage({ message, tone = "error" }) {
  const error = tone === "error";
  return (
    <View accessibilityRole="alert" style={[styles.message, error ? styles.errorMessage : styles.successMessage]}>
      <Ionicons name={error ? "alert-circle-outline" : "checkmark-circle-outline"} size={19} color={error ? palette.danger : palette.safeDark} />
      <Text style={[styles.messageText, error ? styles.errorText : styles.successText]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  forgotLink: { alignSelf: "flex-end", minHeight: 44, justifyContent: "center", marginTop: -6, marginBottom: 8 },
  linkText: { color: palette.safeDark, fontFamily: "NunitoSans_700Bold", fontSize: 14 },
  footerLink: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 14 },
  footerText: { color: palette.textMuted, fontFamily: "NunitoSans_400Regular", fontSize: 14 },
  rolePill: { alignSelf: "flex-start", minHeight: 34, justifyContent: "center", borderRadius: 18, backgroundColor: palette.safeSoft, paddingHorizontal: 14 },
  rolePillText: { color: palette.safeDark, fontFamily: "NunitoSans_700Bold", fontSize: 13 },
  orRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 13 },
  orLine: { height: 1, flex: 1, backgroundColor: palette.border },
  orText: { color: palette.textMuted, fontFamily: "NunitoSans_400Regular", fontSize: 13 },
  message: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, padding: 12, marginTop: 10 },
  errorMessage: { backgroundColor: "#FCE9E7" },
  successMessage: { backgroundColor: palette.safeSoft },
  messageText: { flex: 1, fontFamily: "NunitoSans_600SemiBold", fontSize: 14, lineHeight: 20 },
  errorText: { color: palette.danger },
  successText: { color: palette.safeDark },
  mailMark: { width: 56, height: 56, borderRadius: 28, backgroundColor: palette.safeSoft, alignItems: "center", justifyContent: "center", marginTop: 12 },
  warningMark: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#FCE9E7", alignItems: "center", justifyContent: "center", marginTop: 12 },
  centerLink: { alignItems: "center", justifyContent: "center", minHeight: 48, marginTop: 4 },
  verificationHint: { color: palette.textMuted, fontFamily: "NunitoSans_600SemiBold", fontSize: 14, lineHeight: 20, marginTop: 8 },
  centeredScreen: { justifyContent: "center" },
  centeredHeading: { maxWidth: 340 },
  progressWrap: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  backCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.surface, alignItems: "center", justifyContent: "center" },
  progressTrack: { height: 4, flex: 1, backgroundColor: palette.border, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 4, backgroundColor: palette.safe, borderRadius: 4 },
  progressLabel: { color: palette.textMuted, fontFamily: "NunitoSans_400Regular", fontSize: 12 },
});

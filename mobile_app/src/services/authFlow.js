import { parsePhoneNumberFromString } from "libphonenumber-js";

export const ROLE_OPTIONS = [
  {
    key: "elder",
    title: "I am an older adult",
    description: "I want to feel safe and independent.",
    icon: "heart",
  },
  {
    key: "caretaker",
    title: "I care for someone",
    description: "I want to stay connected and know.",
    icon: "people",
  },
  {
    key: "volunteer",
    title: "I am a volunteer",
    description: "I want to help neighbours nearby.",
    icon: "star",
  },
];

export function googleAccountRoleLabel(role) {
  const normalizedRole = String(role || "").trim().toLowerCase().replace(/[\s-]/g, "_");
  const labels = {
    elder: "older adult",
    elderly: "older adult",
    olderadult: "older adult",
    older_adult: "older adult",
    caretaker: "caretaker",
    volunteer: "volunteer",
  };
  return labels[normalizedRole] || "existing account";
}

export function validateName(value) {
  return String(value || "").trim().length >= 2
    ? null
    : "Enter your name (at least 2 characters).";
}

export function resolveProfileName(name, user) {
  const enteredName = String(name || "").trim();
  if (enteredName.length >= 2) return enteredName;

  const providerName = String(user?.displayName || "").trim();
  if (providerName.length >= 2) return providerName;

  const emailName = String(user?.email || "").split("@")[0].trim();
  return emailName.length >= 2 ? emailName : "Google member";
}

export function pendingProfileSetupForEmail(email, authDraft, setupFailure) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;

  const candidates = [
    setupFailure?.stage === "profile" && setupFailure.provider === "password"
      ? setupFailure
      : null,
    authDraft?.stage === "account"
      ? { ...authDraft, provider: "password" }
      : null,
  ];

  return candidates.find((candidate) =>
    candidate
    && String(candidate.email || "").trim().toLowerCase() === normalizedEmail
    && ["elder", "caretaker", "volunteer"].includes(candidate.role)
  ) || null;
}

export function validateEmail(value) {
  const email = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
    ? null
    : "Enter a valid email address.";
}

export function validatePassword(value) {
  return String(value || "").length >= 8
    ? null
    : "Use at least 8 characters.";
}

export function normalizePhone(value, countryCode) {
  const phone = String(value || "").trim();
  if (!phone) return "";
  const parsed = parsePhoneNumberFromString(phone, countryCode);
  return parsed?.isValid() ? parsed.number : null;
}

export function validatePhone(value, countryCode, required = true) {
  if (!String(value || "").trim()) {
    return required ? "Enter a phone number." : null;
  }
  return normalizePhone(value, countryCode)
    ? null
    : "Enter a valid phone number, including your country code if needed.";
}

export function validateRoom(value) {
  return String(value || "").trim()
    ? null
    : "Enter a room or location.";
}

export function friendlyAuthError(code) {
  const messages = {
    "auth/email-already-in-use": "An account already uses this email. Sign in instead.",
    "auth/invalid-email": "That email address is not valid.",
    "auth/weak-password": "Choose a password with at least 8 characters.",
    "auth/user-not-found": "No account was found with that email.",
    "auth/wrong-password": "That email and password do not match.",
    "auth/invalid-credential": "That email and password do not match.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "You appear to be offline. Check your connection and try again.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    "auth/cancelled-popup-request": "Google sign-in was cancelled.",
    "auth/account-exists-with-different-credential":
      "An account already exists with this email. Sign in using its original method.",
    "auth/operation-not-allowed": "This sign-in method is not enabled yet. Contact support.",
    "auth/admin-restricted-operation": "This sign-in method is not enabled yet. Contact support.",
    "permission-denied": "The account service rejected the profile save. Please contact support or try again later.",
    "firestore/permission-denied": "The account service rejected the profile save. Please contact support or try again later.",
    unavailable: "The account service is temporarily unavailable. Please try again.",
    "firestore/unavailable": "The account service is temporarily unavailable. Please try again.",
    "deadline-exceeded": "The account service took too long to respond. Please try again.",
    "firestore/deadline-exceeded": "The account service took too long to respond. Please try again.",
  };
  return messages[code] || "We could not complete that request. Please try again.";
}

export function decideAuthRoute({
  user,
  profile,
  loading = false,
  profileLoaded = false,
  configured = true,
  authSetupInProgress = false,
  googleSignupRetry = false,
  setupFailure = false,
}) {
  if (loading || (user && configured && !profileLoaded)) return "loading";
  if (googleSignupRetry) return "googleSignupRetry";
  if (setupFailure) return "setupFailed";
  if (authSetupInProgress) return "loading";
  if (!user || !configured || !profile) return "signIn";

  const passwordProvider = profile.authProvider === "password"
    || user.providerData?.some((provider) => provider.providerId === "password");
  if (passwordProvider && user.emailVerified === false) return "verifyEmail";

  if (profile.setupComplete === false) return "roleSetup";
  if (profile.role === "elder" && !profile.setupComplete && !profile.roomLocation) {
    return "roleSetup";
  }
  if (profile.role === "elder") return "elderHome";
  if (profile.role === "caretaker") return "caretakerHome";
  if (profile.role === "volunteer") return "volunteerHome";
  return "signIn";
}

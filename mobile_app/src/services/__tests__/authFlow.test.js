jest.mock("expo-crypto", () => ({
  getRandomBytes: (length) => new Uint8Array(length).fill(0),
}));

import {
  decideAuthRoute,
  friendlyAuthError,
  googleAccountRoleLabel,
  normalizePhone,
  pendingProfileSetupForEmail,
  resolveProfileName,
  validateEmail,
  validateName,
  validatePassword,
  validatePhone,
  validateRoom,
} from "../authFlow";
import { generatePairingCode, generateUniquePairingCode } from "../pairingCodes";

describe("account field validation", () => {
  test("requires a two-character name", () => {
    expect(validateName("A")).toBeTruthy();
    expect(validateName("Mina")).toBeNull();
  });

  describe("Google account profile names", () => {
    test("uses a valid entered name before the Google profile name", () => {
      expect(resolveProfileName("  Mina Elder ", {
        displayName: "Google Name",
        email: "mina@example.com",
      })).toBe("Mina Elder");
    });

    test("does not require manual input when Google provides a name", () => {
      expect(resolveProfileName("", {
        displayName: "Google Name",
        email: "mina@example.com",
      })).toBe("Google Name");
    });

    test("falls back to the email name or a safe generic name", () => {
      expect(resolveProfileName("", { email: "mina@example.com" })).toBe("mina");
      expect(resolveProfileName("", {})).toBe("Google member");
    });
  });

  test("checks email, password and room values", () => {
    expect(validateEmail("not-an-email")).toBeTruthy();
    expect(validateEmail("mina@example.com")).toBeNull();
    expect(validatePassword("short")).toBeTruthy();
    expect(validatePassword("long-enough")).toBeNull();
    expect(validateRoom("  ")).toBeTruthy();
    expect(validateRoom("Room 204")).toBeNull();
  });

  test("normalizes local phone numbers and requires valid contact details", () => {
    expect(normalizePhone("(415) 555-2671", "US")).toBe("+14155552671");
    expect(validatePhone("", "US")).toBeTruthy();
    expect(validatePhone("", "US", false)).toBeNull();
    expect(validatePhone("123", "US")).toBeTruthy();
  });
});

describe("pending email profile recovery", () => {
  const savedDraft = {
    stage: "account",
    email: "caretaker@example.com",
    name: "Care Taker",
    role: "caretaker",
  };

  test("recovers only when the sign-in email matches the saved signup email", () => {
    expect(pendingProfileSetupForEmail(" CareTaker@Example.com ", savedDraft, null))
      .toMatchObject({ role: "caretaker", name: "Care Taker" });
    expect(pendingProfileSetupForEmail("someone@example.com", savedDraft, null)).toBeNull();
  });

  test("uses a matching profile-creation failure before a stale draft", () => {
    const failure = {
      stage: "profile",
      provider: "password",
      email: "caretaker@example.com",
      name: "Saved Failure",
      role: "volunteer",
    };
    expect(pendingProfileSetupForEmail("caretaker@example.com", savedDraft, failure))
      .toMatchObject({ name: "Saved Failure", role: "volunteer" });
  });

  test("does not resume unrelated failures or invalid roles", () => {
    expect(pendingProfileSetupForEmail("caretaker@example.com", null, {
      stage: "verification",
      provider: "password",
      email: "caretaker@example.com",
      role: "caretaker",
    })).toBeNull();
    expect(pendingProfileSetupForEmail("caretaker@example.com", {
      ...savedDraft,
      role: "admin",
    }, null)).toBeNull();
  });
});

describe("friendly authentication errors", () => {
  test.each([
    ["auth/email-already-in-use", "An account already uses this email. Sign in instead."],
    ["auth/invalid-email", "That email address is not valid."],
    ["auth/weak-password", "Choose a password with at least 8 characters."],
    ["auth/user-not-found", "No account was found with that email."],
    ["auth/wrong-password", "That email and password do not match."],
    ["auth/invalid-credential", "That email and password do not match."],
    ["auth/too-many-requests", "Too many attempts. Please wait a moment and try again."],
    ["auth/network-request-failed", "You appear to be offline. Check your connection and try again."],
    ["auth/popup-closed-by-user", "Google sign-in was cancelled."],
    ["auth/account-exists-with-different-credential", "An account already exists with this email. Sign in using its original method."],
    ["firestore/permission-denied", "The account service rejected the profile save. Please contact support or try again later."],
    ["firestore/unavailable", "The account service is temporarily unavailable. Please try again."],
  ])("maps %s to a safe message", (code, message) => {
    expect(friendlyAuthError(code)).toBe(message);
  });

  test("does not show raw Firebase details for unknown errors", () => {
    expect(friendlyAuthError("auth/unexpected-secret")).toBe(
      "We could not complete that request. Please try again."
    );
  });
});

describe("Google account conflict role labels", () => {
  test.each([
    ["elder", "older adult"],
    ["elderly", "older adult"],
    ["older_adult", "older adult"],
    ["caretaker", "caretaker"],
    ["volunteer", "volunteer"],
    [undefined, "existing account"],
  ])("maps %s to %s", (role, label) => {
    expect(googleAccountRoleLabel(role)).toBe(label);
  });
});

describe("pairing codes", () => {
  test("uses the SAFE-XXXX format and excludes ambiguous characters", () => {
    const code = generatePairingCode((length) => new Uint8Array(length).fill(0));
    expect(code).toMatch(/^SAFE-[A-HJ-KM-NP-Z2-9]{4}$/);
  });

  test("checks collisions and retries until a code is available", async () => {
    const sequence = ["SAFE-AAAA", "SAFE-BBBB"];
    const isAvailable = jest.fn(async (code) => code === "SAFE-BBBB");
    const code = await generateUniquePairingCode(
      isAvailable,
      3,
      () => sequence.shift()
    );
    expect(code).toBe("SAFE-BBBB");
    expect(isAvailable).toHaveBeenCalledTimes(2);
  });

  test("reports exhaustion instead of returning a colliding code", async () => {
    await expect(generateUniquePairingCode(async () => false, 2, () => "SAFE-AAAA"))
      .rejects.toThrow("unique pairing code");
  });
});

describe("navigator decision", () => {
  const user = { emailVerified: true, providerData: [{ providerId: "password" }] };

  test("routes signed-out users to sign in", () => {
    expect(decideAuthRoute({ user: null, profile: null, profileLoaded: true })).toBe("signIn");
  });

  test("resumes signup only when explicitly requested", () => {
    expect(decideAuthRoute({
      user: null,
      profile: null,
      profileLoaded: true,
      googleSignupRetry: true,
    })).toBe("googleSignupRetry");
    expect(decideAuthRoute({
      user,
      profile: { role: "elder", setupComplete: true },
      profileLoaded: true,
      googleSignupRetry: true,
    })).toBe("googleSignupRetry");
    expect(decideAuthRoute({
      user: null,
      profile: null,
      profileLoaded: true,
      googleSignupRetry: false,
      googleConflict: true,
    })).toBe("signIn");
  });

  test("waits for profiles and resumes email verification", () => {
    expect(decideAuthRoute({ user, profile: null, configured: true, profileLoaded: false })).toBe("loading");
    expect(decideAuthRoute({
      user: { ...user, emailVerified: false },
      profile: { authProvider: "password" },
      profileLoaded: true,
    })).toBe("verifyEmail");
  });

  test("keeps the app on loading while a new auth account is writing its profile", () => {
    expect(decideAuthRoute({
      user,
      profile: null,
      profileLoaded: true,
      authSetupInProgress: true,
    })).toBe("loading");
    expect(decideAuthRoute({
      user,
      profile: null,
      profileLoaded: true,
      authSetupInProgress: true,
      setupFailure: true,
    })).toBe("setupFailed");
  });

  test("routes incomplete setup and every completed role", () => {
    expect(decideAuthRoute({ user, profile: { role: "elder", setupComplete: false }, profileLoaded: true })).toBe("roleSetup");
    expect(decideAuthRoute({ user, profile: { role: "elder", setupComplete: true }, profileLoaded: true })).toBe("elderHome");
    expect(decideAuthRoute({ user, profile: { role: "caretaker", setupComplete: true }, profileLoaded: true })).toBe("caretakerHome");
    expect(decideAuthRoute({ user, profile: { role: "volunteer", setupComplete: true }, profileLoaded: true })).toBe("volunteerHome");
    expect(decideAuthRoute({ user, profile: { role: "caretaker", setupComplete: false }, profileLoaded: true })).toBe("roleSetup");
  });

  test("does not lock legacy Google users behind email verification", () => {
    expect(decideAuthRoute({
      user: { emailVerified: false, providerData: [{ providerId: "google.com" }] },
      profile: { role: "volunteer", authProvider: "google" },
      profileLoaded: true,
    })).toBe("volunteerHome");
  });
});

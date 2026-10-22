jest.mock("firebase/auth", () => ({
  parseActionCodeURL: jest.fn(),
}));

import { parseActionCodeURL } from "firebase/auth";
import {
  EMAIL_VERIFICATION_CONTINUE_URL,
  EMAIL_VERIFICATION_ACTION_SETTINGS,
  getEmailVerificationActionCode,
  isEmailVerificationContinuationLink,
} from "../emailActionLinks";

describe("email verification app links", () => {
  beforeEach(() => {
    parseActionCodeURL.mockImplementation((link) => {
      if (link.includes("mode=verifyEmail")) {
        return { operation: "VERIFY_EMAIL", code: "verification-code" };
      }
      if (link.includes("mode=resetPassword")) {
        return { operation: "PASSWORD_RESET", code: "reset-code" };
      }
      return null;
    });
  });

  it("uses in-app verification links for the installed Android package", () => {
    expect(EMAIL_VERIFICATION_ACTION_SETTINGS).toMatchObject({
      handleCodeInApp: true,
      android: {
        packageName: "com.insight.fallsafety",
        installApp: false,
      },
    });
  });

  it("extracts verification codes but ignores other Firebase action links", () => {
    const verifyLink =
      "https://insight-fall-safety.firebaseapp.com/__/auth/action?apiKey=test-api-key&mode=verifyEmail&oobCode=verification-code";
    const resetLink =
      "https://insight-fall-safety.firebaseapp.com/__/auth/action?apiKey=test-api-key&mode=resetPassword&oobCode=reset-code";

    expect(getEmailVerificationActionCode(verifyLink)).toBe("verification-code");
    expect(getEmailVerificationActionCode(resetLink)).toBeNull();
    expect(getEmailVerificationActionCode("not-a-link")).toBeNull();
  });

  it("recognizes only the configured verification continuation URL", () => {
    expect(isEmailVerificationContinuationLink(EMAIL_VERIFICATION_CONTINUE_URL)).toBe(true);
    expect(isEmailVerificationContinuationLink(`${EMAIL_VERIFICATION_CONTINUE_URL}?source=email`)).toBe(true);
    expect(isEmailVerificationContinuationLink(`${EMAIL_VERIFICATION_CONTINUE_URL}-other`)).toBe(false);
  });
});

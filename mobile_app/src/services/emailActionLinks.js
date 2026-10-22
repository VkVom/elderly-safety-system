import { parseActionCodeURL } from "firebase/auth";

export const EMAIL_VERIFICATION_CONTINUE_URL =
  "https://insight-fall-safety.firebaseapp.com/email-verified";

export const EMAIL_VERIFICATION_ACTION_SETTINGS = {
  url: EMAIL_VERIFICATION_CONTINUE_URL,
  handleCodeInApp: true,
  android: {
    packageName: "com.insight.fallsafety",
    installApp: false,
  },
};

export function getEmailVerificationActionCode(link) {
  const actionCodeUrl = parseActionCodeURL(link);
  return actionCodeUrl?.operation === "VERIFY_EMAIL" ? actionCodeUrl.code : null;
}

export function isEmailVerificationContinuationLink(link) {
  return link === EMAIL_VERIFICATION_CONTINUE_URL ||
    link.startsWith(`${EMAIL_VERIFICATION_CONTINUE_URL}?`) ||
    link.startsWith(`${EMAIL_VERIFICATION_CONTINUE_URL}#`);
}

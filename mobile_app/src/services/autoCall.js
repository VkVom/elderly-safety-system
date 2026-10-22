import { PermissionsAndroid, Platform } from "react-native";

// Native module lives in mobile_app/modules/insight-call (local Expo module).
// Guarded require: older binaries lack it and must keep working with OTA JS.
let InsightCall = null;
try {
  InsightCall = require("../../modules/insight-call").default;
} catch (e) {
  InsightCall = null;
}

export function callSupportAvailable() {
  return Boolean(InsightCall);
}

/**
 * Runtime permissions for the auto-call chain.
 *  - CALL_PHONE: place the automatic call.
 *  - READ_PHONE_STATE: watch for the incoming callback (auto-answer).
 *  - ANSWER_PHONE_CALLS (elder only): answer the caretaker's callback.
 */
export async function ensureCallPermissions({ needAnswer = false } = {}) {
  if (Platform.OS !== "android" || !InsightCall) return false;
  const perms = [
    PermissionsAndroid.PERMISSIONS.CALL_PHONE,
    PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
  ];
  if (needAnswer && PermissionsAndroid.PERMISSIONS.ANSWER_PHONE_CALLS) {
    perms.push(PermissionsAndroid.PERMISSIONS.ANSWER_PHONE_CALLS);
  }
  try {
    const res = await PermissionsAndroid.requestMultiple(perms);
    return perms.every((p) => res[p] === PermissionsAndroid.RESULTS.GRANTED);
  } catch (e) {
    return false;
  }
}

export async function placeCall(number) {
  if (!InsightCall || !number) return false;
  try {
    return await InsightCall.placeCall(String(number).trim());
  } catch (e) {
    return false;
  }
}

/** Arm auto-answer for a limited window (episode-scoped, elder side only). */
export async function armAutoAnswer(windowMs = 180000) {
  if (!InsightCall) return false;
  try {
    return await InsightCall.armAutoAnswer(windowMs);
  } catch (e) {
    return false;
  }
}

export async function disarmAutoAnswer() {
  if (!InsightCall) return false;
  try {
    return await InsightCall.disarmAutoAnswer();
  } catch (e) {
    return false;
  }
}

"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000;
const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const ACTIVE_ALERT_STATUSES = new Set(["CREATED", "WARNING", "CONFIRMED"]);

function isResponderActive(response) {
  return response && ["ON_THE_WAY", "ARRIVED"].includes(response.status);
}

function responseChanged(before, after) {
  return before?.uid !== after?.uid || before?.status !== after?.status;
}

function profilePushTokens(profile) {
  return [...new Set([
    profile && profile.expoPushToken,
    profile && profile.pushToken,
    ...(Array.isArray(profile && profile.pushTokens) ? profile.pushTokens : []),
  ].filter((token) => typeof token === "string" && token.startsWith("ExponentPushToken[")))];
}

async function userPushTokens(uid) {
  if (!uid) return [];
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? profilePushTokens(snap.data()) : [];
}

async function volunteerPushTargets(excludedUid) {
  const snap = await db.collection("volunteer_directory")
    .where("onDuty", "==", true)
    .get();
  return snap.docs
    .map((doc) => ({ uid: doc.id, token: doc.data().expoPushToken }))
    .filter((target) => target.uid !== excludedUid
      && typeof target.token === "string"
      && target.token.startsWith("ExponentPushToken["));
}

async function sendExpoPushes(targets, alert, eventId, title, body) {
  const uniqueTargets = new Map();
  for (const target of targets) {
    if (target && target.token) uniqueTargets.set(target.token, target);
  }

  if (uniqueTargets.size === 0) {
    console.warn(`No registered push recipients for alert ${alert.id} (${eventId}).`);
    return;
  }

  for (const [token] of uniqueTargets) {
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        to: token,
        title,
        body,
        sound: "default",
        priority: "high",
        channelId: "emergency-alerts-v4",
        data: {
          alertId: alert.id,
          eventType: "ALERT_RESPONSE_UPDATE",
          responseEventId: eventId,
        },
      }),
    });
    const result = await response.json();
    const tickets = Array.isArray(result.data) ? result.data : [result.data];
    if (!response.ok || tickets.some((ticket) => ticket && ticket.status === "error")) {
      throw new Error(`Expo push failed for alert ${alert.id}: ${JSON.stringify(result)}`);
    }
  }
}

exports.notifyAlertResponseChanges = onDocumentUpdated({
  document: "alerts/{alertId}",
  region: "us-central1",
  retry: true,
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const caretakerChanged = responseChanged(before.caretakerResponse, after.caretakerResponse);
  const volunteerChanged = responseChanged(before.volunteerResponse, after.volunteerResponse);
  const caretakerStarted = caretakerChanged
    && isResponderActive(after.caretakerResponse)
    && !isResponderActive(before.caretakerResponse);
  const volunteerStarted = volunteerChanged
    && isResponderActive(after.volunteerResponse)
    && !isResponderActive(before.volunteerResponse);
  const caretakerArrived = caretakerChanged && after.caretakerResponse?.status === "ARRIVED";
  const volunteerArrived = volunteerChanged && after.volunteerResponse?.status === "ARRIVED";
  const caretakerStoodDown = caretakerChanged && after.caretakerResponse?.status === "STOOD_DOWN";
  const volunteerStoodDown = volunteerChanged && after.volunteerResponse?.status === "STOOD_DOWN";
  const becameTerminal = ACTIVE_ALERT_STATUSES.has(before.status)
    && !ACTIVE_ALERT_STATUSES.has(after.status);

  if (
    !caretakerStarted
    && !volunteerStarted
    && !caretakerArrived
    && !volunteerArrived
    && !caretakerStoodDown
    && !volunteerStoodDown
    && !becameTerminal
  ) return;

  const alert = { id: event.params.alertId, ...after };
  const recipients = [];
  let title = "Emergency response update";
  let body = `${alert.elderName || "Resident"} · ${alert.roomLocation || "Location unavailable"}`;

  if (becameTerminal) {
    title = after.status === "RESOLVED" ? "Alert resolved" : "Alert closed";
    body = `${alert.elderName || "Resident"}'s alert was closed by ${after.resolvedByName || "a responder"}.`;
    const responderUids = new Set([
      before.caretakerResponse && before.caretakerResponse.uid,
      before.volunteerResponse && before.volunteerResponse.uid,
    ].filter((uid) => uid && uid !== after.resolvedByUid));
    for (const uid of responderUids) {
      const tokens = await userPushTokens(uid);
      recipients.push(...tokens.map((token) => ({ uid, token })));
    }
    if (after.escalatedToVolunteers) {
      const targets = await volunteerPushTargets(after.resolvedByUid);
      recipients.push(...targets);
    }
  } else if (volunteerStarted || volunteerArrived) {
    title = volunteerArrived ? "Volunteer has arrived" : "A volunteer is responding";
    body = volunteerArrived
      ? `${after.volunteerResponse.name || "A volunteer"} has arrived for ${alert.elderName || "the resident"}.`
      : `${after.volunteerResponse.name || "A volunteer"} is on the way to ${alert.elderName || "the resident"}.`;
    const tokens = await userPushTokens(after.assignedCaretakerId);
    recipients.push(...tokens.map((token) => ({ uid: after.assignedCaretakerId, token })));
  } else if (caretakerStarted || caretakerArrived) {
    if (isResponderActive(after.volunteerResponse)) {
      title = caretakerArrived ? "Caretaker has arrived" : "Caretaker also responding";
      body = caretakerArrived
        ? `${after.caretakerResponse.name || "The caretaker"} has arrived. Your volunteer response remains active.`
        : `${after.caretakerResponse.name || "The caretaker"} has joined the response. You remain marked as on the way.`;
      const tokens = await userPushTokens(after.volunteerResponse.uid);
      recipients.push(...tokens.map((token) => ({ uid: after.volunteerResponse.uid, token })));
    } else if (after.escalatedToVolunteers) {
      title = caretakerArrived ? "Caretaker has arrived" : "Caretaker is responding";
      body = caretakerArrived
        ? `${after.caretakerResponse.name || "The caretaker"} has arrived for ${alert.elderName || "the resident"}.`
        : `${after.caretakerResponse.name || "The caretaker"} has accepted ${alert.elderName || "the resident"}'s alert. No volunteer action is needed.`;
      recipients.push(...await volunteerPushTargets());
    }
  } else if (volunteerStoodDown) {
    title = "Volunteer response update";
    body = `${after.volunteerResponse.name || "The volunteer"} can no longer respond to ${alert.elderName || "the resident"}'s alert.`;
    const tokens = await userPushTokens(after.assignedCaretakerId);
    recipients.push(...tokens.map((token) => ({ uid: after.assignedCaretakerId, token })));
    recipients.push(...await volunteerPushTargets(after.volunteerResponse.uid));
  } else if (caretakerStoodDown && after.escalatedToVolunteers) {
    title = "Volunteer help needed";
    body = `${after.caretakerResponse.name || "The caretaker"} can no longer respond to ${alert.elderName || "the resident"}'s alert.`;
    if (isResponderActive(after.volunteerResponse)) {
      const tokens = await userPushTokens(after.volunteerResponse.uid);
      recipients.push(...tokens.map((token) => ({ uid: after.volunteerResponse.uid, token })));
    } else {
      recipients.push(...await volunteerPushTargets());
    }
  }

  await sendExpoPushes(recipients, alert, event.id, title, body);
});

function cleanCode(code) {
  return String(code || "").trim().toUpperCase();
}

function rateLimitKey(request) {
  const uid = request.auth && request.auth.uid ? request.auth.uid : "anon";
  const ip = request.rawRequest && request.rawRequest.ip ? request.rawRequest.ip : "unknown";
  return `${uid}_${ip}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 180);
}

async function enforceRateLimit(request) {
  const ref = db.collection("pairingAttempts").doc(rateLimitKey(request));
  const now = admin.firestore.Timestamp.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const windowStart = data.windowStart;
    const ageMs = windowStart ? now.toMillis() - windowStart.toMillis() : WINDOW_MS + 1;
    const count = ageMs < WINDOW_MS ? Number(data.count || 0) : 0;
    if (count >= MAX_ATTEMPTS) {
      throw new HttpsError("resource-exhausted", "Too many pairing attempts. Try again in one minute.");
    }
    tx.set(ref, {
      count: count + 1,
      windowStart: ageMs < WINDOW_MS && windowStart ? windowStart : now,
      lastAttemptAt: now,
      uid: request.auth && request.auth.uid ? request.auth.uid : null,
    }, { merge: true });
  });
}

function publicElder(elderId, elder) {
  return {
    id: elderId,
    name: elder.name || "Resident",
    roomLocation: elder.roomLocation || null,
  };
}

exports.pairElderWithCaretaker = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in before pairing.");
  }

  await enforceRateLimit(request);

  const caretakerId = request.auth.uid;
  const code = cleanCode(request.data && request.data.code);
  const previewOnly = Boolean(request.data && request.data.previewOnly);
  if (!/^SAFE-[A-Z2-9]{4}$/.test(code)) {
    throw new HttpsError("invalid-argument", "Enter a valid SAFE-XXXX pairing code.");
  }

  const caretakerRef = db.collection("users").doc(caretakerId);
  const caretakerSnap = await caretakerRef.get();
  if (!caretakerSnap.exists || caretakerSnap.data().role !== "caretaker") {
    throw new HttpsError("permission-denied", "Only caretaker accounts can pair with an elder.");
  }

  const elderQuery = await db.collection("users")
    .where("role", "==", "elder")
    .where("pairingCode", "==", code)
    .limit(1)
    .get();

  if (elderQuery.empty) {
    throw new HttpsError("not-found", "No resident found for that code. Check and try again.");
  }

  const elderDoc = elderQuery.docs[0];
  const elder = elderDoc.data();
  if (previewOnly) {
    return { ok: true, elder: publicElder(elderDoc.id, elder) };
  }

  const caretaker = caretakerSnap.data();
  await db.runTransaction(async (tx) => {
    tx.update(elderDoc.ref, {
      caretakerId,
      caretakerName: caretaker.name || "Caretaker",
      caretakerPhone: caretaker.phone || null,
      updatedAt: new Date().toISOString(),
    });
    tx.update(caretakerRef, {
      assignedElderId: elderDoc.id,
      assignedElderName: elder.name || "Resident",
      assignedElderRoom: elder.roomLocation || null,
      updatedAt: new Date().toISOString(),
    });
  });

  return { ok: true, elder: publicElder(elderDoc.id, elder) };
});

import { arrayUnion, doc, runTransaction } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../config/firebase";

const ACTIVE_STATUSES = new Set(["CREATED", "WARNING", "CONFIRMED"]);
const TERMINAL_STATUSES = new Set(["RESOLVED", "RESOLVED_FALSE_ALARM", "AUTO_CANCELLED"]);
const RESPONSE_FIELDS = {
  caretaker: "caretakerResponse",
  volunteer: "volunteerResponse",
};
const ACTIVE_RESPONSE_STATUSES = new Set(["ON_THE_WAY", "ARRIVED"]);

export function getVolunteerUpdateLabel(alert, uid) {
  if (!ACTIVE_STATUSES.has(alert?.status)) {
    return `Alert closed · ${alert?.resolvedByName || "No responder recorded"}`;
  }
  if (alert?.caretakerResponse && ACTIVE_RESPONSE_STATUSES.has(alert.caretakerResponse.status)) {
    return `Caretaker ${alert.caretakerResponse.name || "is responding"} · no volunteer action needed`;
  }
  if (alert?.volunteerResponse?.uid === uid && alert.volunteerResponse.status === "STOOD_DOWN") {
    return "You stood down · alert remains open";
  }
  if (alert?.volunteerResponse && ACTIVE_RESPONSE_STATUSES.has(alert.volunteerResponse.status)) {
    return `${alert.volunteerResponse.name || "Another volunteer"} is responding`;
  }
  return "Response update";
}
export function classifyVolunteerAlert(alert, uid, onDuty) {
  if (!ACTIVE_STATUSES.has(alert?.status)) return "closed";

  const volunteer = alert?.volunteerResponse;
  const caretaker = alert?.caretakerResponse;
  const isActive = (response) => response && ACTIVE_RESPONSE_STATUSES.has(response.status);
  if (volunteer?.uid === uid && isActive(volunteer)) {
    return "responding";
  }
  if (
    isActive(caretaker)
    || (volunteer?.uid !== uid && isActive(volunteer))
    || (volunteer?.uid === uid && volunteer.status === "STOOD_DOWN")
  ) {
    return "handled";
  }
  return onDuty ? "actionable" : "hidden";
}

export function buildAlertResponsePatch(alert, actor, action, now, eventId) {
  if (!alert || !actor?.uid || !RESPONSE_FIELDS[actor.role]) {
    throw new Error("A signed-in caretaker or volunteer is required.");
  }
  if (TERMINAL_STATUSES.has(alert.status)) {
    throw new Error("This alert has already been closed.");
  }
  if (!ACTIVE_STATUSES.has(alert.status)) {
    throw new Error("This alert is not currently active.");
  }

  const field = RESPONSE_FIELDS[actor.role];
  const currentResponse = alert[field] || null;

  if (actor.role === "caretaker" && alert.assignedCaretakerId !== actor.uid) {
    throw new Error("Only the assigned caretaker can respond to this alert.");
  }
  if (actor.role === "volunteer" && !alert.escalatedToVolunteers) {
    throw new Error("This alert has not been escalated to volunteers.");
  }

  if (action === "accept") {
    if (actor.role === "volunteer" && alert.caretakerResponse?.status === "ON_THE_WAY") {
      throw new Error("The caretaker is already responding to this alert.");
    }
    if (currentResponse?.status === "ON_THE_WAY" || currentResponse?.status === "ARRIVED") {
      if (currentResponse.uid === actor.uid) return { changed: false };
      throw new Error("Another responder from your role has already accepted this alert.");
    }
  } else if (action === "arrive" || action === "stand_down") {
    if (!currentResponse || currentResponse.uid !== actor.uid) {
      throw new Error("You must accept this alert before updating your response.");
    }
    if (currentResponse.status !== "ON_THE_WAY") {
      throw new Error("This response is no longer on the way.");
    }
  } else if (action === "resolve") {
    if (currentResponse?.uid !== actor.uid || currentResponse.status !== "ARRIVED") {
      throw new Error("Mark yourself as arrived before confirming the resident is safe.");
    }
  } else {
    throw new Error("Unsupported alert response action.");
  }

  const response = action === "accept"
    ? {
      uid: actor.uid,
      name: actor.name || (actor.role === "caretaker" ? "Caretaker" : "Volunteer"),
      role: actor.role,
      status: "ON_THE_WAY",
      acceptedAt: now,
      updatedAt: now,
    }
    : action === "arrive" || action === "stand_down"
      ? {
        ...currentResponse,
        status: action === "arrive" ? "ARRIVED" : "STOOD_DOWN",
        updatedAt: now,
        ...(action === "arrive" ? { arrivedAt: now } : { stoodDownAt: now }),
      }
      : currentResponse;

  const responseEvent = {
    id: eventId,
    action,
    actorUid: actor.uid,
    actorName: actor.name || (actor.role === "caretaker" ? "Caretaker" : "Volunteer"),
    actorRole: actor.role,
    timestamp: now,
  };

  const patch = {
    [field]: response,
    responseEvent,
    updatedAt: now,
  };

  if (action === "accept") {
    patch.acknowledgedBy = alert.acknowledgedBy || actor.uid;
  } else if (action === "resolve") {
    patch.status = "RESOLVED";
    patch.resolvedAt = now;
    patch.resolvedByUid = actor.uid;
    patch.resolvedByRole = actor.role;
    patch.resolvedByName = actor.name || (actor.role === "caretaker" ? "Caretaker" : "Volunteer");
  }

  return { changed: true, patch };
}

export function buildElderSafePatch(alert, actor, now, eventId) {
  if (!alert || !actor?.uid || actor.role !== "elder" || alert.elderId !== actor.uid) {
    throw new Error("Only the resident who owns this alert can mark it safe.");
  }
  if (!ACTIVE_STATUSES.has(alert.status)) {
    throw new Error("This alert is no longer active.");
  }

  const name = actor.name || "Resident";
  const responseEvent = {
    id: eventId,
    action: "mark_safe",
    actorUid: actor.uid,
    actorName: name,
    actorRole: "elder",
    timestamp: now,
  };
  const status = alert.status === "WARNING" ? "AUTO_CANCELLED" : "RESOLVED";
  return {
    status,
    resolvedAt: now,
    resolvedByUid: actor.uid,
    resolvedByRole: "elder",
    resolvedByName: name,
    elderConfirmation: { uid: actor.uid, name, status: "SAFE", timestamp: now },
    updatedAt: now,
    responseEvent,
  };
}

export async function updateAlertResponse(alertId, user, profile, action) {
  if (!isFirebaseConfigured || !alertId || !user?.uid || !profile?.role) {
    throw new Error("The alert response could not be saved. Please check your connection and try again.");
  }

  const actor = { uid: user.uid, role: profile.role, name: profile.name };
  const now = new Date().toISOString();
  const eventId = `${user.uid}-${action}-${Date.now()}`;
  const ref = doc(db, "alerts", alertId);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("This alert is no longer available.");

    const result = buildAlertResponsePatch(snapshot.data(), actor, action, now, eventId);
    if (!result.changed) return { ...snapshot.data(), id: snapshot.id };

    const { responseEvent, ...patch } = result.patch;
    transaction.update(ref, {
      ...patch,
      responseEvents: arrayUnion(responseEvent),
    });
    return { ...snapshot.data(), ...patch, responseEvents: [...(snapshot.data().responseEvents || []), responseEvent] };
  });
}

export async function markAlertSafeByElder(alertId, user, profile) {
  if (!isFirebaseConfigured || !alertId || !user?.uid || profile?.role !== "elder") {
    throw new Error("The alert could not be updated. Please check your connection and try again.");
  }

  const actor = { uid: user.uid, role: profile.role, name: profile.name };
  const now = new Date().toISOString();
  const responseEvent = {
    id: `${user.uid}-mark_safe-${Date.now()}`,
    action: "mark_safe",
    actorUid: actor.uid,
    actorName: actor.name || "Resident",
    actorRole: "elder",
    timestamp: now,
  };
  const ref = doc(db, "alerts", alertId);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("This alert is no longer available.");

    const alert = snapshot.data();
    const patch = buildElderSafePatch(alert, actor, now, responseEvent.id);
    delete patch.responseEvent;
    transaction.update(ref, {
      ...patch,
      responseEvents: arrayUnion(responseEvent),
    });
    return {
      ...alert,
      ...patch,
      responseEvents: [...(alert.responseEvents || []), responseEvent],
    };
  });
}

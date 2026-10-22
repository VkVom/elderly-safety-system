// Role-linking service.
//
// Model:
//  - The ELDER is the anchor and owns a 10-character high-entropy SAFE code.
//  - A CARETAKER links by entering that code. Linking writes BOTH directions:
//      elder.users doc     -> caretakerId, caretakerName
//      caretaker.users doc -> assignedElderIds[], assignedElderId/Name/Room (first resident)
//    so each side knows the other, and alerts can be routed by caretakerId.
//  - ONE caretaker can look after MULTIPLE elders (assignedElderIds is the source of
//    truth; the singular assignedElderId/Name/Room mirror the FIRST linked resident
//    for backward compatibility with older app builds).
//  - Each elder still has one primary caretaker (re-linking replaces the previous one).
//  - Volunteers are community-wide and do NOT link by code.

import {
  collection, query, where, limit, getDocs, doc, getDoc, updateDoc, writeBatch,
  arrayUnion, arrayRemove,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { generatePairingCode, generateUniquePairingCode } from "./pairingCodes";

export { generatePairingCode };

/** Elder IDs this caretaker is responsible for. Multi-elder aware + legacy compatible. */
export function linkedElderIds(profile) {
  if (!profile) return [];
  const multi = Array.isArray(profile.assignedElderIds)
    ? profile.assignedElderIds.filter(Boolean)
    : [];
  if (multi.length) return multi;
  return profile.assignedElderId ? [profile.assignedElderId] : [];
}

/** Find an elder user doc by pairing code. Returns { id, ...data } or null. */
export async function findElderByCode(code) {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) return null;
  const q = query(collection(db, "users"), where("role", "==", "elder"), where("pairingCode", "==", clean), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

/**
 * Link a caretaker to an elder by pairing code. Writes both user docs atomically.
 * Multi-elder: appends to assignedElderIds (idempotent via arrayUnion). The singular
 * assignedElderId/Name/Room mirror the FIRST resident only.
 * Returns { ok, elder, alreadyLinked } or { ok:false, error }.
 */
export async function linkCaretakerByCode(caretaker, code) {
  const elder = await findElderByCode(code);
  if (!elder) return { ok: false, error: "No resident found for that code. Check and try again." };

  // Read our own profile to know whether this is the first resident (primary mirror).
  let existing = {};
  try {
    const snap = await getDoc(doc(db, "users", caretaker.uid));
    existing = snap.exists() ? snap.data() : {};
  } catch (e) {}
  const currentIds = linkedElderIds(existing);
  const isFirst = currentIds.length === 0;
  const alreadyLinked = currentIds.includes(elder.id);

  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.update(doc(db, "users", elder.id), {
    caretakerId: caretaker.uid,
    caretakerName: caretaker.name || "Caretaker",
    caretakerPhone: caretaker.phone || null,
    // Mirror of the caretaker's Expo token so the elder's own SOS can push
    // directly to the caretaker even when the caretaker app is closed.
    caretakerPushToken: caretaker.pushToken || null,
    updatedAt: now,
  });
  const caretakerFields = {
    assignedElderIds: arrayUnion(elder.id),
    updatedAt: now,
  };
  if (isFirst) {
    caretakerFields.assignedElderId = elder.id;
    caretakerFields.assignedElderName = elder.name || "Resident";
    caretakerFields.assignedElderRoom = elder.roomLocation || null;
  }
  batch.update(doc(db, "users", caretaker.uid), caretakerFields);
  await batch.commit();
  return { ok: true, elder, alreadyLinked };
}

/**
 * Unlink ONE elder from a caretaker (clears the elder's side only if it still points
 * back at this caretaker). If the removed elder was the primary mirror, the next
 * linked resident becomes the new primary. Returns { ok } or { ok:false, error }.
 */
export async function unlinkCaretaker(caretaker, elderId) {
  const targetId = elderId || caretaker?.assignedElderId;
  if (!targetId) return { ok: false, error: "No resident to unlink." };

  const remaining = linkedElderIds(caretaker).filter((id) => id !== targetId);
  const nextPrimaryId = remaining[0] || null;

  // Resolve the next primary's display fields while we are still linked (the rules
  // only allow linked caretakers to read an elder's doc).
  let nextPrimary = null;
  if (nextPrimaryId) {
    try {
      const snap = await getDoc(doc(db, "users", nextPrimaryId));
      if (snap.exists()) nextPrimary = snap.data();
    } catch (e) {}
  }

  const batch = writeBatch(db);
  const caretakerFields = {
    assignedElderId: nextPrimaryId,
    assignedElderName: nextPrimary ? (nextPrimary.name || "Resident") : null,
    assignedElderRoom: nextPrimary ? (nextPrimary.roomLocation || null) : null,
    updatedAt: new Date().toISOString(),
  };
  if (Array.isArray(caretaker.assignedElderIds)) {
    caretakerFields.assignedElderIds = arrayRemove(targetId);
  } else {
    caretakerFields.assignedElderIds = remaining;  // migrate legacy single-link account
  }
  batch.update(doc(db, "users", caretaker.uid), caretakerFields);

  const elderSnap = await getDoc(doc(db, "users", targetId));
  // Only clear the elder's side if it still points back to this caretaker.
  if (elderSnap.exists() && elderSnap.data().caretakerId === caretaker.uid) {
    batch.update(doc(db, "users", targetId), {
      caretakerId: null, caretakerName: null, caretakerPhone: null,
      caretakerPushToken: null,
    });
  }
  await batch.commit();
  return { ok: true, remaining };
}

/** Ensure an elder has a pairing code; generate + persist if missing. Returns the code. */
export async function ensureElderPairingCode(uid, existing) {
  if (existing) return existing;
  const code = await generateUniquePairingCode(async (candidate) =>
    !(await findElderByCode(candidate))
  );
  await updateDoc(doc(db, "users", uid), { pairingCode: code });
  return code;
}

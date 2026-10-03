// Role-linking service.
//
// Model:
//  - The ELDER is the anchor and owns a short human-friendly pairing code (SAFE-4827).
//  - A CARETAKER links by entering that code. Linking writes BOTH directions:
//      elder.users doc     -> caretakerId, caretakerName
//      caretaker.users doc -> assignedElderId, assignedElderName
//    so each side knows the other, and alerts can be routed by caretakerId.
//  - One primary caretaker per elder (linking replaces any previous caretaker).
//  - Volunteers are community-wide and do NOT link by code.

import {
  collection, query, where, getDocs, doc, getDoc, updateDoc, writeBatch,
} from "firebase/firestore";
import { db } from "../config/firebase";

// Human-friendly code: SAFE-XXXX (no ambiguous chars like O/0/I/1).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generatePairingCode() {
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `SAFE-${s}`;
}

/** Find an elder user doc by pairing code. Returns { id, ...data } or null. */
export async function findElderByCode(code) {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) return null;
  const q = query(
    collection(db, "users"),
    where("role", "==", "elder"),
    where("pairingCode", "==", clean)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

/**
 * Link a caretaker to an elder by pairing code. Writes both user docs atomically.
 * Returns { ok, elder } or { ok:false, error }.
 */
export async function linkCaretakerByCode(caretaker, code) {
  const elder = await findElderByCode(code);
  if (!elder) return { ok: false, error: "No resident found for that code. Check and try again." };

  const batch = writeBatch(db);
  batch.update(doc(db, "users", elder.id), {
    caretakerId: caretaker.uid,
    caretakerName: caretaker.name || "Caretaker",
    caretakerPhone: caretaker.phone || null,
  });
  batch.update(doc(db, "users", caretaker.uid), {
    assignedElderId: elder.id,
    assignedElderName: elder.name || "Resident",
    assignedElderRoom: elder.roomLocation || null,
  });
  await batch.commit();
  return { ok: true, elder };
}

/** Unlink a caretaker from their elder (clears both sides). */
export async function unlinkCaretaker(caretaker) {
  const elderId = caretaker.assignedElderId;
  const batch = writeBatch(db);
  batch.update(doc(db, "users", caretaker.uid), {
    assignedElderId: null, assignedElderName: null, assignedElderRoom: null,
  });
  if (elderId) {
    const elderSnap = await getDoc(doc(db, "users", elderId));
    // Only clear the elder's side if it still points back to this caretaker.
    if (elderSnap.exists() && elderSnap.data().caretakerId === caretaker.uid) {
      batch.update(doc(db, "users", elderId), {
        caretakerId: null, caretakerName: null, caretakerPhone: null,
      });
    }
  }
  await batch.commit();
  return { ok: true };
}

/** Ensure an elder has a pairing code; generate + persist if missing. Returns the code. */
export async function ensureElderPairingCode(uid, existing) {
  if (existing) return existing;
  const code = generatePairingCode();
  await updateDoc(doc(db, "users", uid), { pairingCode: code });
  return code;
}

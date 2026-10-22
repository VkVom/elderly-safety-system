import { doc, setDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../config/firebase";

// Directory of on-duty volunteers and their push tokens. Volunteers maintain
// their own entry; the caretaker app reads it when an emergency is escalated so
// volunteers are paged even when their app is closed.
export async function syncVolunteerDirectory(user, profile, token) {
  if (!user || !profile || profile.role !== "volunteer") return;
  if (!token) return;
  try {
    await setDoc(
      doc(db, "volunteer_directory", user.uid),
      {
        uid: user.uid,
        name: profile.name || "Volunteer",
        expoPushToken: token,
        onDuty: profile.onDuty !== false,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (e) {}
}

export async function removeVolunteerDirectory(uid) {
  if (!uid) return;
  try {
    await deleteDoc(doc(db, "volunteer_directory", uid));
  } catch (e) {}
}

export async function listOnDutyVolunteers() {
  const snap = await getDocs(
    query(collection(db, "volunteer_directory"), where("onDuty", "==", true))
  );
  return snap.docs
    .map((d) => d.data())
    .filter((v) => v && v.expoPushToken && v.uid);
}

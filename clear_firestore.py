"""
Firestore cleanup utility — wipe test data for a clean slate.

Usage:
  python clear_firestore.py --alerts        # delete ALL alert documents
  python clear_firestore.py --users         # delete ALL user profile docs (Firestore only)
  python clear_firestore.py --all           # both

NOTE: deleting a user's Firestore profile does NOT delete their Firebase Auth login.
To fully remove accounts, also delete them in Firebase console → Authentication → Users
(or the app will recreate a profile-less user that gets routed to RoleSetup).
"""

import sys
from src.escalation import FirestoreSink


def wipe(collection):
    db = FirestoreSink()._db
    docs = list(db.collection(collection).stream())
    for d in docs:
        d.reference.delete()
    print(f"Deleted {len(docs)} document(s) from '{collection}'.")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(0)
    if "--all" in args or "--alerts" in args:
        wipe("alerts")
    if "--all" in args or "--users" in args:
        wipe("users")
    print("Done. Remember: Auth logins persist until deleted in the Firebase console.")

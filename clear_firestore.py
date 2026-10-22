"""
Firestore cleanup utility — wipe test data for a clean slate.

Usage:
  python clear_firestore.py --alerts      # delete ALL alert documents
  python clear_firestore.py --users       # delete ALL user profile docs (Firestore only)
  python clear_firestore.py --auth        # delete ALL Firebase Auth accounts (logins)
  python clear_firestore.py --all         # alerts + sos_alerts + users + auth

Uses the bundled firebase-service-account.json (Admin SDK), so Auth accounts
are fully removed — fresh signups start clean with no orphan profiles.
"""

import sys

from src.escalation import get_firestore_db


def wipe(collection):
    db = get_firestore_db()
    docs = list(db.collection(collection).stream())
    for d in docs:
        d.reference.delete()
    print(f"Deleted {len(docs)} document(s) from '{collection}'.")


def wipe_auth():
    import firebase_admin
    from firebase_admin import auth as fb_auth

    if not firebase_admin._apps:
        get_firestore_db()  # initializes the default app with the service account

    deleted = 0
    page = fb_auth.list_users()
    while page:
        for user in page.users:
            try:
                fb_auth.delete_user(user.uid)
                deleted += 1
            except Exception as e:  # keep going; report the stragglers
                print(f"  could not delete {user.uid}: {e}")
        page = page.get_next_page()
    print(f"Deleted {deleted} Firebase Auth account(s).")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(0)
    if "--all" in args or "--alerts" in args:
        wipe("alerts")
    if "--all" in args or "--sos" in args:
        wipe("sos_alerts")
    if "--all" in args or "--users" in args:
        wipe("users")
    if "--all" in args or "--auth" in args:
        wipe_auth()
    print("Done.")

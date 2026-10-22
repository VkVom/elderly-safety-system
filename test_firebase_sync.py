"""
Firebase sync test: injects a REAL alert into the live Firestore `alerts`
collection for a dynamically chosen elder, so the linked caretaker's phone pops
the alert modal. Also sends the real Expo push when a token is available.

Requires:
  - firebase-admin installed
  - firebase-service-account.json present in the project root (gitignored)

Usage:
    python test_firebase_sync.py                     # interactive elder picker
    python test_firebase_sync.py --elder SAFE-3BS2   # by code (or UID / name)
    python test_firebase_sync.py --caretaker <UID>   # force-routing override
    python test_firebase_sync.py --list              # list elders and exit
    python test_firebase_sync.py --clear             # delete test alerts

Exit codes: 0 = ok, 1 = failure.
"""

import argparse
import sys
from dataclasses import dataclass
from typing import Optional

from src.elder_picker import (
    PickerError, load_elders, pick_elder, print_elders_table, routing_banner,
    to_elder_context,
)
from src.escalation import (
    AlertGateway, DEFAULT_SERVICE_ACCOUNT, FirestoreExpoPushNotifier, FirestoreSink,
    get_firestore_db,
)


@dataclass
class _MockM4:
    alert: bool
    alert_type: Optional[str]


def inject(selection: Optional[str] = None, caretaker_override: Optional[str] = None) -> int:
    try:
        sink = FirestoreSink()
    except Exception as e:
        print(f"Firestore NOT available: {e}")
        print(f"  expected key at: {DEFAULT_SERVICE_ACCOUNT}")
        return 1
    if not sink.available:
        print("Firestore NOT available.")
        print("  reason:", getattr(sink, "_init_error", "unknown"))
        print(f"  expected key at: {DEFAULT_SERVICE_ACCOUNT}")
        return 1

    try:
        choice, _db = pick_elder(selection=selection, caretaker_override=caretaker_override)
    except PickerError as e:
        print(f"[firebase-sync] {e}")
        return 1

    print()
    print(routing_banner(choice))
    print()

    ctx = to_elder_context(choice)
    notifiers = []
    push = FirestoreExpoPushNotifier()
    if push.available:
        notifiers = [push]
    gw = AlertGateway(ctx, sinks=[sink], notifiers=notifiers)
    rec = gw.handle_m4(_MockM4(True, "FALL_IMPACT"), p_fall=0.97,
                       furniture_context="open_floor", now=0.0)
    if not rec:
        print("[firebase-sync] alert was suppressed (cooldown?) — nothing written.")
        return 1
    print(f"  wrote alertId={rec['alertId']}  status={rec['status']}  "
          f"for {rec['elderName']} ({rec['roomLocation']})")
    print("\nCheck the caretaker app (status == 'CREATED') to see it appear live.")
    return 0


def list_alerts() -> int:
    try:
        db = get_firestore_db()
    except Exception as e:
        print(f"Firestore NOT available: {e}")
        return 1
    docs = db.collection("alerts").limit(20).stream()
    n = 0
    for d in docs:
        a = d.to_dict() or {}
        n += 1
        print(f"  {a.get('timestamp')}  {str(a.get('eventType')):22s} "
              f"{str(a.get('status')):12s} {a.get('elderName')}")
    print(f"{n} alert(s) in Firestore.")
    return 0


def clear_test() -> int:
    try:
        db = get_firestore_db()
    except Exception as e:
        print(f"Firestore NOT available: {e}")
        return 1
    docs = db.collection("alerts").where("elderId", "in", ["ELDER_TEST"]).stream()
    n = 0
    for d in docs:
        d.reference.delete()
        n += 1
    print(f"Deleted {n} legacy test alert(s) (elderId=ELDER_TEST).")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Inject a test alert for a chosen elder.")
    ap.add_argument("--elder", help="elder UID, SAFE-XXXX pairing code, or name substring")
    ap.add_argument("--caretaker", help="force-route to this caretaker UID (debug override)")
    ap.add_argument("--list", action="store_true", help="list elders + caretakers and exit")
    ap.add_argument("--list-alerts", action="store_true", help="list recent alerts and exit")
    ap.add_argument("--clear", action="store_true", help="delete legacy ELDER_TEST alerts and exit")
    args = ap.parse_args()

    if args.list:
        try:
            db = get_firestore_db()
        except Exception as e:
            print(f"Firestore unavailable: {e}")
            return 1
        print_elders_table(load_elders(db))
        return 0
    if args.list_alerts:
        return list_alerts()
    if args.clear:
        return clear_test()
    return inject(selection=args.elder, caretaker_override=args.caretaker)


if __name__ == "__main__":
    sys.exit(main())

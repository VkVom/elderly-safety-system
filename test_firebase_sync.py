"""
Firebase sync test: injects a mock M4 alert into the live Firestore `alerts`
collection via the AlertGateway's FirestoreSink, then reads it back to confirm.

Requires:
  - firebase-admin installed (pip install firebase-admin)
  - firebase-service-account.json present in the project root (gitignored)

Usage:
    python test_firebase_sync.py            # inject one mock FALL_IMPACT alert
    python test_firebase_sync.py --list     # list recent alerts in Firestore
    python test_firebase_sync.py --clear    # delete alerts created by this test
"""

import sys
from dataclasses import dataclass
from typing import Optional

from src.escalation import (
    FirestoreSink, AlertGateway, ElderContext, DEFAULT_SERVICE_ACCOUNT,
)


@dataclass
class _MockM4:
    alert: bool
    alert_type: Optional[str]


def inject():
    sink = FirestoreSink()
    if not sink.available:
        print("Firestore NOT available.")
        print("  reason:", getattr(sink, "_init_error", "unknown"))
        print(f"  expected key at: {DEFAULT_SERVICE_ACCOUNT}")
        return

    print("Firestore connected. Injecting a mock FALL_IMPACT alert...")
    gw = AlertGateway(
        ElderContext(elder_id="ELDER_TEST", elder_name="Test Resident",
                     room_location="Room 101 - Test", assigned_caretaker_id="CARE_TEST"),
        sinks=[sink],
    )
    rec = gw.handle_m4(_MockM4(True, "FALL_IMPACT"), p_fall=0.97,
                       furniture_context="open_floor", now=0.0)
    if rec:
        print(f"  wrote alertId={rec['alertId']}  status={rec['status']}")

    # Read it back to prove it landed.
    doc = sink._db.collection("alerts").document(rec["alertId"]).get()
    print("  read-back exists:", doc.exists)
    if doc.exists:
        d = doc.to_dict()
        print(f"  read-back: {d['eventType']} for {d['elderName']} @ {d['roomLocation']}")
    print("\nCheck the caretaker app (status == 'CREATED') to see it appear live.")


def list_alerts():
    sink = FirestoreSink()
    if not sink.available:
        print("Firestore NOT available:", getattr(sink, "_init_error", "unknown"))
        return
    docs = sink._db.collection("alerts").limit(20).stream()
    n = 0
    for d in docs:
        a = d.to_dict()
        n += 1
        print(f"  {a.get('timestamp')}  {a.get('eventType'):22s} {a.get('status'):12s} {a.get('elderName')}")
    print(f"{n} alert(s) in Firestore.")


def clear_test():
    sink = FirestoreSink()
    if not sink.available:
        print("Firestore NOT available:", getattr(sink, "_init_error", "unknown"))
        return
    docs = sink._db.collection("alerts").where("elderId", "==", "ELDER_TEST").stream()
    n = 0
    for d in docs:
        d.reference.delete()
        n += 1
    print(f"Deleted {n} test alert(s).")


if __name__ == "__main__":
    if "--list" in sys.argv:
        list_alerts()
    elif "--clear" in sys.argv:
        clear_test()
    else:
        inject()

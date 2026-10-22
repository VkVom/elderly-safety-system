"""
Live push notification test — sends a REAL Expo push (no mocks) to the caretaker
linked to a dynamically chosen elder, then optionally polls delivery receipts.

It also WRITES a real alert document so tapping the notification opens the alert
screen (deep link -> alerts/<alertId>), and so the caretaker dashboard shows it.

Usage:
  python test_push_live.py                        # interactive elder picker
  python test_push_live.py --elder SAFE-3BS2      # by pairing code
  python test_push_live.py --elder <UID> --receipts
  python test_push_live.py --caretaker <UID>      # force-routing override
  python test_push_live.py --elder Rahul --event PRE_FALL_WARNING   # amber tier-1
  python test_push_live.py --resolve EP_xxxxxxxx  # cleanup a test alert
  python test_push_live.py --list                 # just show the elder table

Exit codes: 0 = ticket accepted (and receipts ok if polled), 1 = failure.
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

from src.elder_picker import (
    PickerError, load_elders, mask_token, pick_elder, print_elders_table, routing_banner,
)
from src.escalation import ExpoPushNotifier, FirestoreExpoPushNotifier, get_firestore_db

RECEIPTS_ENDPOINT = "https://exp.host/--/api/v2/push/getReceipts"

EVENT_STYLE = {
    # event type -> (status, tier, posture, context)
    "PRE_FALL_WARNING": ("WARNING", 1, "BALANCE_LOSS", "standing"),
    "FALL_IMPACT":      ("CREATED", 2, "FALLEN", "floor"),
    "LONG_LIE_ALERT":   ("CREATED", 3, "LYING", "floor"),
}


def post_json(url: str, payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=body,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        return json.loads(res.read().decode("utf-8"))


def poll_receipts(ticket_ids, timeout_s: float = 20.0, interval_s: float = 2.0) -> dict:
    """Poll Expo getReceipts until every ticket resolves or the timeout passes."""
    pending = set(ticket_ids)
    receipts = {}
    deadline = time.time() + timeout_s
    while pending and time.time() < deadline:
        time.sleep(interval_s)
        data = post_json(RECEIPTS_ENDPOINT, {"ids": list(pending)})
        for rid, receipt in (data.get("data") or {}).items():
            receipts[rid] = receipt
            pending.discard(rid)
        if pending:
            print(f"  ... {len(pending)} receipt(s) still pending")
    for rid in pending:
        receipts[rid] = {"status": "pending-timeout",
                         "message": f"no receipt within {timeout_s:.0f}s"}
    return receipts


def main() -> int:
    ap = argparse.ArgumentParser(description="Send a REAL test push to a caretaker.")
    ap.add_argument("--elder", help="elder UID, SAFE-XXXX pairing code, or name substring")
    ap.add_argument("--caretaker", help="force-route to this caretaker UID (debug override)")
    ap.add_argument("--title", help="notification title override")
    ap.add_argument("--message", help="notification body override")
    ap.add_argument("--receipts", action="store_true",
                    help="poll Expo for delivery receipts after sending")
    ap.add_argument("--list", action="store_true", help="list elders + caretakers and exit")
    ap.add_argument("--event", choices=sorted(EVENT_STYLE), default="FALL_IMPACT",
                    help="event type for the test alert doc + push styling (default FALL_IMPACT)")
    ap.add_argument("--resolve", metavar="ALERT_ID",
                    help="mark a test alert resolved and exit (cleanup)")
    args = ap.parse_args()

    try:
        db = get_firestore_db()
    except Exception as e:
        print(f"[push-test] Firestore unavailable: {e}")
        return 1

    if args.list:
        print_elders_table(load_elders(db))
        return 0

    if args.resolve:
        now = datetime.now(timezone.utc).isoformat()
        try:
            db.collection("alerts").document(args.resolve).update(
                {"status": "RESOLVED", "resolvedAt": now})
        except Exception as e:
            print(f"[push-test] Could not resolve {args.resolve}: {e}")
            return 1
        print(f"[push-test] Resolved {args.resolve}")
        return 0

    try:
        choice, _db = pick_elder(selection=args.elder, caretaker_override=args.caretaker, db=db)
    except PickerError as e:
        print(f"[push-test] {e}")
        return 1

    print()
    print(routing_banner(choice))
    print()

    if not choice.caretaker_token:
        who = choice.caretaker_name or "caretaker"
        print(f"[push-test] No push token for {who}.")
        print("  -> Open the app on that phone, log in, and grant notification permission.")
        print("  -> Or pass --caretaker <UID> to route elsewhere.")
        return 1

    # Write a REAL alert doc so the push deep link opens the alert screen on tap
    # (the app fetches alerts/<alertId>; without this doc it silently lands on
    # the dashboard). Mirrors the gateway's record schema.
    status, tier, posture, context = EVENT_STYLE[args.event]
    alert_id = f"EP_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "alertId": alert_id,
        "episodeId": alert_id,
        "elderId": choice.uid,
        "elderName": choice.name,
        "roomLocation": choice.room,
        "eventType": args.event,
        "status": status,
        "tier": tier,
        "fallProbability": 0.99,
        "postureState": posture,
        "furnitureContext": context,
        "assignedCaretakerId": choice.caretaker_id,
        "elderPhone": choice.phone,
        "acknowledgedBy": None,
        "escalatedToVolunteers": False,
        "escalationTimerStart": now,
        "timestamp": now,
        "warningTimestamp": now,
    }
    db.collection("alerts").document(alert_id).set(record)
    print(f"[push-test] Alert doc written: alerts/{alert_id} "
          f"({args.event}, status {status}, tier {tier})")
    print(f"[push-test] Tap the notification to open it; resolve later with: "
          f"test_push_live.py --resolve {alert_id}")

    # Use the same notifier path as run_live.py (camera / IP cam / dashboard):
    # resolve the caretaker's token from Firestore, not from the picker.
    notifier = FirestoreExpoPushNotifier()
    if not notifier.available:
        notifier = ExpoPushNotifier(token_resolver=lambda _rec: [choice.caretaker_token])
    if args.title or args.message:
        base_build = notifier._build_messages

        def custom_build(rec, _base=base_build):
            msgs = _base(rec)
            for m in msgs:
                if args.title:
                    m["title"] = args.title
                if args.message:
                    m["body"] = args.message
            return msgs

        notifier._build_messages = custom_build

    print(f"[push-test] Sending to {mask_token(choice.caretaker_token)} ...")
    try:
        response = notifier.transport(notifier._build_messages(record))
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", "replace")
        except Exception:
            pass
        print(f"[push-test] SEND FAILED: {e}")
        if detail:
            print(f"[push-test] Expo says: {detail[:600]}")
        return 1
    except Exception as e:
        print(f"[push-test] SEND FAILED: {e}")
        return 1

    print(f"[push-test] Expo response: {json.dumps(response)[:400]}")
    tickets = [d.get("id") for d in (response.get("data") or []) if d.get("id")]
    errors = [d for d in (response.get("data") or []) if d.get("status") == "error"]
    if errors:
        print(f"[push-test] Ticket rejected: {json.dumps(errors)[:400]}")
        return 1

    if args.receipts and tickets:
        print("[push-test] Polling receipts ...")
        receipts = poll_receipts(tickets)
        ok = True
        for rid, r in receipts.items():
            status = r.get("status")
            detail = r.get("details", {}).get("error") if isinstance(r.get("details"), dict) else None
            print(f"  {rid}: {status} {('-> ' + r.get('message')) if r.get('message') else ''} "
                  f"{('(' + str(detail) + ')') if detail else ''}")
            if status != "ok":
                ok = False
        if ok:
            print("[push-test] DELIVERED. If the phone stayed silent, check: app notifications "
                  "enabled (Android 13+), battery optimization, and that the phone shows this "
                  "account's app.")
            return 0
        print("[push-test] Receipt error — see statuses above.")
        return 1

    print("[push-test] Ticket accepted by Expo. Run with --receipts to confirm device delivery.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

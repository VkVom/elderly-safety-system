"""
Escalation Gateway (M4 -> outside world)
Project: Proactive Elderly Safety System for Pre-Impact Fall Anticipation
Author: M4 Owner (VK / G14 Team)

Bridges in-memory M4 decision events to alert records for the mobile app / responders.

Design: pluggable, credential-free-testable.
  - AlertSink (abstract) with two implementations:
      * LocalJsonSink   -> appends records to logs/alerts.json (works NOW, no keys).
      * FirestoreSink    -> stub that matches the planned `alerts` schema and activates
                            only when firebase-admin + credentials are present.
  - Notifiers (mock): push (Expo) and Twilio SMS/voice - log intent without real APIs.
  - AlertGateway ties it together: builds a schema-correct record from an M4 alert,
    de-duplicates so ONE fall event yields ONE alert (not one per frame), and fans out
    to the configured sinks + notifiers.

Alert record schema (matches mobile app plan):
    alertId, elderId, elderName, roomLocation, eventType, status,
    fallProbability, postureState, furnitureContext,
    assignedCaretakerId, acknowledgedBy, escalatedToVolunteers,
    escalationTimerStart, timestamp
"""

import os
import json
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

LOG_DIR = "logs"
DEFAULT_ALERTS_PATH = os.path.join(LOG_DIR, "alerts.json")

# Default location of the Firebase service-account key (gitignored). Callers can
# override, or set the GOOGLE_APPLICATION_CREDENTIALS env var instead.
DEFAULT_SERVICE_ACCOUNT = "firebase-service-account.json"

# M4 event types that warrant an escalation (PRE_FALL and recoveries do not).
ESCALATION_EVENTS = {"FALL_IMPACT", "POSE_LOST_WHILE_FALLEN", "LONG_LIE_ALERT", "MANUAL_SOS"}

# Map M4 state/event -> a coarse posture descriptor for the record.
POSTURE_BY_EVENT = {
    "FALL_IMPACT": "HORIZONTAL_FLOOR",
    "POSE_LOST_WHILE_FALLEN": "OBSCURED_LIKELY_DOWN",
    "LONG_LIE_ALERT": "PROLONGED_LYING",
    "MANUAL_SOS": "UNKNOWN",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class ElderContext:
    """Static info about the monitored person / location, attached to each alert."""
    elder_id: str = "ELDER_UNKNOWN"
    elder_name: str = "Unknown"
    room_location: str = "Unknown"
    assigned_caretaker_id: Optional[str] = None


# --------------------------------------------------------------------------- sinks
class AlertSink(ABC):
    @abstractmethod
    def write(self, record: Dict) -> None: ...


class LocalJsonSink(AlertSink):
    """Appends each alert record to a JSON array file. Fully testable without keys."""

    def __init__(self, path: str = DEFAULT_ALERTS_PATH):
        self.path = path
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        if not os.path.isfile(path):
            with open(path, "w") as f:
                json.dump([], f)

    def write(self, record: Dict) -> None:
        try:
            with open(self.path, "r") as f:
                data = json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            data = []
        data.append(record)
        with open(self.path, "w") as f:
            json.dump(data, f, indent=2)

    def read_all(self) -> List[Dict]:
        try:
            with open(self.path, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return []

    def clear(self) -> None:
        with open(self.path, "w") as f:
            json.dump([], f)


class FirestoreSink(AlertSink):
    """
    Firestore adapter STUB. Writes to the `alerts` collection when firebase-admin and
    credentials are available; otherwise it is inert and reports as unavailable so the
    gateway can fall back to the local sink. No credentials are bundled.
    """

    def __init__(self, collection: str = "alerts",
                 credentials_path: Optional[str] = None):
        self.collection = collection
        self._db = None
        self._init_error = None
        # Fall back to the default key path if none given and it exists.
        if credentials_path is None and os.path.isfile(DEFAULT_SERVICE_ACCOUNT):
            credentials_path = DEFAULT_SERVICE_ACCOUNT
        try:
            import firebase_admin
            from firebase_admin import credentials, firestore
            if not firebase_admin._apps:
                if credentials_path and os.path.isfile(credentials_path):
                    cred = credentials.Certificate(credentials_path)
                    firebase_admin.initialize_app(cred)
                else:
                    firebase_admin.initialize_app()  # uses GOOGLE_APPLICATION_CREDENTIALS
            self._db = firestore.client()
        except Exception as e:  # firebase-admin missing or no creds -> stay inert
            self._init_error = str(e)

    @property
    def available(self) -> bool:
        return self._db is not None

    def write(self, record: Dict) -> None:
        if not self.available:
            raise RuntimeError("FirestoreSink unavailable (no firebase-admin/credentials).")
        self._db.collection(self.collection).document(record["alertId"]).set(record)


# ----------------------------------------------------------------------- notifiers
class Notifier(ABC):
    @abstractmethod
    def notify(self, record: Dict) -> None: ...


class MockPushNotifier(Notifier):
    """Stand-in for Expo push. Records intent so tests can assert it fired."""
    def __init__(self):
        self.sent: List[Dict] = []

    def notify(self, record: Dict) -> None:
        msg = {
            "to_role": "caretaker",
            "title": f"{record['eventType']} - {record['elderName']}",
            "body": f"{record['roomLocation']} | P(fall)={record['fallProbability']}",
            "alertId": record["alertId"],
        }
        self.sent.append(msg)
        print(f"[PUSH mock] -> {msg['title']} | {msg['body']}")


class MockTwilioNotifier(Notifier):
    """Stand-in for Twilio SMS/voice. Records intent so tests can assert it fired."""
    def __init__(self):
        self.sent: List[Dict] = []

    def notify(self, record: Dict) -> None:
        msg = {
            "channel": "sms",
            "text": f"ALERT {record['eventType']} for {record['elderName']} "
                    f"at {record['roomLocation']} ({record['timestamp']})",
            "alertId": record["alertId"],
        }
        self.sent.append(msg)
        print(f"[TWILIO mock] -> {msg['text']}")


# ------------------------------------------------------------------------- gateway
class AlertGateway:
    """
    Consumes M4 alerts and fans out schema-correct records to sinks + notifiers.

    De-duplication: M4 raises alert=True once per event, but state can also re-fire
    (e.g. LONG_LIE after FALL_IMPACT). We treat each (event_type) transition as one
    alert and apply a cooldown so repeated identical events within `cooldown_s` do not
    spam duplicate records.
    """

    def __init__(
        self,
        context: ElderContext,
        sinks: Optional[List[AlertSink]] = None,
        notifiers: Optional[List[Notifier]] = None,
        cooldown_s: float = 5.0,
    ):
        self.context = context
        self.sinks = sinks if sinks is not None else [LocalJsonSink()]
        self.notifiers = notifiers if notifiers is not None else [
            MockPushNotifier(), MockTwilioNotifier()
        ]
        self.cooldown_s = cooldown_s
        self._last_emit: Dict[str, float] = {}   # event_type -> monotonic time
        self.emitted: List[Dict] = []

    def _build_record(self, event_type: str, p_fall: float,
                      furniture_context: str, extra: Optional[Dict] = None) -> Dict:
        ctx = self.context
        rec = {
            "alertId": f"ALERT_{uuid.uuid4().hex[:12]}",
            "elderId": ctx.elder_id,
            "elderName": ctx.elder_name,
            "roomLocation": ctx.room_location,
            "eventType": event_type,
            "status": "CREATED",
            "fallProbability": round(float(p_fall), 2),
            "postureState": POSTURE_BY_EVENT.get(event_type, "UNKNOWN"),
            "furnitureContext": furniture_context,
            "assignedCaretakerId": ctx.assigned_caretaker_id,
            "acknowledgedBy": None,
            "escalatedToVolunteers": False,
            "escalationTimerStart": _now_iso(),
            "timestamp": _now_iso(),
        }
        if extra:
            rec.update(extra)
        return rec

    def handle_m4(
        self,
        m4_output,
        p_fall: float = 0.0,
        furniture_context: str = "open_floor",
        now: Optional[float] = None,
    ) -> Optional[Dict]:
        """
        Called each frame with the M4Output. Emits an alert record only on a fresh
        escalation event (with cooldown). Returns the record if one was emitted.
        """
        if not getattr(m4_output, "alert", False):
            return None
        event_type = getattr(m4_output, "alert_type", None)
        if event_type not in ESCALATION_EVENTS:
            return None

        t = now if now is not None else time.monotonic()
        last = self._last_emit.get(event_type)
        if last is not None and (t - last) < self.cooldown_s:
            return None  # de-duplicate within cooldown
        self._last_emit[event_type] = t

        record = self._build_record(event_type, p_fall, furniture_context)
        for sink in self.sinks:
            try:
                sink.write(record)
            except Exception as e:
                print(f"[escalation] sink {type(sink).__name__} failed: {e}")
        for n in self.notifiers:
            try:
                n.notify(record)
            except Exception as e:
                print(f"[escalation] notifier {type(n).__name__} failed: {e}")
        self.emitted.append(record)
        return record

    def manual_sos(self, p_fall: float = 1.0) -> Dict:
        """Elder-triggered SOS bypasses M4 and always emits."""
        record = self._build_record("MANUAL_SOS", p_fall, "manual")
        for sink in self.sinks:
            sink.write(record)
        for n in self.notifiers:
            n.notify(record)
        self.emitted.append(record)
        return record


# Self-test: emit each event type once and confirm dedup + record shape.
if __name__ == "__main__":
    print("Executing Escalation Gateway Self-Test...")

    from dataclasses import dataclass as _dc

    @_dc
    class _FakeM4:
        alert: bool
        alert_type: Optional[str]

    sink = LocalJsonSink(os.path.join(LOG_DIR, "_selftest_alerts.json"))
    sink.clear()
    gw = AlertGateway(
        ElderContext(elder_id="ELDER_456", elder_name="John Doe",
                     room_location="Room 204 - Bed Area", assigned_caretaker_id="USER_123"),
        sinks=[sink], cooldown_s=5.0,
    )

    t = 0.0
    r1 = gw.handle_m4(_FakeM4(True, "FALL_IMPACT"), p_fall=0.99,
                      furniture_context="open_floor", now=t)
    # duplicate within cooldown -> suppressed
    r_dup = gw.handle_m4(_FakeM4(True, "FALL_IMPACT"), p_fall=0.99, now=t + 1.0)
    # non-escalation event -> ignored
    r_none = gw.handle_m4(_FakeM4(True, "PRE_FALL"), p_fall=0.3, now=t + 2.0)
    # different event -> emitted
    r2 = gw.handle_m4(_FakeM4(True, "LONG_LIE_ALERT"), p_fall=0.5,
                      furniture_context="open_floor", now=t + 3.0)

    records = sink.read_all()
    print(f"Emitted records: {len(records)} (expected 2)")
    assert r1 is not None and r_dup is None and r_none is None and r2 is not None
    assert len(records) == 2
    required = {"alertId", "elderId", "eventType", "status", "fallProbability",
                "postureState", "furnitureContext", "timestamp"}
    assert required.issubset(records[0].keys())
    print("Sample record:")
    print(json.dumps(records[0], indent=2))
    sink.clear()
    os.remove(sink.path)
    print("[Escalation Self-Test Passed!]")

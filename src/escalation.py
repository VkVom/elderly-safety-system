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
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, Dict, Iterable, List, Optional

LOG_DIR = "logs"
DEFAULT_ALERTS_PATH = os.path.join(LOG_DIR, "alerts.json")

# Default location of the Firebase service-account key (gitignored). Callers can
# override, or set the GOOGLE_APPLICATION_CREDENTIALS env var instead.
DEFAULT_SERVICE_ACCOUNT = "firebase-service-account.json"

# M4 event types that warrant an emergency escalation (PRE_FALL and recoveries do not).
ESCALATION_EVENTS = {"FALL_IMPACT", "POSE_LOST_WHILE_FALLEN", "LONG_LIE_ALERT", "MANUAL_SOS"}

# Tier-1 pre-impact lifecycle events (one alert doc per episode, gentle push).
TIER_EVENTS = {"PRE_FALL_WARNING", "SELF_RECOVERY_CANCELLED"}

# Numeric tiers: 0 = informational (auto-cancel), 1 = warning (check on resident),
# 2 = emergency (fall/manual SOS), 3 = escalated (long lie -> volunteers).
TIER_INFORMATIONAL = 0
TIER_WARNING = 1
TIER_EMERGENCY = 2
TIER_ESCALATED = 3

# Map M4 state/event -> a coarse posture descriptor for the record.
POSTURE_BY_EVENT = {
    "FALL_IMPACT": "HORIZONTAL_FLOOR",
    "POSE_LOST_WHILE_FALLEN": "OBSCURED_LIKELY_DOWN",
    "LONG_LIE_ALERT": "PROLONGED_LYING",
    "MANUAL_SOS": "UNKNOWN",
    "PRE_FALL_WARNING": "BALANCE_LOSS",
    "SELF_RECOVERY_CANCELLED": "RECOVERED",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_firestore_db(credentials_path: Optional[str] = None):
    """
    Initialize firebase-admin (once per process) and return a Firestore client.

    Raises on failure (missing firebase-admin package / credentials); callers that
    want an inert/no-cloud fallback catch the exception themselves. This is the one
    shared entry point used by every tool (sinks, notifiers, pickers, tests).
    """
    if credentials_path is None and os.path.isfile(DEFAULT_SERVICE_ACCOUNT):
        credentials_path = DEFAULT_SERVICE_ACCOUNT
    import firebase_admin
    from firebase_admin import credentials, firestore
    if not firebase_admin._apps:
        if credentials_path and os.path.isfile(credentials_path):
            firebase_admin.initialize_app(credentials.Certificate(credentials_path))
        else:
            firebase_admin.initialize_app()  # uses GOOGLE_APPLICATION_CREDENTIALS
    return firestore.client()


@dataclass
class ElderContext:
    """Static info about the monitored person / location, attached to each alert."""
    elder_id: str = "ELDER_UNKNOWN"
    elder_name: str = "Unknown"
    room_location: str = "Unknown"
    assigned_caretaker_id: Optional[str] = None
    elder_phone: Optional[str] = None     # for the caretaker's "Call Elder" action


# --------------------------------------------------------------------------- sinks
class AlertSink(ABC):
    @abstractmethod
    def write(self, record: Dict) -> None: ...

    def update(self, alert_id: str, fields: Dict) -> None:
        """Patch an existing alert doc (episode tier upgrades / auto-cancel)."""
        raise NotImplementedError(f"{type(self).__name__} does not support update()")


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

    def update(self, alert_id: str, fields: Dict) -> None:
        data = self.read_all()
        for rec in data:
            if rec.get("alertId") == alert_id:
                rec.update(fields)
                break
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
        try:
            self._db = get_firestore_db(credentials_path)
        except Exception as e:  # firebase-admin missing or no creds -> stay inert
            self._init_error = str(e)

    @property
    def available(self) -> bool:
        return self._db is not None

    def write(self, record: Dict) -> None:
        if not self.available:
            raise RuntimeError("FirestoreSink unavailable (no firebase-admin/credentials).")
        self._db.collection(self.collection).document(record["alertId"]).set(record)

    def update(self, alert_id: str, fields: Dict) -> None:
        if not self.available:
            raise RuntimeError("FirestoreSink unavailable (no firebase-admin/credentials).")
        self._db.collection(self.collection).document(alert_id).update(fields)


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


class ExpoPushNotifier(Notifier):
    """
    Sends real Expo push notifications for alert records.

    A token_resolver keeps this class testable: production can resolve recipient
    tokens from Firestore, while tests can pass a static resolver and fake transport.
    """

    EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send"

    def __init__(
        self,
        token_resolver: Callable[[Dict], Iterable[str]],
        transport: Optional[Callable[[List[Dict]], Dict]] = None,
        channel_id: str = "emergency-alerts-v4",
        warning_channel_id: str = "warnings",
    ):
        self.token_resolver = token_resolver
        self.transport = transport or self._post_to_expo
        self.channel_id = channel_id
        self.warning_channel_id = warning_channel_id
        self.sent: List[Dict] = []

    def _message_style(self, record: Dict) -> Dict:
        """Tier-dependent title/body/channel/sound. Loud siren only for emergencies."""
        name = record.get("elderName") or "Resident"
        room = record.get("roomLocation") or ""
        event_type = record.get("eventType")
        if event_type == "PRE_FALL_WARNING":
            return {
                "title": f"Checking on {name}",
                "body": f"Possible stumble in {room or 'their room'}. Tap to check.",
                "sound": None, "priority": "high",
                "channel": self.warning_channel_id, "tier": TIER_WARNING,
            }
        if event_type == "SELF_RECOVERY_CANCELLED":
            return {
                "title": f"{name} recovered",
                "body": "Balance regained - alert cancelled automatically.",
                "sound": None, "priority": "normal",
                "channel": self.warning_channel_id, "tier": TIER_INFORMATIONAL,
            }
        if event_type == "LONG_LIE_ALERT":
            return {
                "title": f"Emergency: {name}",
                "body": f"Still down in {room} - long lie",
                "sound": "default", "priority": "high",
                "channel": self.channel_id, "tier": TIER_ESCALATED,
            }
        return {
            "title": f"Emergency: {name}",
            "body": f"{event_type} in {room}",
            "sound": "default", "priority": "high",
            "channel": self.channel_id, "tier": TIER_EMERGENCY,
        }

    def _build_messages(self, record: Dict) -> List[Dict]:
        tokens = sorted({t for t in self.token_resolver(record) if isinstance(t, str) and t})
        style = self._message_style(record)
        messages = []
        for token in tokens:
            message = {
                "to": token,
                "title": style["title"],
                "body": style["body"],
                "priority": style["priority"],
                "channelId": style["channel"],
                "data": {
                    "alertId": record["alertId"],
                    "elderId": record["elderId"],
                    "eventType": record["eventType"],
                    "assignedCaretakerId": record.get("assignedCaretakerId"),
                    "elderPhone": record.get("elderPhone"),
                    "tier": style["tier"],
                },
            }
            if style["sound"] is not None:
                message["sound"] = style["sound"]
            if style["tier"] >= TIER_EMERGENCY:
                # iOS: break through Focus modes like a phone call.
                # NB: the push HTTP API enum is hyphenated ("time-sensitive"),
                # unlike the SDK's camelCase "timeSensitive".
                message["interruptionLevel"] = "time-sensitive"
            messages.append(message)
        return messages

    def _post_to_expo(self, messages: List[Dict]) -> Dict:
        body = json.dumps(messages).encode("utf-8")
        req = urllib.request.Request(
            self.EXPO_ENDPOINT,
            data=body,
            headers={
                "Accept": "application/json",
                "Accept-Encoding": "gzip, deflate",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as res:
            return json.loads(res.read().decode("utf-8"))

    def notify(self, record: Dict) -> None:
        messages = self._build_messages(record)
        if not messages:
            raise RuntimeError("No recipient push token found; Expo push was not submitted.")
        response = self.transport(messages)
        tickets = response.get("data") if isinstance(response, dict) else None
        if not isinstance(tickets, list) or len(tickets) != len(messages):
            raise RuntimeError(
                "Expo returned an invalid ticket response; push acceptance is unconfirmed."
            )
        failures = [ticket for ticket in tickets
                    if not isinstance(ticket, dict) or ticket.get("status") != "ok"]
        if failures:
            details = "; ".join(
                str(ticket.get("message") or ticket.get("details") or ticket)
                for ticket in failures
            )
            raise RuntimeError(f"Expo rejected {len(failures)} push ticket(s): {details}")
        self.sent.extend(messages)
        print(f"[EXPO push] accepted {len(messages)} message(s) by Expo; device delivery is asynchronous.")


class FirestoreExpoPushNotifier(ExpoPushNotifier):
    """Resolves caretaker or volunteer Expo tokens from the existing users collection."""

    def __init__(self, credentials_path: Optional[str] = None):
        self._db = None
        self._init_error = None
        try:
            self._db = get_firestore_db(credentials_path)
        except Exception as e:
            self._init_error = str(e)
        super().__init__(self._resolve_tokens)

    @property
    def available(self) -> bool:
        return self._db is not None

    def _profile_tokens(self, data: Dict) -> List[str]:
        tokens = []
        if data.get("expoPushToken"):
            tokens.append(data["expoPushToken"])
        if data.get("pushToken"):
            tokens.append(data["pushToken"])
        tokens.extend(data.get("pushTokens") or [])
        return tokens

    def _resolve_tokens(self, record: Dict) -> List[str]:
        if not self.available:
            raise RuntimeError(f"FirestoreExpoPushNotifier unavailable: {self._init_error}")
        tokens: List[str] = []
        elder: Dict = {}
        elder_id = record.get("elderId")
        if elder_id:
            elder_snap = self._db.collection("users").document(elder_id).get()
            if elder_snap.exists:
                elder = elder_snap.to_dict() or {}
        caretaker_id = record.get("assignedCaretakerId") or elder.get("caretakerId")
        if caretaker_id and not record.get("escalatedToVolunteers"):
            snap = self._db.collection("users").document(caretaker_id).get()
            if snap.exists:
                tokens.extend(self._profile_tokens(snap.to_dict() or {}))
            # Fallback mirror maintained by the caretaker app: the linked
            # caretaker's current Expo token is copied onto the elder doc.
            if not tokens and elder.get("caretakerPushToken"):
                tokens.append(elder["caretakerPushToken"])
        if record.get("escalatedToVolunteers"):
            query = self._db.collection("users").where("role", "==", "volunteer")
            for snap in query.stream():
                data = snap.to_dict() or {}
                if data.get("onDuty") is False:
                    continue  # off-duty volunteers are not paged
                tokens.extend(self._profile_tokens(data))
        return tokens


# ------------------------------------------------------------------------- gateway
class AlertGateway:
    """
    Consumes M4 outputs and fans out schema-correct records to sinks + notifiers.

    Episode lifecycle (one doc per fall episode):
      PRE_FALL_WARNING         -> write doc id = episode_id, status WARNING, tier 1
      FALL_IMPACT / POSE_LOST  -> update the SAME doc, status CREATED, tier 2
      LONG_LIE_ALERT           -> update the SAME doc, tier 3 (volunteer escalation)
      SELF_RECOVERY_CANCELLED  -> update the SAME doc, status AUTO_CANCELLED, tier 0

    Emergency de-duplication: repeated identical emergency events within `cooldown_s`
    do not spam duplicate records. Episode events are inherently one-per-episode
    (the M4 side guarantees a single warning and a single cancel per episode_id).
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
        self._open_episodes: Dict[str, Dict] = {}  # episode_id -> current record
        self.emitted: List[Dict] = []

    def _build_record(self, event_type: str, p_fall: Optional[float],
                      furniture_context: str, extra: Optional[Dict] = None) -> Dict:
        ctx = self.context
        rec = {
            "alertId": f"ALERT_{uuid.uuid4().hex[:12]}",
            "elderId": ctx.elder_id,
            "elderName": ctx.elder_name,
            "roomLocation": ctx.room_location,
            "eventType": event_type,
            "status": "CREATED",
            "tier": TIER_EMERGENCY,
            "fallProbability": round(float(p_fall), 2) if p_fall is not None else None,
            "postureState": POSTURE_BY_EVENT.get(event_type, "UNKNOWN"),
            "furnitureContext": furniture_context,
            "assignedCaretakerId": ctx.assigned_caretaker_id,
            "elderPhone": ctx.elder_phone,
            "acknowledgedBy": None,
            "escalatedToVolunteers": False,
            "escalationTimerStart": _now_iso(),
            "timestamp": _now_iso(),
        }
        if extra:
            rec.update(extra)
        return rec

    def _fanout_write(self, record: Dict) -> None:
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
        self.emitted.append(dict(record))  # snapshot: later updates must not alias it

    def _fanout_update(self, record: Dict, fields: Dict) -> None:
        alert_id = record["alertId"]
        record.update(fields)
        for sink in self.sinks:
            try:
                sink.update(alert_id, fields)
            except Exception as e:
                print(f"[escalation] sink {type(sink).__name__} update failed: {e}")
        for n in self.notifiers:
            try:
                n.notify(record)
            except Exception as e:
                print(f"[escalation] notifier {type(n).__name__} failed: {e}")
        self.emitted.append(dict(record))  # snapshot of this lifecycle transition

    # -- episode lifecycle ------------------------------------------------------
    def _handle_warning(self, episode_id: Optional[str], p_fall: Optional[float],
                        furniture_context: str) -> Optional[Dict]:
        if not episode_id or episode_id in self._open_episodes:
            return None
        record = self._build_record(
            "PRE_FALL_WARNING", p_fall, furniture_context,
            extra={
                "alertId": episode_id,
                "episodeId": episode_id,
                "status": "WARNING",
                "tier": TIER_WARNING,
            },
        )
        record["warningTimestamp"] = record["timestamp"]
        self._open_episodes[episode_id] = record
        self._fanout_write(record)
        return record

    def _escalate_episode(self, episode_id: str, event_type: str, p_fall: Optional[float],
                          furniture_context: str) -> Dict:
        tier = TIER_ESCALATED if event_type == "LONG_LIE_ALERT" else TIER_EMERGENCY
        fields = {
            "eventType": event_type,
            "status": "CREATED",
            "tier": tier,
            "fallProbability": round(float(p_fall), 2) if p_fall is not None else None,
            "postureState": POSTURE_BY_EVENT.get(event_type, "UNKNOWN"),
            "furnitureContext": furniture_context,
            "timestamp": _now_iso(),
            "escalationTimerStart": _now_iso(),
        }
        if event_type == "LONG_LIE_ALERT":
            # Long lie = primary caretaker did not resolve it in time: open the
            # alert to the volunteer community (also drives the volunteer push).
            fields["escalatedToVolunteers"] = True
        record = self._open_episodes[episode_id]
        self._fanout_update(record, fields)
        return record

    def _handle_cancel(self, episode_id: Optional[str]) -> Optional[Dict]:
        if not episode_id or episode_id not in self._open_episodes:
            return None
        record = self._open_episodes.pop(episode_id)
        fields = {
            "status": "AUTO_CANCELLED",
            "eventType": "SELF_RECOVERY_CANCELLED",
            "tier": TIER_INFORMATIONAL,
            "postureState": POSTURE_BY_EVENT["SELF_RECOVERY_CANCELLED"],
            "resolvedAt": _now_iso(),
        }
        self._fanout_update(record, fields)
        return record

    def handle_m4(
        self,
        m4_output,
        p_fall: Optional[float] = 0.0,
        furniture_context: str = "open_floor",
        now: Optional[float] = None,
    ) -> Optional[Dict]:
        """
        Called each frame with the M4Output. Drives the episode lifecycle (warning ->
        impact/long-lie -> cancel) and emits standalone emergency records for events
        that arrive without an open episode. Returns the affected record or None.
        """
        tier_event = getattr(m4_output, "tier_event", None)
        episode_id = getattr(m4_output, "episode_id", None)
        if tier_event == "PRE_FALL_WARNING":
            return self._handle_warning(episode_id, p_fall, furniture_context)
        if tier_event == "SELF_RECOVERY_CANCELLED":
            return self._handle_cancel(episode_id)
        if tier_event in TIER_EVENTS:
            return None

        if not getattr(m4_output, "alert", False):
            return None
        event_type = getattr(m4_output, "alert_type", None)
        if event_type not in ESCALATION_EVENTS:
            return None

        if episode_id and episode_id in self._open_episodes:
            return self._escalate_episode(episode_id, event_type, p_fall, furniture_context)

        t = now if now is not None else time.monotonic()
        last = self._last_emit.get(event_type)
        if last is not None and (t - last) < self.cooldown_s:
            return None  # de-duplicate within cooldown
        self._last_emit[event_type] = t

        record = self._build_record(event_type, p_fall, furniture_context)
        self._fanout_write(record)
        return record

    def manual_sos(self, p_fall: Optional[float] = 1.0) -> Dict:
        """Elder-triggered SOS bypasses M4 and always emits."""
        record = self._build_record("MANUAL_SOS", p_fall, "manual")
        self._fanout_write(record)
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

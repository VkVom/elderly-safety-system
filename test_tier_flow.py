"""
End-to-end tiered-episode flow test (P4): the REAL M4 engine feeds the REAL
escalation gateway, exactly like run_live.py does - but deterministic.

Scenarios (each must keep ONE alert doc for the whole episode):
  A. stumble -> recovers           : WARNING (tier1) -> AUTO_CANCELLED (tier0),
                                     two gentle "warnings"-channel pushes, zero emergency.
  B. stumble -> hard fall          : WARNING -> CREATED (tier2) impact push on the
                                     emergency channel; fast adaptive confirm.
  C. stumble -> fall -> stays down : WARNING -> impact -> LONG_LIE_ALERT (tier3),
                                     three pushes, still ONE doc.

Run: .\\venv\\Scripts\\python.exe test_tier_flow.py
"""

import os
import re

from src.m4_state_machine import FallDecisionEngine, M4Config
from src.escalation import (
    AlertGateway, ElderContext, ExpoPushNotifier, LocalJsonSink,
)

DT = 1.0 / 30.0
EP_RE = re.compile(r"^EP_[0-9a-f]{8}$")
TMP_SINK = os.path.join("logs", "_tier_flow_alerts.json")

UPRIGHT = ("TRACKING", 10.0, 0.2, 40, 0.05)
STUMBLE = ("TRACKING", 40.0, 2.5, 500, 0.30)
HARD_IMPACT = ("TRACKING", 85.0, 2.5, 2000, 0.95)
LYING = ("TRACKING", 85.0, 0.0, 20, 0.9)


class Flow:
    """Runs engine frames through the gateway; records every push."""

    def __init__(self, config=None):
        self.sink = LocalJsonSink(TMP_SINK)
        self.sink.clear()
        self.pushes = []

        def transport(messages):
            self.pushes.extend(messages)
            return {"data": [{"status": "ok"}] * len(messages)}

        notifier = ExpoPushNotifier(
            token_resolver=lambda record: ["ExponentPushToken[caretaker-e2e]"],
            transport=transport,
        )
        ctx = ElderContext(
            elder_id="ELDER_E2E", elder_name="E2E Resident", room_location="Room 9",
            assigned_caretaker_id="CARE_E2E", elder_phone="+91-9111111111",
        )
        self.gw = AlertGateway(ctx, sinks=[self.sink], notifiers=[notifier])
        self.eng = FallDecisionEngine(config or M4Config())
        self.events = []

    def feed(self, frame, seconds):
        state, hip_y, hip_vy, hip_y_disp, p_fall = frame
        n = int(round(seconds / DT))
        for _ in range(n):
            out = self.eng.update(state, hip_y, hip_vy, hip_y_disp, p_fall, False, DT)
            self.events.append(out)
            self.gw.handle_m4(out, p_fall=p_fall)
        return self.events[-1]

    def warm(self):
        self.feed(UPRIGHT, 10 * DT)

    def records(self):
        return self.sink.read_all()


def test_flow_a_warning_then_self_recovery():
    f = Flow()
    f.warm()
    last = f.feed(STUMBLE, DT)
    assert last.tier_event == "PRE_FALL_WARNING"
    f.feed(UPRIGHT, 1.4)  # recovery_confirm_s = 1.0
    recs = f.records()
    assert len(recs) == 1, f"expected ONE episode doc, got {len(recs)}"
    r = recs[0]
    assert EP_RE.match(r["alertId"])
    assert r["status"] == "AUTO_CANCELLED" and r["tier"] == 0
    assert r["eventType"] == "SELF_RECOVERY_CANCELLED"
    assert "resolvedAt" in r
    assert len(f.pushes) == 2, f"expected warning+cancel pushes, got {len(f.pushes)}"
    for m in f.pushes:
        assert m["channelId"] == "warnings" and m.get("sound") is None
    assert not any(e.alert for e in f.events), "no emergency may fire on a recovery"


def test_flow_b_warning_then_hard_impact():
    f = Flow()
    f.warm()
    f.feed(STUMBLE, DT)
    f.feed(HARD_IMPACT, DT)
    f.feed(LYING, 1.6)  # hard-fall confirm_fast_s = 1.3
    recs = f.records()
    assert len(recs) == 1
    r = recs[0]
    assert r["status"] == "CREATED" and r["tier"] == 2
    assert r["eventType"] == "FALL_IMPACT"
    assert r["fallProbability"] >= 0.9
    assert len(f.pushes) == 2
    w, i = f.pushes
    assert w["data"]["tier"] == 1 and w["channelId"] == "warnings"
    assert i["data"]["tier"] == 2 and i["channelId"] == "emergency-alerts-v4"
    assert i["sound"] == "default" and i["priority"] == "high"
    for m in f.pushes:
        assert m["data"]["elderPhone"] == "+91-9111111111"
        assert m["data"]["assignedCaretakerId"] == "CARE_E2E"


def test_flow_c_warning_impact_long_lie():
    f = Flow(M4Config(long_lie_s=2.0))
    f.warm()
    f.feed(STUMBLE, DT)
    f.feed(HARD_IMPACT, DT)
    f.feed(LYING, 5.0)  # confirms impact, then long-lie tier 3
    recs = f.records()
    assert len(recs) == 1, "long-lie must UPDATE, not create a new doc"
    r = recs[0]
    assert r["eventType"] == "LONG_LIE_ALERT" and r["tier"] == 3
    assert r["alertId"] == EP_RE.match(r["alertId"]).group(0)
    assert len(f.pushes) == 3
    assert [m["data"]["tier"] for m in f.pushes] == [1, 2, 3]
    assert all(m["data"]["alertId"] == r["alertId"] for m in f.pushes)


def test_flow_d_impact_from_standstill_still_warns():
    # The engine opens an episode at balance loss even when the impact frame is the
    # very first fall frame: warning tier 1 and impact tier 2 land on ONE doc.
    # (The id-less ALERT_ fallback path is exercised in test_escalation_tiers.py.)
    f = Flow()
    f.warm()
    first = f.feed(HARD_IMPACT, DT)
    assert first.tier_event == "PRE_FALL_WARNING"
    f.feed(HARD_IMPACT, DT)  # impact signature persists -> CONFIRMING
    f.feed(LYING, 1.6)
    recs = f.records()
    assert len(recs) == 1
    r = recs[0]
    assert EP_RE.match(r["alertId"])
    assert r["status"] == "CREATED" and r["tier"] == 2
    assert len(f.pushes) == 2
    assert [m["data"]["tier"] for m in f.pushes] == [1, 2]


def main():
    tests = [
        test_flow_a_warning_then_self_recovery,
        test_flow_b_warning_then_hard_impact,
        test_flow_c_warning_impact_long_lie,
        test_flow_d_impact_from_standstill_still_warns,
    ]
    for t in tests:
        t()
        print(f"  [ok] {t.__name__}")
    if os.path.isfile(TMP_SINK):
        os.remove(TMP_SINK)
    print(f"[Tier flow: {len(tests)}/{len(tests)} passed]")


if __name__ == "__main__":
    main()

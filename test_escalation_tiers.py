"""
TDD tests for the episode-aware escalation gateway (P2).

Contract under test:
  - PRE_FALL_WARNING        creates ONE alert doc for the episode (id = EP_<hex>),
                            status "WARNING", tier 1, gentle push (no siren sound,
                            "warnings" channel).
  - FALL_IMPACT             UPDATES the same doc (status "CREATED", tier 2, emergency
                            push with siren/sound on the emergency channel).
  - LONG_LIE_ALERT          UPDATES the same doc again (tier 3).
  - SELF_RECOVERY_CANCELLED UPDATES the same doc to "AUTO_CANCELLED" (tier 0) and
                            sends one informational push; unknown episodes are ignored.
  - impact without a prior warning still alerts (fallback doc with ALERT_<hex> id).
  - elderPhone is carried into the record and every push payload (for "Call Elder").

Run: .\\venv\\Scripts\\python.exe test_escalation_tiers.py
"""

import os

from src.escalation import (
    AlertGateway, ElderContext, ExpoPushNotifier, LocalJsonSink, MockPushNotifier,
)

TMP_SINK = os.path.join("logs", "_tier_test_alerts.json")
EP = "EP_ab12cd34"


class FakeM4:
    def __init__(self, alert=False, alert_type=None, episode_id=None, tier_event=None):
        self.alert = alert
        self.alert_type = alert_type
        self.episode_id = episode_id
        self.tier_event = tier_event


def make_gateway(notifier=None):
    sink = LocalJsonSink(TMP_SINK)
    sink.clear()
    notifier = notifier or MockPushNotifier()
    ctx = ElderContext(
        elder_id="ELDER_T1", elder_name="Test Resident", room_location="Room 7",
        assigned_caretaker_id="CARE_T1", elder_phone="+91-9000000000",
    )
    gw = AlertGateway(ctx, sinks=[sink], notifiers=[notifier])
    return gw, sink, notifier


def warning():
    return FakeM4(tier_event="PRE_FALL_WARNING", episode_id=EP)


def impact(p_fall=0.95):
    return FakeM4(alert=True, alert_type="FALL_IMPACT", episode_id=EP)


def cancel():
    return FakeM4(tier_event="SELF_RECOVERY_CANCELLED", episode_id=EP)


def test_warning_creates_warning_doc():
    gw, sink, push = make_gateway()
    rec = gw.handle_m4(warning(), p_fall=0.35)
    recs = sink.read_all()
    assert rec is not None and len(recs) == 1
    r = recs[0]
    assert r["alertId"] == EP
    assert r["status"] == "WARNING"
    assert r["eventType"] == "PRE_FALL_WARNING"
    assert r["tier"] == 1
    assert r["elderPhone"] == "+91-9000000000"
    assert len(push.sent) == 1 and push.sent[0]["alertId"] == EP


def test_duplicate_warning_ignored():
    gw, sink, push = make_gateway()
    gw.handle_m4(warning(), p_fall=0.35)
    assert gw.handle_m4(warning(), p_fall=0.4) is None
    assert len(sink.read_all()) == 1
    assert len(push.sent) == 1


def test_impact_updates_same_doc():
    gw, sink, push = make_gateway()
    gw.handle_m4(warning(), p_fall=0.35)
    gw.handle_m4(impact(), p_fall=0.95)
    recs = sink.read_all()
    assert len(recs) == 1, "impact must UPDATE the warning doc, not create a new one"
    r = recs[0]
    assert r["status"] == "CREATED"
    assert r["eventType"] == "FALL_IMPACT"
    assert r["tier"] == 2
    assert r["fallProbability"] == 0.95
    assert len(push.sent) == 2


def test_long_lie_updates_same_doc():
    gw, sink, push = make_gateway()
    gw.handle_m4(warning(), p_fall=0.35)
    gw.handle_m4(impact(), p_fall=0.95)
    gw.handle_m4(FakeM4(alert=True, alert_type="LONG_LIE_ALERT", episode_id=EP), p_fall=0.5)
    recs = sink.read_all()
    assert len(recs) == 1
    assert recs[0]["eventType"] == "LONG_LIE_ALERT"
    assert recs[0]["tier"] == 3
    assert len(push.sent) == 3


def test_cancel_closes_episode():
    gw, sink, push = make_gateway()
    gw.handle_m4(warning(), p_fall=0.35)
    gw.handle_m4(cancel())
    recs = sink.read_all()
    assert len(recs) == 1
    r = recs[0]
    assert r["status"] == "AUTO_CANCELLED"
    assert r["eventType"] == "SELF_RECOVERY_CANCELLED"
    assert r["tier"] == 0
    assert "resolvedAt" in r
    assert len(push.sent) == 2
    # cancelling an unknown episode is a no-op
    assert gw.handle_m4(cancel()) is None
    assert len(sink.read_all()) == 1


def test_impact_without_warning_falls_back():
    gw, sink, push = make_gateway()
    gw.handle_m4(FakeM4(alert=True, alert_type="FALL_IMPACT", episode_id=None), p_fall=0.9)
    recs = sink.read_all()
    assert len(recs) == 1
    assert recs[0]["alertId"].startswith("ALERT_")
    assert recs[0]["status"] == "CREATED"
    assert len(push.sent) == 1


def test_manual_sos_tier2():
    gw, sink, push = make_gateway()
    rec = gw.manual_sos()
    recs = sink.read_all()
    assert len(recs) == 1
    assert recs[0]["eventType"] == "MANUAL_SOS"
    assert recs[0]["tier"] == 2
    assert rec["alertId"] == recs[0]["alertId"]


def test_tiered_push_payloads():
    captured = []

    def transport(messages):
        captured.extend(messages)
        return {"data": [{"status": "ok"}]}

    expo = ExpoPushNotifier(
        token_resolver=lambda record: ["ExponentPushToken[caretaker-test]"],
        transport=transport,
    )
    gw, sink, _ = make_gateway(notifier=expo)
    gw.handle_m4(warning(), p_fall=0.35)
    gw.handle_m4(impact(), p_fall=0.95)
    gw.handle_m4(cancel())

    assert len(captured) == 3, f"expected 3 pushes, got {len(captured)}"
    w, i, c = captured
    assert w["channelId"] == "warnings" and w.get("sound") is None and w["data"]["tier"] == 1
    assert i["channelId"] == "emergency-alerts-v4" and i["sound"] == "default" and i["data"]["tier"] == 2
    assert i.get("interruptionLevel") == "time-sensitive"
    assert i["priority"] == "high"
    assert c["channelId"] == "warnings" and c["data"]["tier"] == 0
    for m in captured:
        assert m["data"]["alertId"] == EP
        assert m["data"]["elderPhone"] == "+91-9000000000"


def main():
    tests = [
        test_warning_creates_warning_doc,
        test_duplicate_warning_ignored,
        test_impact_updates_same_doc,
        test_long_lie_updates_same_doc,
        test_cancel_closes_episode,
        test_impact_without_warning_falls_back,
        test_manual_sos_tier2,
        test_tiered_push_payloads,
    ]
    for t in tests:
        t()
        print(f"  [ok] {t.__name__}")
    if os.path.isfile(TMP_SINK):
        os.remove(TMP_SINK)
    print(f"[Escalation tiers: {len(tests)}/{len(tests)} passed]")


if __name__ == "__main__":
    main()

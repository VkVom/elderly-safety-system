"""Checks that an explicitly empty live delivery list does not create fake channels."""

from src.escalation import AlertGateway, ElderContext, ExpoPushNotifier, LocalJsonSink


def test_explicitly_empty_notifier_list_does_not_install_mock_delivery():
    gateway = AlertGateway(
        ElderContext("ELDER_TEST", "Test Resident", "Room 1", "CARE_TEST"),
        sinks=[LocalJsonSink("logs/_test_no_mock_alerts.json")],
        notifiers=[],
    )

    assert gateway.notifiers == []


def test_emergency_push_payload_contains_metadata_but_no_video_or_frame():
    notifier = ExpoPushNotifier(
        token_resolver=lambda _record: ["ExponentPushToken[test]"],
        transport=lambda _messages: {"data": [{"status": "ok"}]},
    )
    record = {
        "alertId": "ALERT_TEST", "elderId": "ELDER_TEST",
        "elderName": "Test Resident", "roomLocation": "Room 1",
        "eventType": "FALL_IMPACT", "assignedCaretakerId": "CARE_TEST",
        "frame": b"private image bytes", "videoUrl": "private-video-url",
    }
    payload = notifier._build_messages(record)[0]
    serialized = repr(payload).lower()
    assert "private image bytes" not in serialized
    assert "video" not in serialized and "frame" not in serialized


if __name__ == "__main__":
    test_explicitly_empty_notifier_list_does_not_install_mock_delivery()
    test_emergency_push_payload_contains_metadata_but_no_video_or_frame()
    print("[alert gateway channel/privacy tests: 2/2 passed]")

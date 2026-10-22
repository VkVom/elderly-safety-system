"""Expo response validation prevents an HTTP response from being called delivery."""

from src.escalation import ExpoPushNotifier


def _record():
    return {
        "alertId": "ALERT_TEST", "elderId": "ELDER_1",
        "elderName": "Test Resident", "roomLocation": "Room 1",
        "eventType": "FALL_IMPACT", "assignedCaretakerId": "CARE_1",
    }


def test_expo_notifier_rejects_error_ticket():
    notifier = ExpoPushNotifier(
        token_resolver=lambda _record: ["ExponentPushToken[test]"],
        transport=lambda _messages: {"data": [{"status": "error", "message": "bad token"}]},
    )
    try:
        notifier.notify(_record())
    except RuntimeError as exc:
        assert "bad token" in str(exc)
    else:
        raise AssertionError("an Expo error ticket must not be reported as accepted")


def test_expo_notifier_rejects_missing_recipient_tokens():
    notifier = ExpoPushNotifier(token_resolver=lambda _record: [], transport=lambda _messages: {})
    try:
        notifier.notify(_record())
    except RuntimeError as exc:
        assert "push token" in str(exc).lower()
    else:
        raise AssertionError("missing recipient tokens must be surfaced")


if __name__ == "__main__":
    test_expo_notifier_rejects_error_ticket()
    test_expo_notifier_rejects_missing_recipient_tokens()
    print("[push delivery receipt tests: 2/2 passed]")

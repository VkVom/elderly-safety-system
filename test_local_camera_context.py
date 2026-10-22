"""Local-only camera mode must not require a Firebase resident lookup."""

import src.elder_picker as elder_picker
from src.elder_picker import local_elder_context, resolve_live_elder


def test_local_context_uses_safe_placeholder_and_no_caretaker_route():
    ctx = local_elder_context(None)
    assert ctx.elder_id == "ELDER_LOCAL_TEST"
    assert ctx.elder_name == "Local Test Resident"
    assert ctx.room_location == "Local Camera"
    assert ctx.assigned_caretaker_id is None


def test_local_context_preserves_only_explicit_local_label():
    ctx = local_elder_context("camera-test-1")
    assert ctx.elder_id == "camera-test-1"
    assert ctx.assigned_caretaker_id is None


def test_local_only_resolution_does_not_query_firebase_picker():
    def forbidden_picker(**_kwargs):
        raise AssertionError("local-only mode must not resolve a Firebase resident")

    original_picker = elder_picker.pick_elder
    elder_picker.pick_elder = forbidden_picker
    try:
        ctx, choice, db = resolve_live_elder("camera-test-1", None, local_only=True)
    finally:
        elder_picker.pick_elder = original_picker
    assert ctx.elder_id == "camera-test-1"
    assert choice is None and db is None


if __name__ == "__main__":
    test_local_context_uses_safe_placeholder_and_no_caretaker_route()
    test_local_context_preserves_only_explicit_local_label()
    test_local_only_resolution_does_not_query_firebase_picker()
    print("[local camera context tests: 3/3 passed]")

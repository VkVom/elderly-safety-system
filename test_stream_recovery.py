"""Tests for failed and successful live capture reopen attempts."""

from src.stream_recovery import reopen_capture, reset_temporal_state


class FakeCapture:
    def __init__(self, opened):
        self.opened = opened
        self.released = False

    def isOpened(self):
        return self.opened

    def release(self):
        self.released = True


def test_reopen_releases_old_capture_waits_and_returns_open_replacement():
    old = FakeCapture(True)
    replacement = FakeCapture(True)
    delays = []
    sources = []

    new_cap, delay = reopen_capture(
        "rtsp://camera/stream", 2, old,
        lambda source: (sources.append(source) or replacement),
        delays.append,
    )

    assert old.released
    assert new_cap is replacement
    assert delay == 2.0 and delays == [2.0]
    assert sources == ["rtsp://camera/stream"]


def test_reopen_releases_a_replacement_that_failed_to_open():
    old = FakeCapture(True)
    replacement = FakeCapture(False)
    new_cap, _delay = reopen_capture(
        0, 1, old, lambda _source: replacement, lambda _delay: None,
    )
    assert old.released and replacement.released
    assert new_cap is None


def test_stream_gap_resets_all_motion_histories_and_returns_neutral_probability():
    class ResetSpy:
        def __init__(self):
            self.calls = 0

        def reset_context(self):
            self.calls += 1

        def reset(self):
            self.calls += 1

    perception, kinematics, temporal = ResetSpy(), ResetSpy(), ResetSpy()
    p_fall = reset_temporal_state(perception, kinematics, temporal)

    assert perception.calls == kinematics.calls == temporal.calls == 1
    assert p_fall == 0.0


if __name__ == "__main__":
    test_reopen_releases_old_capture_waits_and_returns_open_replacement()
    test_reopen_releases_a_replacement_that_failed_to_open()
    test_stream_gap_resets_all_motion_histories_and_returns_neutral_probability()
    print("[stream recovery tests: 3/3 passed]")

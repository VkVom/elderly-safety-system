"""Regression checks for the timestamps used by the video perception pipeline."""

import math

from src.m1_perception import SingleAuthorityPerception
from src.frame_timing import frame_interval, normalize_fps, reconnect_delay_s


def test_m1_uses_supplied_video_timestamp_and_keeps_it_strictly_increasing():
    engine = object.__new__(SingleAuthorityPerception)
    engine._frame_index = 1
    engine._last_video_timestamp_ms = None

    assert engine._resolve_video_timestamp_ms(0.0) == 0
    assert engine._resolve_video_timestamp_ms(103.7) == 104
    # Some stream backends can repeat/round timestamps to the same millisecond.
    assert engine._resolve_video_timestamp_ms(103.7) == 105


def test_m1_keeps_30_fps_fallback_for_legacy_callers():
    engine = object.__new__(SingleAuthorityPerception)
    engine._frame_index = 3
    engine._last_video_timestamp_ms = None

    assert engine._resolve_video_timestamp_ms(None) == 100


def test_frame_interval_uses_elapsed_time_and_marks_stream_gaps():
    dt, gap = frame_interval(10.10, 10.0, 30.0)
    assert math.isclose(dt, 0.1) and gap is False
    dt, gap = frame_interval(11.0, 10.0, 30.0)
    assert dt == 1.0 and gap is True


def test_frame_interval_bootstrap_and_fps_validation():
    assert frame_interval(5.0, None, 25.0) == (0.04, False)
    assert normalize_fps(0) == 30.0
    assert normalize_fps(200) == 30.0


def test_reconnect_backoff_is_exponential_and_capped():
    assert [reconnect_delay_s(n) for n in range(1, 6)] == [1.0, 2.0, 4.0, 8.0, 16.0]
    assert reconnect_delay_s(10) == 30.0


if __name__ == "__main__":
    test_m1_uses_supplied_video_timestamp_and_keeps_it_strictly_increasing()
    test_m1_keeps_30_fps_fallback_for_legacy_callers()
    test_frame_interval_uses_elapsed_time_and_marks_stream_gaps()
    test_frame_interval_bootstrap_and_fps_validation()
    test_reconnect_backoff_is_exponential_and_capped()
    print("[frame timestamp tests: 5/5 passed]")

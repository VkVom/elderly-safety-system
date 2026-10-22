"""Tests for producing M3 inputs on the cadence used during training."""

import numpy as np

from src.m3_temporal_model import TemporalBufferManager


def test_timed_buffer_returns_fixed_25_hz_window_at_low_capture_rate():
    buf = TemporalBufferManager(target_fps=25.0)
    window = None
    # Simulate ~9 FPS input with a feature changing linearly over time.
    for i in range(20):
        timestamp = i / 9.0
        features = np.full(72, 2.0 * timestamp, dtype=np.float32)
        window = buf.update(features, True, timestamp_s=timestamp)

    assert window is not None
    assert window.shape == (15, 72)
    expected = np.linspace((19 / 9.0) - 14 / 25.0, 19 / 9.0, 15) * 2.0
    np.testing.assert_allclose(window[:, 0], expected, atol=1e-5)


def test_timed_buffer_waits_for_full_window_and_resets_on_gap_or_invalid_pose():
    buf = TemporalBufferManager(target_fps=25.0, max_gap_s=0.5)
    for i in range(14):
        assert buf.update(np.ones(72), True, timestamp_s=i / 25.0) is None
    assert buf.update(np.ones(72), True, timestamp_s=14 / 25.0) is not None

    # A gap cannot be interpolated across; the new stream segment must warm up.
    assert buf.update(np.ones(72), True, timestamp_s=2.0) is None
    assert not buf.ready
    assert buf.update(np.ones(72), False, timestamp_s=2.04) is None
    assert not buf.ready


def test_timed_buffer_rejects_non_increasing_timestamps():
    buf = TemporalBufferManager(target_fps=25.0)
    assert buf.update(np.ones(72), True, timestamp_s=1.0) is None
    assert buf.update(np.ones(72), True, timestamp_s=1.0) is None
    assert not buf.ready


def test_timed_buffer_rejects_non_finite_features_and_bad_gap_setting():
    buf = TemporalBufferManager(target_fps=25.0)
    values = np.ones(72, dtype=np.float32)
    values[5] = np.nan
    assert buf.update(values, True, timestamp_s=0.0) is None
    assert not buf.ready

    try:
        TemporalBufferManager(max_gap_s=0.0)
    except ValueError:
        pass
    else:
        raise AssertionError("max_gap_s must be positive")


if __name__ == "__main__":
    test_timed_buffer_returns_fixed_25_hz_window_at_low_capture_rate()
    test_timed_buffer_waits_for_full_window_and_resets_on_gap_or_invalid_pose()
    test_timed_buffer_rejects_non_increasing_timestamps()
    test_timed_buffer_rejects_non_finite_features_and_bad_gap_setting()
    print("[M3 time buffer tests: 4/4 passed]")

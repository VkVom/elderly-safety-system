"""Tests rebuilding fixed-cadence M3 windows from sliding feature windows."""

import numpy as np

from src.feature_rewindow import rewindow_feature_arrays


def _sliding_windows(sequence, length):
    return np.stack([sequence[i:i + length] for i in range(len(sequence) - length + 1)])


def test_rewindows_30_fps_windows_onto_25_fps_time_grid():
    fps = 30.0
    timestamps = np.arange(50, dtype=np.float32) / fps
    sequence = np.zeros((len(timestamps), 72), dtype=np.float32)
    sequence[:, 0] = timestamps * 2.0
    windows = _sliding_windows(sequence, 15)
    labels = np.zeros(len(windows), dtype=np.int64)
    groups = np.array(["gmdcsa_Subject1_ADL_01.mp4"] * len(windows))

    out_x, out_y, out_g = rewindow_feature_arrays(
        windows, labels, groups, lambda _group: fps,
    )

    assert out_x.shape[1:] == (15, 72)
    assert len(out_x) > 0 and np.all(out_y == 0)
    assert np.all(out_g == groups[0])
    expected = np.linspace(out_x[0, 0, 0] / 2, out_x[0, -1, 0] / 2, 15) * 2
    np.testing.assert_allclose(out_x[0, :, 0], expected, atol=1e-5)
    assert np.isclose(out_x[0, -1, 0] - out_x[0, 0, 0], 2 * 14 / 25, atol=1e-5)


def test_rewindow_does_not_join_disconnected_segments_within_one_clip():
    fps = 30.0
    first = np.zeros((20, 72), dtype=np.float32)
    second = np.zeros((20, 72), dtype=np.float32)
    first[:, 0] = np.arange(20) / fps
    second[:, 0] = 100 + np.arange(20) / fps
    windows = np.concatenate((_sliding_windows(first, 15), _sliding_windows(second, 15)))
    labels = np.zeros(len(windows), dtype=np.int64)
    groups = np.array(["gmdcsa_Subject1_ADL_01.mp4"] * len(windows))

    out_x, _out_y, _out_g = rewindow_feature_arrays(
        windows, labels, groups, lambda _group: fps,
    )

    assert len(out_x) > 0
    mins = out_x[:, :, 0].min(axis=1)
    maxs = out_x[:, :, 0].max(axis=1)
    assert np.any(maxs < 1.0) and np.any(mins > 99.0)
    assert not np.any((mins < 50) & (maxs > 50))


if __name__ == "__main__":
    test_rewindows_30_fps_windows_onto_25_fps_time_grid()
    test_rewindow_does_not_join_disconnected_segments_within_one_clip()
    print("[feature rewindow tests: 2/2 passed]")

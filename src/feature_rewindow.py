"""Rebuild fixed-cadence M3 windows from cached sliding M2 feature windows."""

from typing import Callable, List, Tuple

import numpy as np

from .frame_timing import normalize_fps
from .m3_temporal_model import TemporalBufferManager
from .m2_kinematics import sanitize_motion_features

IDX_TILT = 66
IDX_HIP_VY = 67


def _clip_label(group: str, window: np.ndarray) -> int:
    """Reapply the dataset's class and kinematic label rules to a resampled window."""
    label = str(group).lower()
    if label.startswith("le2i_"):
        return int("_fall_" in label)
    if "_adl_" in label or "_adl" in label:
        return 0
    if "fall" not in label:
        return 0
    tilt_deg = np.degrees(window[:, IDX_TILT]).max()
    max_downward_velocity = window[:, IDX_HIP_VY].max()
    return int(tilt_deg >= 60.0 and max_downward_velocity >= 2.0)


def _windows_for_segment(segment: np.ndarray, group: str, fps: float):
    buffer = TemporalBufferManager(target_fps=25.0)
    out_x, out_y = [], []
    for frame_index, feature_row in enumerate(segment, start=1):
        feature_row, _motion_reliable = sanitize_motion_features(feature_row)
        window = buffer.update(feature_row, True, timestamp_s=frame_index / fps)
        if window is not None:
            out_x.append(window)
            out_y.append(_clip_label(group, window))
    return out_x, out_y


def _rewindow_run(windows: np.ndarray, group: str, fps: float):
    """Recover each uninterrupted feature sequence from overlapping old windows."""
    if len(windows) == 0:
        return [], []
    xs: List[np.ndarray] = []
    ys: List[int] = []
    sequence = list(windows[0].copy())
    previous = windows[0]

    def flush():
        sx, sy = _windows_for_segment(np.stack(sequence, axis=0), group, fps)
        xs.extend(sx)
        ys.extend(sy)

    for current in windows[1:]:
        if np.array_equal(previous[1:], current[:-1]):
            sequence.append(current[-1].copy())
        else:
            flush()
            sequence = list(current.copy())
        previous = current
    flush()
    return xs, ys


def rewindow_feature_arrays(
    X: np.ndarray,
    y: np.ndarray,
    groups: np.ndarray,
    fps_resolver: Callable[[str], float],
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Convert old frame-count windows into 25 FPS windows without crossing gaps.

    The old extractor emitted one window per valid source frame. Its overlap lets us
    reconstruct each uninterrupted feature sequence exactly, then interpolate it
    onto the same 25 Hz timeline used by live M3 inference. Group run order is retained
    so clips and train/validation partitions stay separate.
    """
    X = np.asarray(X, dtype=np.float32)
    y = np.asarray(y)
    groups = np.asarray(groups)
    if X.ndim != 3 or len(X) != len(y) or len(y) != len(groups):
        raise ValueError("X, y, and groups must be aligned window arrays")
    if len(X) == 0:
        return (np.empty((0, 15, 72), dtype=np.float32),
                np.empty((0,), dtype=np.int64), np.empty((0,), dtype=groups.dtype))

    out_x: List[np.ndarray] = []
    out_y: List[int] = []
    out_g: List[str] = []
    run_start = 0
    while run_start < len(groups):
        group = str(groups[run_start])
        run_end = run_start + 1
        while run_end < len(groups) and str(groups[run_end]) == group:
            run_end += 1
        fps = normalize_fps(fps_resolver(group))
        xs, ys = _rewindow_run(X[run_start:run_end], group, fps)
        out_x.extend(xs)
        out_y.extend(ys)
        out_g.extend([group] * len(xs))
        run_start = run_end

    if not out_x:
        return (np.empty((0, X.shape[1], X.shape[2]), dtype=np.float32),
                np.empty((0,), dtype=np.int64), np.empty((0,), dtype=groups.dtype))
    return (np.stack(out_x).astype(np.float32), np.asarray(out_y, dtype=np.int64),
            np.asarray(out_g, dtype=groups.dtype))

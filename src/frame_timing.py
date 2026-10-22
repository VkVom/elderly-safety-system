"""Helpers for source-time-aware video processing."""

import math
from typing import Optional, Tuple


def normalize_fps(value: float, fallback: float = 30.0) -> float:
    """Reject missing or implausible capture metadata and use a safe FPS fallback."""
    try:
        fps = float(value)
    except (TypeError, ValueError):
        return fallback
    return fps if math.isfinite(fps) and 1.0 <= fps <= 120.0 else fallback


def reconnect_delay_s(attempt: int, initial_s: float = 1.0, maximum_s: float = 30.0) -> float:
    """Return capped exponential backoff for consecutive camera reconnect attempts."""
    attempt = int(attempt)
    initial_s = float(initial_s)
    maximum_s = float(maximum_s)
    if attempt < 1:
        raise ValueError("attempt must be >= 1")
    if not math.isfinite(initial_s) or initial_s <= 0:
        raise ValueError("initial_s must be finite and positive")
    if not math.isfinite(maximum_s) or maximum_s < initial_s:
        raise ValueError("maximum_s must be finite and >= initial_s")
    return min(initial_s * (2 ** min(attempt - 1, 30)), maximum_s)


def frame_interval(
    timestamp_s: float,
    previous_timestamp_s: Optional[float],
    nominal_fps: float,
) -> Tuple[float, bool]:
    """Return observed frame interval and whether it exceeds the gap threshold.

    The first frame uses nominal FPS because there is no earlier capture timestamp.
    Later frames use measured monotonic timestamps. Three missing frame intervals,
    or half a second, marks a discontinuity; downstream temporal history should not
    bridge it.
    """
    fps = normalize_fps(nominal_fps)
    if previous_timestamp_s is None:
        return 1.0 / fps, False

    dt = float(timestamp_s) - float(previous_timestamp_s)
    if not math.isfinite(dt) or dt <= 0.0:
        raise ValueError("frame timestamps must be finite and strictly increasing")

    gap_threshold_s = max(0.5, 3.0 / fps)
    return dt, dt > gap_threshold_s

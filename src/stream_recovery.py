"""Small, testable helpers for reopening live OpenCV captures after read failures."""

import time
from typing import Callable, Optional, Tuple

from .frame_timing import reconnect_delay_s


def reset_temporal_state(perception, kinematics, temporal_buffer) -> float:
    """Clear cross-frame vision/model history after a live stream discontinuity.

    M4 is deliberately not reset: an in-progress confirmation episode remains
    active, while its elapsed confirmation time is paused by the caller's zero dt.
    The caller also uses the returned neutral probability until M3 refills a window.
    """
    perception.reset_context()
    kinematics.reset()
    temporal_buffer.reset()
    return 0.0


def reopen_capture(
    source,
    attempt: int,
    current_capture,
    open_capture: Callable,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> Tuple[Optional[object], float]:
    """Release a failed capture, back off, and open a replacement if possible."""
    delay_s = reconnect_delay_s(attempt)
    current_capture.release()
    sleep_fn(delay_s)
    replacement = open_capture(source)
    if not replacement.isOpened():
        replacement.release()
        return None, delay_s
    return replacement, delay_s

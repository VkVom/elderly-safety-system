"""
Module 2: Scale-Normalized Kinematic Vector Extractor (M2)
Project: Proactive Elderly Safety System for Pre-Impact Fall Anticipation
Author: M2 Owner (Vinay / G14 Team)

Responsibilities:
- Consume the 33 3D keypoints produced by M1 (SingleAuthorityPerception).
- Produce a fixed-size, scale-normalized 72-element feature vector per frame for M3.
- Derive kinematic descriptors (trunk tilt, joint velocities, centre-of-mass velocity,
  jerk) that carry the pre-impact fall signal.

Design notes:
- SCALE NORMALIZATION: keypoints are recentred on the hip midpoint and divided by the
  torso length (shoulder-centre to hip-centre distance). This makes features invariant
  to the subject's distance from the camera and to body size, which is essential for a
  classifier that must generalise across people and rooms.
- HONEST GAPS: M1 reports pose_status == "LOST" (keypoints is None) when the person
  cannot be reliably found. M2 does NOT invent motion across those gaps. The velocity
  history is reset so that stale poses never produce fake velocities/jerk; the frame is
  returned with valid=False and a zero feature vector.

Feature layout (72 elements):
    [0:66]   33 landmarks x (x, y) scale-normalised positions   -> 66
    [66]     trunk tilt angle from vertical (radians)
    [67]     hip-centre vertical velocity        (norm units / second)
    [68]     hip-centre horizontal velocity
    [69]     shoulder-centre vertical velocity
    [70]     centre-of-mass vertical velocity
    [71]     hip-centre jerk magnitude
"""

import math
from collections import deque
from typing import Dict, Optional, Tuple

import numpy as np

# MediaPipe Pose landmark indices (33-landmark topology).
L_SHOULDER, R_SHOULDER = 11, 12
L_HIP, R_HIP = 23, 24

FEATURE_DIM = 72
NUM_LANDMARKS = 33

# A representative subset of landmarks used to approximate the body centre of mass.
# (shoulders, hips, knees, ankles) - stable, high-visibility joints.
COM_LANDMARKS = [11, 12, 23, 24, 25, 26, 27, 28]


class KinematicExtractor:
    """
    Converts a stream of M1 keypoint frames into scale-normalised 72-D feature vectors.

    Call `process(keypoints, quality, timestamp_s)` once per frame, where:
      - keypoints  : (33, 4) array [x, y, z, visibility] from M1, or None if pose LOST
      - quality    : the quality dict from M1 (uses pose_status / held_frame)
      - timestamp_s: monotonic frame time in seconds (used for finite differences)
    """

    def __init__(self, history: int = 3):
        # Store recent (timestamp, centre-points) for finite-difference velocity/jerk.
        self._hist = deque(maxlen=history)
        self._last_hip_accel: Optional[float] = None
        self._last_valid_timestamp: Optional[float] = None

    def reset(self):
        """Drop temporal history (used when the pose is lost, so no motion carries over)."""
        self._hist.clear()
        self._last_hip_accel = None
        self._last_valid_timestamp = None

    @staticmethod
    def _centre(points: np.ndarray, i: int, j: int) -> np.ndarray:
        return (points[i, :2] + points[j, :2]) / 2.0

    def process(
        self,
        keypoints: Optional[np.ndarray],
        quality: Optional[Dict] = None,
        timestamp_s: float = 0.0,
    ) -> Tuple[np.ndarray, bool, Dict]:
        """
        Returns (features (72,), valid, info).
        When the pose is unavailable, returns a zero vector with valid=False and resets
        the velocity history so stale motion never leaks across a tracking gap.
        """
        info: Dict = {"reason": None}

        if keypoints is None or len(keypoints) < NUM_LANDMARKS:
            self.reset()
            info["reason"] = "no_pose"
            return np.zeros(FEATURE_DIM, dtype=np.float32), False, info

        pts = np.asarray(keypoints, dtype=np.float32)

        # --- Scale normalisation ---------------------------------------------------
        hip_centre = self._centre(pts, L_HIP, R_HIP)
        shoulder_centre = self._centre(pts, L_SHOULDER, R_SHOULDER)
        torso_vec = shoulder_centre - hip_centre
        torso_len = float(np.linalg.norm(torso_vec))

        if torso_len < 1e-6:
            # Degenerate pose (e.g. collapsed keypoints) - cannot normalise reliably.
            self.reset()
            info["reason"] = "degenerate_torso"
            return np.zeros(FEATURE_DIM, dtype=np.float32), False, info

        norm_xy = (pts[:, :2] - hip_centre) / torso_len  # (33, 2), hip-centred, scale-free

        # --- Trunk tilt from vertical ---------------------------------------------
        # Image y grows downward; "upright" torso points upward (shoulders above hips).
        # Angle between torso vector and the vertical axis.
        tilt = math.atan2(abs(torso_vec[0]), abs(torso_vec[1]))  # 0 = upright, ~pi/2 = horizontal

        # --- Centres used for kinematics --------------------------------------------
        # Velocities must be measured against a stable external frame, NOT the hip-
        # centred frame (where the hip is the origin and would trivially have zero
        # velocity). We divide raw image coordinates by torso length: this keeps scale
        # invariance (body-size / distance independent) while still capturing how far
        # the body travels across the image - i.e. the actual fall descent.
        hip_n = hip_centre / torso_len
        shoulder_n = shoulder_centre / torso_len
        com_raw = np.mean(pts[COM_LANDMARKS, :2], axis=0)
        com_n = com_raw / torso_len

        # Velocities via finite difference against the previous valid frame.
        v_hip = np.zeros(2, dtype=np.float32)
        v_shoulder_y = 0.0
        v_com_y = 0.0
        jerk = 0.0

        if self._hist:
            t_prev, prev = self._hist[-1]
            dt = timestamp_s - t_prev
            if dt > 1e-6:
                v_hip = (hip_n - prev["hip"]) / dt
                v_shoulder_y = float((shoulder_n[1] - prev["shoulder"][1]) / dt)
                v_com_y = float((com_n[1] - prev["com"][1]) / dt)
                # Jerk from change in hip acceleration (needs 2 prior samples).
                if len(self._hist) >= 2 and self._last_valid_timestamp is not None:
                    accel = float(np.linalg.norm(v_hip - prev["v_hip"]) / dt)
                    if self._last_hip_accel is not None:
                        jerk = abs(accel - self._last_hip_accel) / dt
                    self._last_hip_accel = accel

        # Record this frame's centres for the next difference.
        self._hist.append((timestamp_s, {
            "hip": hip_n,
            "shoulder": shoulder_n,
            "com": com_n,
            "v_hip": v_hip,
        }))
        self._last_valid_timestamp = timestamp_s

        # --- Assemble the 72-D feature vector --------------------------------------
        features = np.empty(FEATURE_DIM, dtype=np.float32)
        features[0:66] = norm_xy.reshape(-1)
        features[66] = tilt
        features[67] = float(v_hip[1])       # hip vertical velocity
        features[68] = float(v_hip[0])       # hip horizontal velocity
        features[69] = v_shoulder_y
        features[70] = v_com_y
        features[71] = float(jerk)

        info["reason"] = "ok"
        info["held_frame"] = bool(quality.get("held_frame", False)) if quality else False
        info["trunk_tilt_deg"] = round(math.degrees(tilt), 1)
        info["hip_v_y"] = round(float(v_hip[1]), 4)
        return features, True, info


# Self-test block for Phase 2 verification.
if __name__ == "__main__":
    print("Executing M2 Kinematic Extractor Self-Test...")
    extractor = KinematicExtractor()

    # Synthesise an upright pose, then the same pose shifted downward, to exercise
    # scale-normalisation + vertical velocity without needing a real video.
    def make_pose(offset_y=0.0):
        kp = np.zeros((33, 4), dtype=np.float32)
        kp[L_SHOULDER] = [0.45, 0.30 + offset_y, 0, 1.0]
        kp[R_SHOULDER] = [0.55, 0.30 + offset_y, 0, 1.0]
        kp[L_HIP] = [0.46, 0.55 + offset_y, 0, 1.0]
        kp[R_HIP] = [0.54, 0.55 + offset_y, 0, 1.0]
        for idx in (25, 26, 27, 28):
            kp[idx] = [0.5, 0.75 + offset_y, 0, 1.0]
        return kp

    f0, v0, i0 = extractor.process(make_pose(0.0), {"held_frame": False}, timestamp_s=0.0)
    f1, v1, i1 = extractor.process(make_pose(0.10), {"held_frame": False}, timestamp_s=1 / 30)

    print(f"Frame 0 -> valid={v0}, dim={f0.shape[0]}, tilt={i0['trunk_tilt_deg']} deg")
    print(f"Frame 1 -> valid={v1}, hip_v_y={i1['hip_v_y']} (positive = moving down)")

    # Lost pose must reset history and be honest.
    fL, vL, iL = extractor.process(None, {"pose_status": "LOST"}, timestamp_s=2 / 30)
    print(f"Lost    -> valid={vL}, reason={iL['reason']}, sum={float(np.sum(fL))}")

    assert f0.shape[0] == FEATURE_DIM
    assert v0 and v1 and not vL
    print("[M2 Phase-2 Test Passed!]")

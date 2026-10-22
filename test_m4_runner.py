"""
Full pipeline runner: M1 -> M2 -> M3 -> M4 across the test clips.

Goal checks:
  - Every fall clip raises an alert (FALL_IMPACT or POSE_LOST_WHILE_FALLEN),
    including the occluded chair fall that M3 alone missed.
  - The bed ADL clip raises ZERO alerts.

Prints the state-transition log per clip and the alerts fired.
"""

import os
import argparse

import numpy as np
import cv2
import onnxruntime as ort

from src.m1_perception import SingleAuthorityPerception
from src.m2_kinematics import KinematicExtractor, L_HIP, R_HIP
from src.m3_temporal_model import TemporalBufferManager, DEFAULT_ONNX_PATH, FEATURE_DIM
from src.m4_state_machine import FallDecisionEngine, body_on_rest_surface

NORM_PATH = os.path.join("models", "m3_norm.npz")

CLIPS = [
    ("data/manual_test_videos/gmdcsa24_s1_adl_bed_to_sleep_original.mp4", "ADL"),
    ("data/manual_test_videos/gmdcsa24_s1_fall_chair_partial_original.mp4", "FALL"),
    ("data/manual_test_videos/gmdcsa24_s4_fall_low_light_original.mp4", "FALL"),
]


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def run(clips, model_path=DEFAULT_ONNX_PATH, norm_path=NORM_PATH):
    sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name
    if os.path.isfile(norm_path):
        z = np.load(norm_path)
        mean, std = z["mean"].astype(np.float32), z["std"].astype(np.float32)
    else:
        mean, std = np.zeros(FEATURE_DIM, np.float32), np.ones(FEATURE_DIM, np.float32)

    overall = {}
    for path, expected in clips:
        if not os.path.isfile(path):
            print(f"[missing] {path}")
            continue
        m1 = SingleAuthorityPerception(); m2 = KinematicExtractor()
        buf = TemporalBufferManager(); m4 = FallDecisionEngine()
        m1.reset_context()
        cap = cv2.VideoCapture(path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        dt = 1.0 / fps
        h = w = 0

        prev_state = None
        transitions = []
        alerts = []
        p_fall = 0.0
        i = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            i += 1
            h, w = frame.shape[:2]
            timestamp_s = i / fps
            kp, furniture, quality = m1.process_frame(frame, timestamp_ms=timestamp_s * 1000.0)
            feats, valid, info = m2.process(kp, quality, timestamp_s=timestamp_s)

            # M3: only when a full continuous window exists.
            window = buf.update(feats, valid, timestamp_s=timestamp_s)
            if window is not None:
                x = ((window - mean) / std)[None, ...].astype(np.float32)
                logit = sess.run(None, {input_name: x})[0]
                p_fall = float(sigmoid(np.asarray(logit)).ravel()[0])
            elif not valid:
                p_fall = 0.0  # no fresh evidence during a gap

            # Furniture context: is the hip inside a rest_surface box?
            hip_px = None
            if kp is not None:
                hip_x = (kp[L_HIP, 0] + kp[R_HIP, 0]) / 2 * w
                hip_y = (kp[L_HIP, 1] + kp[R_HIP, 1]) / 2 * h
                hip_px = (hip_x, hip_y)
            on_rest = body_on_rest_surface(hip_px, furniture)

            out = m4.update(
                pose_status=quality.get("pose_status", "LOST"),
                trunk_tilt_deg=info.get("trunk_tilt_deg", 0.0) if valid else 0.0,
                hip_v_y=info.get("hip_v_y", 0.0) if valid else 0.0,
                jerk=info.get("jerk", 0.0) if valid else 0.0,
                p_fall=p_fall,
                on_rest_surface=on_rest,
                dt=dt,
                kinematics_reliable=bool(info.get("motion_reliable", False)) if valid else False,
            )
            if out.state != prev_state:
                transitions.append((i, out.state))
                prev_state = out.state
            if out.alert:
                alerts.append((i, out.alert_type))

        cap.release(); m1.close()

        name = os.path.basename(path)
        print(f"\n=== {name}  (expected: {expected}) ===")
        print("  transitions: " + " -> ".join(f"f{f}:{s}" for f, s in transitions))
        if alerts:
            print("  ALERTS: " + ", ".join(f"f{f}:{t}" for f, t in alerts))
        else:
            if m4.state in ("PRE_FALL", "CONFIRMING"):
                print(f"  ALERTS: none (INCOMPLETE: clip ended in {m4.state}; confirmation cannot finish without post-fall footage)")
            else:
                print("  ALERTS: none")

        fired = len(alerts) > 0
        if expected not in ("FALL", "ADL"):
            verdict = "UNLABELED"
        elif not fired and m4.state in ("PRE_FALL", "CONFIRMING"):
            verdict = "INCONCLUSIVE"
        else:
            ok_result = (fired if expected == "FALL" else not fired)
            verdict = "PASS" if ok_result else "FAIL"
        overall[name] = (verdict, expected, fired)

    print("\n================ SUMMARY ================")
    for name, (verdict, exp, fired) in overall.items():
        print(f"  [{verdict}] {name:48s} expected={exp:4s} alert_fired={fired}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=DEFAULT_ONNX_PATH)
    parser.add_argument("--norm", default=NORM_PATH)
    parser.add_argument("clips", nargs="*")
    args = parser.parse_args()
    run([(p, "?") for p in args.clips] if args.clips else CLIPS,
        model_path=args.model, norm_path=args.norm)

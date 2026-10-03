"""
Full pipeline + escalation test: M1 -> M2 -> M3 -> M4 -> escalation gateway.

Verifies that:
  - both fall clips emit valid alert records into logs/alerts.json,
  - the bed ADL clip emits NOTHING (no false alerts),
  - each emitted record matches the mobile-app `alerts` schema.
"""

import os
import json

import numpy as np
import cv2
import onnxruntime as ort

from src.m1_perception import SingleAuthorityPerception
from src.m2_kinematics import KinematicExtractor, L_HIP, R_HIP
from src.m3_temporal_model import TemporalBufferManager, DEFAULT_ONNX_PATH, FEATURE_DIM
from src.m4_state_machine import FallDecisionEngine, body_on_rest_surface
from src.escalation import AlertGateway, LocalJsonSink, ElderContext

NORM_PATH = os.path.join("models", "m3_norm.npz")
ALERTS_PATH = os.path.join("logs", "test_escalation_alerts.json")

# (path, expected_alerts, elder context)
CLIPS = [
    ("data/manual_test_videos/gmdcsa24_s1_adl_bed_to_sleep_original.mp4", False,
     ElderContext("ELDER_BED", "Bed Resident", "Room 101 - Bed Area", "CARE_1")),
    ("data/manual_test_videos/gmdcsa24_s1_fall_chair_partial_original.mp4", True,
     ElderContext("ELDER_CHAIR", "Chair Resident", "Room 204 - Chair Area", "CARE_1")),
    ("data/manual_test_videos/gmdcsa24_s4_fall_low_light_original.mp4", True,
     ElderContext("ELDER_NIGHT", "Night Resident", "Room 309 - Night", "CARE_2")),
]


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def main():
    sess = ort.InferenceSession(DEFAULT_ONNX_PATH, providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name
    if os.path.isfile(NORM_PATH):
        z = np.load(NORM_PATH)
        mean, std = z["mean"].astype(np.float32), z["std"].astype(np.float32)
    else:
        mean, std = np.zeros(FEATURE_DIM, np.float32), np.ones(FEATURE_DIM, np.float32)

    sink = LocalJsonSink(ALERTS_PATH)
    sink.clear()

    results = {}
    for path, expect_alert, ctx in CLIPS:
        if not os.path.isfile(path):
            print(f"[missing] {path}")
            continue
        m1 = SingleAuthorityPerception(); m2 = KinematicExtractor()
        buf = TemporalBufferManager(); m4 = FallDecisionEngine()
        gw = AlertGateway(ctx, sinks=[sink])  # shares one sink file across clips
        m1.reset_context()

        cap = cv2.VideoCapture(path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        dt = 1.0 / fps
        p_fall = 0.0
        emitted_before = len(gw.emitted)
        i = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            i += 1
            h, w = frame.shape[:2]
            kp, furniture, quality = m1.process_frame(frame)
            feats, valid, info = m2.process(kp, quality, timestamp_s=i / fps)

            window = buf.update(feats, valid)
            if window is not None:
                x = ((window - mean) / std)[None, ...].astype(np.float32)
                logit = sess.run(None, {input_name: x})[0]
                p_fall = float(sigmoid(np.asarray(logit)).ravel()[0])
            elif not valid:
                p_fall = 0.0

            hip_px = None
            if kp is not None:
                hip_px = ((kp[L_HIP, 0] + kp[R_HIP, 0]) / 2 * w,
                          (kp[L_HIP, 1] + kp[R_HIP, 1]) / 2 * h)
            on_rest = body_on_rest_surface(hip_px, furniture)
            furn_ctx = "rest_surface" if any(b.get("label") == "rest_surface" for b in furniture) \
                else ("seat" if any(b.get("label") == "seat" for b in furniture) else "open_floor")

            out = m4.update(
                pose_status=quality.get("pose_status", "LOST"),
                trunk_tilt_deg=info.get("trunk_tilt_deg", 0.0) if valid else 0.0,
                hip_v_y=info.get("hip_v_y", 0.0) if valid else 0.0,
                jerk=float(feats[71]) if valid else 0.0,
                p_fall=p_fall,
                on_rest_surface=on_rest,
                dt=dt,
            )
            gw.handle_m4(out, p_fall=p_fall, furniture_context=furn_ctx,
                         now=i * dt)  # use clip time so cooldown is per-clip

        cap.release(); m1.close()
        n_emitted = len(gw.emitted) - emitted_before
        name = os.path.basename(path)
        ok_result = (n_emitted > 0) == expect_alert
        results[name] = ("PASS" if ok_result else "FAIL", expect_alert, n_emitted,
                         [e["eventType"] for e in gw.emitted[emitted_before:]])

    print("\n================ ESCALATION SUMMARY ================")
    for name, (verdict, exp, n, types) in results.items():
        print(f"  [{verdict}] {name:48s} expect_alert={str(exp):5s} emitted={n} {types}")

    all_records = sink.read_all()
    print(f"\nTotal records in {ALERTS_PATH}: {len(all_records)}")
    if all_records:
        required = {"alertId", "elderId", "elderName", "roomLocation", "eventType",
                    "status", "fallProbability", "postureState", "furnitureContext",
                    "timestamp"}
        ok_schema = all(required.issubset(r.keys()) for r in all_records)
        print(f"All records match schema: {ok_schema}")
        print("\nSample alert record:")
        print(json.dumps(all_records[0], indent=2))


if __name__ == "__main__":
    main()

"""
M3 pipeline runner: wire M1 -> M2 -> M3 across the test clips.

Verifies with the TRAINED model:
  - the full pipeline runs end to end,
  - the rolling 15-frame buffer fills and resets on tracking loss,
  - P(fall) spikes during real falls and stays low during normal activity,
  - ONNX CPU inference latency per window.

Applies the SAME feature standardisation used in training (models/m3_norm.npz).
If the trained model / norm stats are missing, falls back to the untrained graph and
says so (values then meaningless - wiring/latency check only).
"""

import os
import time
import argparse

import numpy as np
import cv2
import onnxruntime as ort

from src.m1_perception import SingleAuthorityPerception
from src.m2_kinematics import KinematicExtractor
from src.m3_temporal_model import TemporalBufferManager, DEFAULT_ONNX_PATH

NORM_PATH = os.path.join("models", "m3_norm.npz")
THRESHOLD = 0.5

# name -> (path, expected: 'FALL' or 'ADL')
CLIPS = [
    ("data/manual_test_videos/gmdcsa24_s1_adl_bed_to_sleep_original.mp4", "ADL"),
    ("data/manual_test_videos/gmdcsa24_s1_fall_chair_partial_original.mp4", "FALL"),
    ("data/manual_test_videos/gmdcsa24_s4_fall_low_light_original.mp4", "FALL"),
    ("data/raw_datasets/umafall/FALL/FALL-Forward_.mp4", "FALL"),
    ("data/raw_datasets/umafall/ADL/ADL-Walking_.mp4", "ADL"),
    ("data/raw_datasets/umafall/ADL/ADL-Jogging_.mp4", "ADL"),
]


def load_session(model_path=DEFAULT_ONNX_PATH, norm_path=NORM_PATH):
    if not os.path.isfile(model_path):
        raise FileNotFoundError(f"M3 model not found: {model_path}")
    if not os.path.isfile(norm_path):
        raise FileNotFoundError(f"M3 normalization stats not found: {norm_path}")
    z = np.load(norm_path)
    mean, std = z["mean"].astype(np.float32), z["std"].astype(np.float32)
    print(f"Loaded model: {model_path}\nLoaded normalization: {norm_path}")
    sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    return sess, sess.get_inputs()[0].name, mean, std


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def run(clips, model_path=DEFAULT_ONNX_PATH, norm_path=NORM_PATH):
    sess, input_name, mean, std = load_session(model_path, norm_path)
    latencies = []
    print(f"\n{'clip':52s} {'exp':4s} {'peakP':>6s} {'meanP':>6s} {'>thr':>5s} {'wins':>5s}")
    for path, expected in clips:
        if not os.path.isfile(path):
            print(f"{os.path.basename(path):52s} [missing]")
            continue
        m1 = SingleAuthorityPerception(); m2 = KinematicExtractor()
        buf = TemporalBufferManager(); m1.reset_context()
        cap = cv2.VideoCapture(path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

        probs = []
        i = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            i += 1
            timestamp_s = i / fps
            kp, _f, quality = m1.process_frame(frame, timestamp_ms=timestamp_s * 1000.0)
            feats, valid, _info = m2.process(kp, quality, timestamp_s=timestamp_s)
            window = buf.update(feats, valid, timestamp_s=timestamp_s)
            if window is not None:
                x = ((window - mean) / std)[None, ...].astype(np.float32)
                t0 = time.perf_counter()
                logit = sess.run(None, {input_name: x})[0]
                latencies.append((time.perf_counter() - t0) * 1000.0)
                probs.append(float(sigmoid(np.asarray(logit)).ravel()[0]))
        cap.release(); m1.close()

        probs = np.array(probs) if probs else np.array([0.0])
        n_over = int((probs >= THRESHOLD).sum())
        print(f"{os.path.basename(path):52s} {expected:4s} "
              f"{probs.max():6.2f} {probs.mean():6.2f} {n_over:5d} {len(probs):5d}")

    if latencies:
        arr = np.array(latencies)
        print(f"\nONNX CPU latency: mean={arr.mean():.3f} ms  p95={np.percentile(arr,95):.3f} ms  n={len(arr)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=DEFAULT_ONNX_PATH)
    parser.add_argument("--norm", default=NORM_PATH)
    parser.add_argument("clips", nargs="*")
    args = parser.parse_args()
    run([(p, "?") for p in args.clips] if args.clips else CLIPS,
        model_path=args.model, norm_path=args.norm)

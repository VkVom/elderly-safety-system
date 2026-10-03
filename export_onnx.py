"""
Standalone ONNX exporter + parity verifier for M3.

Loads the trained PyTorch weights (models/m3_temporal_fall.pt), re-exports to
models/m3_temporal_fall.onnx with FIXED batch_size=1 (no dynamic axes — this is what
keeps the GRU stable; a dynamic batch axis silently corrupts it), then verifies
PyTorch vs ONNX agreement across up to 100 validation windows (max diff < 1e-4).

Usage:
  python export_onnx.py
"""

import os
import numpy as np
import torch

from src.m3_temporal_model import (
    TemporalFallModel, export_onnx, DEFAULT_ONNX_PATH, SEQ_LEN, FEATURE_DIM,
)

PT_PATH = os.path.join("models", "m3_temporal_fall.pt")
FEAT_DIR = os.path.join("data", "processed_features")


def main():
    if not os.path.isfile(PT_PATH):
        print(f"No trained model at {PT_PATH}. Run train_m3.py first.")
        return

    ckpt = torch.load(PT_PATH, map_location="cpu", weights_only=False)
    model = TemporalFallModel()
    model.load_state_dict(ckpt["state_dict"])
    model.eval()

    # export_onnx already runs an internal parity check and raises on mismatch.
    path = export_onnx(model)
    print(f"Exported fixed-batch ONNX -> {path}")

    # Extra, explicit parity check on real validation windows (if available).
    import onnxruntime as ort
    sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0].name

    val_path = os.path.join(FEAT_DIR, "X_val.npy")
    if os.path.isfile(val_path):
        X = np.load(val_path)[:100]
        mean = ckpt.get("feat_mean"); std = ckpt.get("feat_std")
        if mean is not None and std is not None:
            X = (X - mean) / std
        X = X.astype(np.float32)
    else:
        X = np.random.randn(100, SEQ_LEN, FEATURE_DIM).astype(np.float32)
        print("(no val set found — using random windows for the parity check)")

    max_diff = 0.0
    for i in range(len(X)):
        xb = X[i:i + 1]
        with torch.no_grad():
            pt = model(torch.from_numpy(xb)).numpy().ravel()
        on = np.asarray(sess.run(None, {inp: xb})[0]).ravel()
        max_diff = max(max_diff, float(np.abs(pt - on).max()))

    print(f"Parity over {len(X)} windows: max logit diff = {max_diff:.2e}")
    if max_diff < 1e-4:
        print("PASS — PyTorch and ONNX agree.")
    else:
        print("FAIL — mismatch exceeds 1e-4. Do NOT ship this ONNX.")


if __name__ == "__main__":
    main()

"""
Module 3: Temporal Reasoning Model (M3)
Project: Proactive Elderly Safety System for Pre-Impact Fall Anticipation
Author: M3 Owner (Prajwal / G14 Team)

Responsibilities:
- PyTorch 1D-CNN + GRU classifier consuming temporal kinematic sequences from M2.
- Produce a pre-impact fall probability for each rolling window.

Input contract:
- A sequence of SEQ_LEN (15) consecutive M2 feature vectors, each FEATURE_DIM (72)
  long, shaped (batch, 15, 72). 15 frames ~= 0.5 s at 30 FPS, enough to capture the
  standing -> tilting -> descent trajectory before impact.

Design:
- 1D-CNN over the time axis (kernel=3) catches short bursts - the velocity / jerk
  spikes that mark a fall onset.
- A 2-layer GRU integrates the trajectory across the whole window.
- A linear head produces a single logit -> sigmoid -> P(fall).

This file defines the architecture, the rolling-window buffer manager, and an ONNX
exporter. Training happens separately (train_m3.py) once the labelled dataset exists;
here we can still export an (untrained) graph to validate the end-to-end wiring and
measure inference latency.
"""

import os
from collections import deque
from typing import Optional

import numpy as np

try:
    import torch
    import torch.nn as nn
    HAS_TORCH = True
except ImportError:  # pragma: no cover
    HAS_TORCH = False

# Kept consistent with M2's output.
SEQ_LEN = 15
FEATURE_DIM = 72
DEFAULT_ONNX_PATH = os.path.join("models", "m3_temporal_fall.onnx")


if HAS_TORCH:

    class TemporalFallModel(nn.Module):
        """
        1D-CNN + GRU fall classifier.

        Forward input : (batch, SEQ_LEN, FEATURE_DIM)   e.g. (N, 15, 72)
        Forward output: (batch, 1) raw logit. Apply sigmoid for P(fall).
        """

        def __init__(self, feature_dim: int = FEATURE_DIM, seq_len: int = SEQ_LEN,
                     cnn_channels: int = 64, gru_hidden: int = 64,
                     gru_layers: int = 2, dropout: float = 0.3):
            super().__init__()
            self.feature_dim = feature_dim
            self.seq_len = seq_len

            # Conv1d expects (batch, channels, length); we treat features as channels
            # and time as length, so a kernel of 3 spans 3 consecutive frames.
            self.cnn = nn.Sequential(
                nn.Conv1d(feature_dim, cnn_channels, kernel_size=3, padding=1),
                nn.BatchNorm1d(cnn_channels),
                nn.ReLU(),
                nn.Conv1d(cnn_channels, cnn_channels, kernel_size=3, padding=1),
                nn.BatchNorm1d(cnn_channels),
                nn.ReLU(),
            )

            self.gru = nn.GRU(
                input_size=cnn_channels,
                hidden_size=gru_hidden,
                num_layers=gru_layers,
                batch_first=True,
                dropout=dropout if gru_layers > 1 else 0.0,
            )

            self.head = nn.Sequential(
                nn.Dropout(dropout),
                nn.Linear(gru_hidden, 32),
                nn.ReLU(),
                nn.Linear(32, 1),
            )

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            # x: (batch, seq_len, feature_dim)
            x = x.transpose(1, 2)          # -> (batch, feature_dim, seq_len) for Conv1d
            x = self.cnn(x)                # -> (batch, cnn_channels, seq_len)
            x = x.transpose(1, 2)          # -> (batch, seq_len, cnn_channels) for GRU
            out, _ = self.gru(x)           # out: (batch, seq_len, gru_hidden)
            last = out[:, -1, :]           # final timestep summarises the window
            return self.head(last)         # -> (batch, 1) logit

        @torch.no_grad()
        def predict_proba(self, window: np.ndarray) -> float:
            """Convenience: run one (seq_len, feature_dim) window -> P(fall) float."""
            self.eval()
            x = torch.from_numpy(np.asarray(window, dtype=np.float32)).unsqueeze(0)
            logit = self.forward(x)
            return float(torch.sigmoid(logit).item())


class TemporalBufferManager:
    """
    Maintains a rolling window of the most recent SEQ_LEN M2 feature vectors.

    Fall anticipation depends on a CONTINUOUS motion trajectory, so a tracking gap
    must not be bridged: when M1/M2 report the pose as lost (valid=False), the buffer
    is cleared and must refill before another prediction is produced. This keeps M3
    from classifying across a discontinuity - consistent with the project's honest
    perception principle.
    """

    def __init__(self, seq_len: int = SEQ_LEN, feature_dim: int = FEATURE_DIM):
        self.seq_len = seq_len
        self.feature_dim = feature_dim
        self._buf: deque = deque(maxlen=seq_len)

    def reset(self):
        self._buf.clear()

    @property
    def ready(self) -> bool:
        """True once a full window of consecutive valid frames is available."""
        return len(self._buf) == self.seq_len

    def update(self, features: np.ndarray, valid: bool) -> Optional[np.ndarray]:
        """
        Push one M2 frame. Returns the (seq_len, feature_dim) window when full,
        otherwise None. A lost/invalid frame resets the buffer.
        """
        if not valid:
            self.reset()
            return None
        self._buf.append(np.asarray(features, dtype=np.float32).reshape(self.feature_dim))
        if self.ready:
            return np.stack(self._buf, axis=0)
        return None


def export_onnx(model: "TemporalFallModel", path: str = DEFAULT_ONNX_PATH,
                seq_len: int = SEQ_LEN, feature_dim: int = FEATURE_DIM) -> str:
    """Export the model to ONNX with a dynamic batch dimension. Returns the path."""
    if not HAS_TORCH:
        raise RuntimeError("PyTorch is required to export ONNX.")
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    model.eval()
    dummy = torch.randn(1, seq_len, feature_dim, dtype=torch.float32)
    # IMPORTANT: exporting this CNN+GRU with a DYNAMIC batch axis corrupts the GRU and
    # yields a graph that ignores its input (constant ~0.5 for everything). Exporting
    # with a FIXED batch size of 1 (no dynamic axes) produces an exact match. That is
    # also our real-time use case - inference runs one 15x72 window at a time.
    # A parity check against PyTorch guards against any silent export regression.
    torch.onnx.export(
        model, dummy, path,
        input_names=["kinematic_window"],
        output_names=["fall_logit"],
        opset_version=17,
        dynamo=False,
    )

    _verify_onnx_parity(model, path, seq_len, feature_dim)
    return path


def _verify_onnx_parity(model, path, seq_len, feature_dim, tol=1e-3):
    """Assert the exported ONNX matches PyTorch on random inputs (guards GRU export)."""
    import onnxruntime as ort
    sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0].name
    model.eval()
    rng = np.random.default_rng(0)
    max_diff = 0.0
    for _ in range(5):
        x = rng.standard_normal((1, seq_len, feature_dim)).astype(np.float32)
        with torch.no_grad():
            pt = model(torch.from_numpy(x)).numpy().ravel()
        on = np.asarray(sess.run(None, {inp: x})[0]).ravel()
        max_diff = max(max_diff, float(np.abs(pt - on).max()))
    if max_diff > tol:
        raise RuntimeError(
            f"ONNX export FAILED parity check: max logit diff {max_diff:.4f} > {tol}. "
            f"The exported graph does not match PyTorch (likely a GRU export bug)."
        )
    return max_diff


def count_parameters(model: "TemporalFallModel") -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


# Self-test: build the model, run a forward pass, export ONNX, verify with onnxruntime.
if __name__ == "__main__":
    print("Executing M3 Temporal Model Self-Test...")
    if not HAS_TORCH:
        raise SystemExit("PyTorch not available.")

    model = TemporalFallModel()
    print(f"Model parameters: {count_parameters(model):,}")

    # Forward pass on a dummy window.
    dummy_window = np.random.randn(SEQ_LEN, FEATURE_DIM).astype(np.float32)
    p = model.predict_proba(dummy_window)
    print(f"Dummy window -> P(fall) = {p:.4f}  (untrained, expected ~random)")

    # Buffer behaviour.
    buf = TemporalBufferManager()
    ready_at = None
    for i in range(SEQ_LEN + 2):
        win = buf.update(np.random.randn(FEATURE_DIM).astype(np.float32), valid=True)
        if win is not None and ready_at is None:
            ready_at = i + 1
    print(f"Buffer became ready after {ready_at} valid frames (expected {SEQ_LEN}).")
    buf.update(np.zeros(FEATURE_DIM, dtype=np.float32), valid=False)
    print(f"After a LOST frame -> buffer.ready = {buf.ready} (expected False).")

    # ONNX export + runtime check.
    # IMPORTANT: export to a THROWAWAY path so the self-test never overwrites the
    # real trained model at DEFAULT_ONNX_PATH (that caused a dead-model regression).
    import tempfile, os as _os
    tmp_path = _os.path.join(tempfile.gettempdir(), "m3_selftest.onnx")
    path = export_onnx(model, path=tmp_path)
    print(f"Exported ONNX (throwaway) to {path}")
    import onnxruntime as ort
    sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    out = sess.run(None, {"kinematic_window": dummy_window[None, ...]})
    print(f"onnxruntime output shape: {np.array(out[0]).shape} (expected (1, 1))")
    try:
        _os.remove(tmp_path)
    except OSError:
        pass

    assert ready_at == SEQ_LEN and not buf.ready
    print("[M3 Phase-3 Test Passed!]")
    print("NOTE: self-test does NOT touch the trained model. To (re)train run train_m3.py.")

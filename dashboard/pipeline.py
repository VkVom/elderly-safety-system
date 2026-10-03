"""
Dashboard pipeline helper: wraps M1 -> M2 -> M3 -> M4 -> escalation for per-frame
telemetry, plus overlay + gauge builders. Kept separate from app.py so the logic is
unit-testable without launching Streamlit.
"""

import os
import sys

import numpy as np
import cv2
import onnxruntime as ort

# Allow importing the src package when run from the dashboard folder.
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from src.m1_perception import SingleAuthorityPerception
from src.m2_kinematics import KinematicExtractor, L_HIP, R_HIP
from src.m3_temporal_model import TemporalBufferManager, DEFAULT_ONNX_PATH, FEATURE_DIM
from src.m4_state_machine import FallDecisionEngine, body_on_rest_surface
from src.escalation import AlertGateway, LocalJsonSink, ElderContext, DEFAULT_ALERTS_PATH

POSE_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 7), (0, 4), (4, 5), (5, 6), (6, 8), (9, 10),
    (11, 12), (11, 13), (13, 15), (15, 17), (15, 19), (15, 21), (17, 19),
    (12, 14), (14, 16), (16, 18), (16, 20), (16, 22), (18, 20),
    (11, 23), (12, 24), (23, 24),
    (23, 25), (25, 27), (27, 29), (27, 31), (29, 31),
    (24, 26), (26, 28), (28, 30), (28, 32), (30, 32),
]
VIS_THRESHOLD = 0.5

STATE_COLORS = {
    "STAND_WALK": "#21c25a",
    "PRE_FALL": "#f2c037",
    "FALL_IMPACT": "#e53935",
    "POSE_LOST_WHILE_FALLEN": "#e53935",
    "POST_FALL_MONITOR": "#fb8c00",
    "LONG_LIE_ALERT": "#b71c1c",
}


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


class DashboardPipeline:
    """Runs one clip frame-by-frame, yielding a telemetry dict per frame."""

    def __init__(self, elder_context: ElderContext = None, alerts_path: str = DEFAULT_ALERTS_PATH):
        self.m1 = SingleAuthorityPerception()
        self.m2 = KinematicExtractor()
        self.buf = TemporalBufferManager()
        self.m4 = FallDecisionEngine()
        self.ctx = elder_context or ElderContext("ELDER_DEMO", "Demo Resident", "Demo Room", "CARE_1")
        self.gateway = AlertGateway(self.ctx, sinks=[LocalJsonSink(alerts_path)])

        self.sess = ort.InferenceSession(DEFAULT_ONNX_PATH, providers=["CPUExecutionProvider"])
        self.input_name = self.sess.get_inputs()[0].name
        norm = os.path.join(_ROOT, "models", "m3_norm.npz")
        if os.path.isfile(norm):
            z = np.load(norm)
            self.mean, self.std = z["mean"].astype(np.float32), z["std"].astype(np.float32)
        else:
            self.mean = np.zeros(FEATURE_DIM, np.float32)
            self.std = np.ones(FEATURE_DIM, np.float32)

        self._frame_idx = 0
        self.p_fall = 0.0

    def reset(self):
        self.m1.reset_context()
        self.m2.reset()
        self.buf.reset()
        self.m4.reset()
        self._frame_idx = 0
        self.p_fall = 0.0

    def process(self, frame_bgr, fps: float = 30.0) -> dict:
        self._frame_idx += 1
        h, w = frame_bgr.shape[:2]
        kp, furniture, quality = self.m1.process_frame(frame_bgr.copy())
        feats, valid, info = self.m2.process(kp, quality, timestamp_s=self._frame_idx / fps)

        window = self.buf.update(feats, valid)
        if window is not None:
            x = ((window - self.mean) / self.std)[None, ...].astype(np.float32)
            logit = self.sess.run(None, {self.input_name: x})[0]
            self.p_fall = float(_sigmoid(np.asarray(logit)).ravel()[0])
        elif not valid:
            self.p_fall = 0.0

        hip_px = None
        if kp is not None:
            hip_px = ((kp[L_HIP, 0] + kp[R_HIP, 0]) / 2 * w,
                      (kp[L_HIP, 1] + kp[R_HIP, 1]) / 2 * h)
        on_rest = body_on_rest_surface(hip_px, furniture)
        furn_ctx = ("rest_surface" if any(b.get("label") == "rest_surface" for b in furniture)
                    else "seat" if any(b.get("label") == "seat" for b in furniture)
                    else "open_floor")

        tilt = info.get("trunk_tilt_deg", 0.0) if valid else 0.0
        vy = info.get("hip_v_y", 0.0) if valid else 0.0
        jerk = float(feats[71]) if valid else 0.0

        out = self.m4.update(
            pose_status=quality.get("pose_status", "LOST"),
            trunk_tilt_deg=tilt, hip_v_y=vy, jerk=jerk,
            p_fall=self.p_fall, on_rest_surface=on_rest, dt=1.0 / fps,
        )
        record = self.gateway.handle_m4(out, p_fall=self.p_fall, furniture_context=furn_ctx,
                                        now=self._frame_idx / fps)

        annotated = self._draw(frame_bgr, kp, furniture)
        return {
            "frame": annotated,
            "pose_status": quality.get("pose_status", "LOST"),
            "tilt": tilt, "vy": vy, "jerk": jerk,
            "p_fall": self.p_fall,
            "state": out.state,
            "alert": out.alert,
            "alert_type": out.alert_type,
            "furniture_context": furn_ctx,
            "record": record,
        }

    @staticmethod
    def _draw(frame, keypoints, furniture_boxes):
        h, w, _ = frame.shape
        for box in furniture_boxes:
            x1, y1, x2, y2 = map(int, box["bbox"])
            cached = box.get("cached", False)
            color = (180, 130, 90) if cached else (255, 165, 0)
            tag = "MEM" if cached else f"{box['confidence']:.2f}"
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, f"{box['label'].upper()} ({tag})", (x1, max(y1 - 8, 18)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)
        if keypoints is not None and len(keypoints) >= 33:
            pts = [(min(max(int(k[0] * w), 0), w - 1), min(max(int(k[1] * h), 0), h - 1))
                   for k in keypoints]
            for a, b in POSE_CONNECTIONS:
                if keypoints[a][3] >= VIS_THRESHOLD and keypoints[b][3] >= VIS_THRESHOLD:
                    cv2.line(frame, pts[a], pts[b], (0, 255, 255), 2)
            for k, (px, py) in zip(keypoints, pts):
                c = (0, 255, 0) if k[3] >= VIS_THRESHOLD else (0, 0, 255)
                cv2.circle(frame, (px, py), 4, c, -1)
        return frame

    def close(self):
        self.m1.close()


def make_gauge(value, title, vmin, vmax, warn, alarm):
    """Build a plotly gauge figure for a kinematic meter."""
    import plotly.graph_objects as go
    color = "#21c25a" if value < warn else "#f2c037" if value < alarm else "#e53935"
    fig = go.Figure(go.Indicator(
        mode="gauge+number",
        value=round(float(value), 2),
        title={"text": title, "font": {"size": 14}},
        gauge={
            "axis": {"range": [vmin, vmax]},
            "bar": {"color": color},
            "steps": [
                {"range": [vmin, warn], "color": "#22331f"},
                {"range": [warn, alarm], "color": "#333322"},
                {"range": [alarm, vmax], "color": "#331f1f"},
            ],
        },
    ))
    fig.update_layout(height=200, margin=dict(l=20, r=20, t=40, b=10))
    return fig

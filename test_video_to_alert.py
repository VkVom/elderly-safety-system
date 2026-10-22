r"""Offline integration check from actual video frames to caretaker alert payloads.

The video and vision/model pipeline are real. Persistence uses LocalJsonSink and push
delivery uses an injected in-memory transport, so this never contacts Firebase or Expo.
Run with: .\venv\Scripts\python.exe test_video_to_alert.py
"""

import os

import cv2
import numpy as np
import onnxruntime as ort

from src.escalation import AlertGateway, ElderContext, ExpoPushNotifier, LocalJsonSink
from src.m1_perception import SingleAuthorityPerception
from src.m2_kinematics import KinematicExtractor, L_HIP, R_HIP
from src.m3_temporal_model import (
    DEFAULT_ONNX_PATH, FEATURE_DIM, TemporalBufferManager,
)
from src.m4_state_machine import FallDecisionEngine, body_on_rest_surface


ROOT = os.path.dirname(os.path.abspath(__file__))
SINK_PATH = os.path.join(ROOT, "logs", "_video_to_alert_test.json")
NORM_PATH = os.path.join(ROOT, "models", "m3_norm.npz")
FALL_CLIP = os.path.join(ROOT, "data", "manual_test_videos",
                         "gmdcsa24_s1_fall_chair_partial_original.mp4")
ADL_CLIP = os.path.join(ROOT, "data", "manual_test_videos",
                        "gmdcsa24_s1_adl_bed_to_sleep_original.mp4")


def _sigmoid(value):
    value = float(np.asarray(value).reshape(-1)[0])
    return 1.0 / (1.0 + np.exp(-np.clip(value, -80.0, 80.0)))


def replay_to_gateway(video_path, *, model_path=DEFAULT_ONNX_PATH,
                      norm_path=NORM_PATH):
    if not os.path.isfile(video_path):
        raise FileNotFoundError(video_path)
    os.makedirs(os.path.dirname(SINK_PATH), exist_ok=True)
    sink = LocalJsonSink(SINK_PATH)
    sink.clear()
    sent_messages = []

    def fake_transport(messages):
        sent_messages.extend(dict(message) for message in messages)
        return {"data": [{"status": "ok"} for _ in messages]}

    notifier = ExpoPushNotifier(
        token_resolver=lambda _record: ["ExponentPushToken[offline-e2e-test]"],
        transport=fake_transport,
    )
    context = ElderContext(
        elder_id="ELDER_VIDEO_E2E",
        elder_name="Video E2E Resident",
        room_location="Test Room",
        assigned_caretaker_id="CARETAKER_VIDEO_E2E",
        elder_phone="+91-9000000000",
    )
    gateway = AlertGateway(context, sinks=[sink], notifiers=[notifier])

    session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    if os.path.isfile(norm_path):
        stats = np.load(norm_path)
        mean = stats["mean"].astype(np.float32)
        std = stats["std"].astype(np.float32)
    else:
        mean = np.zeros(FEATURE_DIM, dtype=np.float32)
        std = np.ones(FEATURE_DIM, dtype=np.float32)

    m1 = SingleAuthorityPerception()
    m2 = KinematicExtractor()
    temporal = TemporalBufferManager()
    m4 = FallDecisionEngine()
    capture = cv2.VideoCapture(video_path)
    if not capture.isOpened():
        m1.close()
        raise RuntimeError(f"Could not open video: {video_path}")
    fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    alerts = []
    frame_index = 0
    p_fall = 0.0
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            frame_index += 1
            timestamp_s = frame_index / fps
            height, width = frame.shape[:2]
            keypoints, furniture, quality = m1.process_frame(
                frame, timestamp_ms=timestamp_s * 1000.0,
            )
            features, valid, info = m2.process(
                keypoints, quality, timestamp_s=timestamp_s,
            )
            window = temporal.update(
                features, valid, timestamp_s=timestamp_s,
            )
            if window is not None:
                normalized = ((window - mean) / std)[None, ...].astype(np.float32)
                p_fall = _sigmoid(session.run(None, {input_name: normalized})[0])
            elif not valid:
                p_fall = 0.0

            hip_px = None
            if keypoints is not None:
                hip_px = (
                    (keypoints[L_HIP, 0] + keypoints[R_HIP, 0]) * 0.5 * width,
                    (keypoints[L_HIP, 1] + keypoints[R_HIP, 1]) * 0.5 * height,
                )
            on_rest = body_on_rest_surface(hip_px, furniture)
            if any(box.get("label") == "rest_surface" for box in furniture):
                furniture_context = "rest_surface"
            elif any(box.get("label") == "seat" for box in furniture):
                furniture_context = "seat"
            else:
                furniture_context = "open_floor"

            output = m4.update(
                pose_status=quality.get("pose_status", "LOST"),
                trunk_tilt_deg=info.get("trunk_tilt_deg", 0.0) if valid else 0.0,
                hip_v_y=info.get("hip_v_y", 0.0) if valid else 0.0,
                jerk=info.get("jerk", 0.0) if valid else 0.0,
                p_fall=p_fall,
                on_rest_surface=on_rest,
                dt=1.0 / fps,
                kinematics_reliable=(
                    bool(info.get("motion_reliable", False)) if valid else False
                ),
            )
            gateway.handle_m4(
                output, p_fall=p_fall, furniture_context=furniture_context,
            )
            if output.alert:
                alerts.append(output.alert_type)
    finally:
        capture.release()
        m1.close()

    return {
        "records": sink.read_all(),
        "messages": sent_messages,
        "alerts": alerts,
        "final_state": m4.state,
        "frames": frame_index,
    }


def test_actual_fall_video_reaches_caretaker_emergency_payload():
    result = replay_to_gateway(FALL_CLIP)
    assert result["alerts"] == ["FALL_IMPACT"], result
    assert len(result["records"]) == 1, result["records"]
    record = result["records"][0]
    assert record["status"] == "CREATED"
    assert record["eventType"] == "FALL_IMPACT"
    assert record["elderId"] == "ELDER_VIDEO_E2E"
    assert record["assignedCaretakerId"] == "CARETAKER_VIDEO_E2E"

    messages = result["messages"]
    assert [message["data"]["tier"] for message in messages] == [1, 2]
    warning, emergency = messages
    assert warning["channelId"] == "warnings"
    assert emergency["channelId"] == "emergency-alerts-v4"
    assert emergency["data"]["alertId"] == record["alertId"]
    assert emergency["data"]["elderId"] == "ELDER_VIDEO_E2E"
    assert emergency["data"]["assignedCaretakerId"] == "CARETAKER_VIDEO_E2E"


def test_bed_adl_video_does_not_send_emergency_payload():
    result = replay_to_gateway(ADL_CLIP)
    assert result["alerts"] == [], result["alerts"]
    assert not any(
        message["data"].get("tier") == 2
        and message["channelId"] == "emergency-alerts-v4"
        for message in result["messages"]
    ), result["messages"]


if __name__ == "__main__":
    try:
        test_actual_fall_video_reaches_caretaker_emergency_payload()
        print("[ok] actual fall video -> M4 -> gateway -> caretaker payload")
        test_bed_adl_video_does_not_send_emergency_payload()
        print("[ok] bed ADL video -> no emergency payload")
        print("[video-to-alert integration: 2/2 passed; all push transport is mocked]")
    finally:
        if os.path.isfile(SINK_PATH):
            os.remove(SINK_PATH)

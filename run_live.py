"""
LIVE fall-detection runner — the real system end to end.

Processes a video source (webcam or a clip) through the full pipeline
M1 -> M2 -> M3 -> M4 and pushes any REAL detected alert to live Firestore,
so a linked caretaker's phone pops the emergency modal automatically.

This is different from:
  - test_firebase_sync.py  (writes a MOCK alert, no video)
  - test_escalation.py     (runs the pipeline but writes to local JSON only)

Usage:
  # Webcam (default camera 0):
  python run_live.py --camera --elder <ELDER_UID>

  # A video clip:
  python run_live.py --video data/manual_test_videos/gmdcsa24_s1_fall_chair_partial_original.mp4 --elder <ELDER_UID>

  # Find an elder's UID + pairing code (so you know what to pass to --elder):
  python run_live.py --list-elders

Notes:
  - --elder is REQUIRED for alerts to route to the right caretaker. If omitted, alerts
    still fire but use a placeholder elderId (won't match any caretaker's scoped query).
  - Press Ctrl+C to stop. A small OpenCV preview window shows the live state.
"""

import os
import sys
import time
import argparse

import numpy as np
import cv2
import onnxruntime as ort

from src.m1_perception import SingleAuthorityPerception
from src.m2_kinematics import KinematicExtractor, L_HIP, R_HIP
from src.m3_temporal_model import TemporalBufferManager, DEFAULT_ONNX_PATH, FEATURE_DIM
from src.m4_state_machine import FallDecisionEngine, body_on_rest_surface
from src.escalation import AlertGateway, FirestoreSink, LocalJsonSink, ElderContext

NORM_PATH = os.path.join("models", "m3_norm.npz")

# Full MediaPipe pose skeleton edges (33-landmark topology).
POSE_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 7), (0, 4), (4, 5), (5, 6), (6, 8), (9, 10),
    (11, 12), (11, 13), (13, 15), (15, 17), (15, 19), (15, 21), (17, 19),
    (12, 14), (14, 16), (16, 18), (16, 20), (16, 22), (18, 20),
    (11, 23), (12, 24), (23, 24),
    (23, 25), (25, 27), (27, 29), (27, 31), (29, 31),
    (24, 26), (26, 28), (28, 30), (28, 32), (30, 32),
]
STATE_COLOR = {
    "STAND_WALK": (80, 200, 80),
    "PRE_FALL": (0, 215, 255),
    "FALL_IMPACT": (0, 0, 255),
    "POSE_LOST_WHILE_FALLEN": (0, 0, 255),
    "POST_FALL_MONITOR": (0, 140, 255),
    "LONG_LIE_ALERT": (0, 0, 200),
}


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def _bar(frame, x, y, w, h, frac, color, label):
    cv2.rectangle(frame, (x, y), (x + w, y + h), (60, 60, 60), -1)
    fw = int(w * max(0.0, min(1.0, frac)))
    cv2.rectangle(frame, (x, y), (x + fw, y + h), color, -1)
    cv2.putText(frame, label, (x, y - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (230, 230, 230), 1)


def draw_demo_hud(frame, keypoints, furniture, quality, state, p_fall, tilt, vy, jerk,
                  fps, ctx, alerting):
    """Rich live overlay: skeleton + furniture + telemetry panel + state badge."""
    h, w = frame.shape[:2]

    # Furniture boxes
    for b in furniture:
        x1, y1, x2, y2 = map(int, b["bbox"])
        cached = b.get("cached", False)
        col = (180, 130, 90) if cached else (255, 165, 0)
        cv2.rectangle(frame, (x1, y1), (x2, y2), col, 2)
        tag = "MEM" if cached else f"{b.get('confidence', 0):.2f}"
        cv2.putText(frame, f"{b.get('label', '').upper()} ({tag})", (x1, max(y1 - 8, 16)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, col, 2)

    # Skeleton
    if keypoints is not None and len(keypoints) >= 33:
        pts = [(min(max(int(k[0] * w), 0), w - 1), min(max(int(k[1] * h), 0), h - 1)) for k in keypoints]
        for a, b in POSE_CONNECTIONS:
            if keypoints[a][3] >= 0.5 and keypoints[b][3] >= 0.5:
                cv2.line(frame, pts[a], pts[b], (0, 255, 255), 2)
        for k, (px, py) in zip(keypoints, pts):
            cv2.circle(frame, (px, py), 4, (0, 255, 0) if k[3] >= 0.5 else (0, 0, 255), -1)

    # Telemetry panel (top-left, semi-transparent)
    panel_w, panel_h = 300, 150
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (panel_w, panel_h), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)

    sc = STATE_COLOR.get(state, (200, 200, 200))
    cv2.putText(frame, f"{ctx.elder_name} - {ctx.room_location}", (10, 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (210, 210, 210), 1)
    cv2.putText(frame, state, (10, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.8, sc, 2)
    _bar(frame, 10, 66, 280, 12, p_fall, (0, 0, 255) if p_fall > 0.7 else (0, 215, 255) if p_fall > 0.4 else (80, 200, 80), f"P(fall) {p_fall:.2f}")
    _bar(frame, 10, 96, 280, 12, min(tilt / 90.0, 1), (0, 0, 255) if tilt > 60 else (0, 215, 255) if tilt > 35 else (80, 200, 80), f"Tilt {tilt:.0f} deg")
    _bar(frame, 10, 126, 135, 12, min(abs(vy) / 6.0, 1), (0, 0, 255) if abs(vy) > 2 else (80, 200, 80), f"Vy {vy:.2f}")
    cv2.putText(frame, f"FPS {fps:.0f}", (200, 138), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (210, 210, 210), 1)

    # Big ALERT banner when an alert just fired
    if alerting:
        cv2.rectangle(frame, (0, h - 60), (w, h), (0, 0, 200), -1)
        cv2.putText(frame, "ALERT SENT -> CARETAKER NOTIFIED", (20, h - 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    return frame


def list_elders():
    sink = FirestoreSink()
    if not sink.available:
        print("Firestore unavailable:", getattr(sink, "_init_error", "unknown"))
        return
    docs = sink._db.collection("users").where("role", "==", "elder").stream()
    found = False
    print(f"{'UID':<30} {'NAME':<20} {'ROOM':<18} CODE   CARETAKER")
    for d in docs:
        found = True
        u = d.to_dict()
        print(f"{d.id:<30} {str(u.get('name')):<20} {str(u.get('roomLocation')):<18} "
              f"{str(u.get('pairingCode')):<7} {u.get('caretakerName') or '—'}")
    if not found:
        print("No elder users found. Sign up an elder in the app first.")


def resolve_elder_context(elder_uid):
    """Fill name/room/caretaker from the elder's Firestore profile when possible."""
    ctx = ElderContext(elder_id=elder_uid or "ELDER_UNKNOWN", elder_name="Resident",
                       room_location="Unknown", assigned_caretaker_id=None)
    if not elder_uid:
        return ctx, None
    sink = FirestoreSink()
    if sink.available:
        try:
            snap = sink._db.collection("users").document(elder_uid).get()
            if snap.exists:
                u = snap.to_dict()
                ctx = ElderContext(
                    elder_id=elder_uid,
                    elder_name=u.get("name") or "Resident",
                    room_location=u.get("roomLocation") or "Unknown",
                    assigned_caretaker_id=u.get("caretakerId"),
                )
        except Exception:
            pass
    return ctx, (sink if sink.available else None)


def run(source, elder_uid, is_camera, no_firestore):
    ctx, fsink = resolve_elder_context(elder_uid)

    sinks = [LocalJsonSink()]
    if fsink is not None and not no_firestore:
        sinks.insert(0, fsink)
        print(f"[live] Firestore ENABLED. Alerts route to elder={ctx.elder_id} "
              f"({ctx.elder_name}), caretaker={ctx.assigned_caretaker_id}")
    else:
        print("[live] Firestore disabled or unavailable — writing to logs/alerts.json only.")

    m1 = SingleAuthorityPerception(); m2 = KinematicExtractor()
    buf = TemporalBufferManager(); m4 = FallDecisionEngine()
    gw = AlertGateway(ctx, sinks=sinks, cooldown_s=10.0)
    m1.reset_context()

    cap = cv2.VideoCapture(0 if is_camera else source)
    if not cap.isOpened():
        print(f"[live] ERROR: cannot open {'camera' if is_camera else source}")
        return
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    p_fall = 0.0

    sess = ort.InferenceSession(DEFAULT_ONNX_PATH, providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name
    if os.path.isfile(NORM_PATH):
        z = np.load(NORM_PATH); mean, std = z["mean"].astype(np.float32), z["std"].astype(np.float32)
    else:
        mean, std = np.zeros(FEATURE_DIM, np.float32), np.ones(FEATURE_DIM, np.float32)

    print("[live] Running. Press Q in the window (or Ctrl+C) to stop.")
    i = 0
    _last_t = time.time()
    _flash_until = 0.0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            i += 1
            h, w = frame.shape[:2]
            kp, furniture, quality = m1.process_frame(frame.copy())
            feats, valid, info = m2.process(kp, quality, timestamp_s=i / fps)

            window = buf.update(feats, valid)
            if window is not None:
                x = ((window - mean) / std)[None, ...].astype(np.float32)
                p_fall = float(_sigmoid(np.asarray(sess.run(None, {input_name: x})[0])).ravel()[0])
            elif not valid:
                p_fall = 0.0

            hip_px = None
            if kp is not None:
                hip_px = ((kp[L_HIP, 0] + kp[R_HIP, 0]) / 2 * w, (kp[L_HIP, 1] + kp[R_HIP, 1]) / 2 * h)
            on_rest = body_on_rest_surface(hip_px, furniture)
            furn_ctx = ("rest_surface" if any(b.get("label") == "rest_surface" for b in furniture)
                        else "seat" if any(b.get("label") == "seat" for b in furniture) else "open_floor")

            out = m4.update(
                pose_status=quality.get("pose_status", "LOST"),
                trunk_tilt_deg=info.get("trunk_tilt_deg", 0.0) if valid else 0.0,
                hip_v_y=info.get("hip_v_y", 0.0) if valid else 0.0,
                jerk=float(feats[71]) if valid else 0.0,
                p_fall=p_fall, on_rest_surface=on_rest, dt=1.0 / fps,
            )
            rec = gw.handle_m4(out, p_fall=p_fall, furniture_context=furn_ctx)
            if rec:
                _flash_until = time.time() + 3.0  # keep the ALERT banner up briefly
                print(f"\n*** ALERT SENT: {rec['eventType']}  P(fall)={rec['fallProbability']}  "
                      f"-> elder {rec['elderId']}  (alertId {rec['alertId']}) ***\n")

            # Rich demo HUD.
            now = time.time()
            fps_live = 1.0 / max(now - _last_t, 1e-6); _last_t = now
            tilt = info.get("trunk_tilt_deg", 0.0) if valid else 0.0
            vy = info.get("hip_v_y", 0.0) if valid else 0.0
            jerk = float(feats[71]) if valid else 0.0
            alerting = now < _flash_until
            draw_demo_hud(frame, kp, furniture, quality, out.state, p_fall, tilt, vy, jerk,
                          fps_live, ctx, alerting)
            cv2.imshow("INSIGHT-Fall LIVE (press Q to stop)", frame)
            if (cv2.waitKey(1) & 0xFF) in (ord("q"), ord("Q"), 27):
                break
    except KeyboardInterrupt:
        pass
    finally:
        cap.release(); cv2.destroyAllWindows(); m1.close()
    print(f"[live] Stopped. {len(gw.emitted)} alert(s) sent this session.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", action="store_true", help="use laptop webcam (device 0)")
    ap.add_argument("--video", help="path to a video clip")
    ap.add_argument("--url", help="MJPEG/RTSP stream URL, e.g. a phone IP Webcam: http://192.168.1.5:8080/video")
    ap.add_argument("--elder", help="elder UID so alerts route to their caretaker")
    ap.add_argument("--list-elders", action="store_true", help="list elder users + codes and exit")
    ap.add_argument("--no-firestore", action="store_true", help="local JSON only (no cloud)")
    args = ap.parse_args()

    if args.list_elders:
        list_elders()
    elif args.camera:
        run(None, args.elder, True, args.no_firestore)
    elif args.url:
        run(args.url, args.elder, False, args.no_firestore)   # phone IP-camera stream
    elif args.video:
        run(args.video, args.elder, False, args.no_firestore)
    else:
        print("Specify --camera, --url <stream>, --video <path>, or --list-elders. See --help.")

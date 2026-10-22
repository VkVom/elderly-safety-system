"""
LIVE fall-detection runner — the real system end to end.

Processes a video source (webcam or a clip) through the full pipeline
M1 -> M2 -> M3 -> M4 and pushes any REAL detected alert to live Firestore,
so a linked caretaker's phone pops the emergency modal automatically.

This is different from:
  - test_firebase_sync.py  (writes a MOCK alert, no video)
  - test_escalation.py     (runs the pipeline but writes to local JSON only)

Usage:
  # Interactive wizard (recommended): pick source, then pick the elder:
  python run_live.py

  # Webcam + dynamic elder picker:
  python run_live.py --camera

  # Pick the elder by UID, pairing code, or name substring:
  python run_live.py --camera --elder SAFE-3BS2
  python run_live.py --camera --elder "Rahul"

  # A video clip or a phone IP-camera stream (IP Webcam app):
  python run_live.py --video data/manual_test_videos/....mp4 --elder <UID-OR-CODE>
  python run_live.py --url "http://192.168.1.5:8080/video" --elder <UID-OR-CODE>

  # List elders + linked caretakers + push-token status:
  python run_live.py --list-elders

Notes:
  - The elder is the anchor: choosing an elder resolves their linked caretaker and
    routes every alert to that caretaker's phone automatically.
  - --caretaker <UID> force-routes alerts without changing the stored pairing.
  - --demo shortens the long-lie timer to 10s for presentations.
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
from src.m4_state_machine import FallDecisionEngine, M4Config, body_on_rest_surface
from src.frame_timing import frame_interval, normalize_fps, reconnect_delay_s
from src.stream_recovery import reopen_capture, reset_temporal_state
from src.escalation import (
    AlertGateway,
    FirestoreExpoPushNotifier,
    FirestoreSink,
    LocalJsonSink,
)
from src.elder_picker import (
    PickerError, load_elders, print_elders_table, resolve_live_elder, routing_banner,
)

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
                  fps, ctx, banner=None):
    """Rich live overlay: skeleton + furniture + telemetry panel + state badge.

    `banner` is (text, bgr_color) for the tier flash (amber check / red alert /
    green auto-cancel) or None when nothing recent fired.
    """
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

    # Tier flash banner (warning amber / emergency red / recovered green)
    if banner is not None:
        text, color = banner
        cv2.rectangle(frame, (0, h - 60), (w, h), color, -1)
        cv2.putText(frame, text, (20, h - 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    return frame


def list_elders():
    from src.escalation import get_firestore_db
    try:
        print_elders_table(load_elders(get_firestore_db()))
    except Exception as e:
        print("Firestore unavailable:", e)


def run(source, elder_selection, is_camera, no_firestore, caretaker_override=None, demo=False):
    try:
        ctx, choice, _db = resolve_live_elder(
            elder_selection, caretaker_override, local_only=no_firestore,
        )
    except PickerError as e:
        print(f"[live] {e}")
        return
    if no_firestore:
        # Offline test mode never looks up a resident or a push token in Firebase.
        if caretaker_override:
            print("[live] --caretaker is ignored in --no-firestore local-only mode.")
        print("[live] Local-only camera test: no Firebase lookup or caretaker routing.")
        print(f"[live] Local label: {ctx.elder_id}\n")
    else:
        print()
        print(routing_banner(choice))
        print()

    sinks = [LocalJsonSink()]
    # Never let the gateway's default mock push/SMS channels masquerade as real
    # delivery in the live camera process. Real push is added only when configured.
    notifiers = []
    if not no_firestore:
        fsink = FirestoreSink()
        if fsink.available:
            sinks.insert(0, fsink)
            push = FirestoreExpoPushNotifier()
            if push.available:
                notifiers.append(push)
            else:
                print(f"[live] Expo push unavailable: {getattr(push, '_init_error', 'unknown')}")
            print(f"[live] Firestore ENABLED. Alerts route to elder={ctx.elder_id} "
                  f"({ctx.elder_name}), caretaker={ctx.assigned_caretaker_id}")
        else:
            print(f"[live] Firestore unavailable: {getattr(fsink, '_init_error', 'unknown')}")
    if no_firestore:
        print("[live] Firestore disabled — writing to logs/alerts.json only.")

    m4_cfg = M4Config(long_lie_s=10.0) if demo else M4Config()
    if demo:
        print("[live] DEMO mode: long-lie timer shortened to 10s.")
    m1 = SingleAuthorityPerception(); m2 = KinematicExtractor()
    buf = TemporalBufferManager(); m4 = FallDecisionEngine(m4_cfg)
    gw = AlertGateway(ctx, sinks=sinks, notifiers=notifiers, cooldown_s=10.0)
    m1.reset_context()

    capture_source = 0 if is_camera else source
    is_stream_source = is_camera or (
        isinstance(source, str)
        and source.lower().startswith(("rtsp://", "http://", "https://"))
    )
    cap = cv2.VideoCapture(capture_source)
    if not cap.isOpened():
        print(f"[live] ERROR: cannot open {'camera' if is_camera else source}")
        return
    fps = normalize_fps(cap.get(cv2.CAP_PROP_FPS))
    p_fall = 0.0

    sess = ort.InferenceSession(DEFAULT_ONNX_PATH, providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name
    if os.path.isfile(NORM_PATH):
        z = np.load(NORM_PATH); mean, std = z["mean"].astype(np.float32), z["std"].astype(np.float32)
    else:
        mean, std = np.zeros(FEATURE_DIM, np.float32), np.ones(FEATURE_DIM, np.float32)

    print("[live] Running. Press Q in the window (or Ctrl+C) to stop.")
    i = 0
    capture_origin_s = time.monotonic()
    previous_capture_s = None
    frame_gap_count = 0
    reconnect_attempt = 0
    _last_t = time.time()
    _flash_until = 0.0
    _banner = None
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                if not is_stream_source:
                    break
                reconnect_attempt += 1
                delay_s = reconnect_delay_s(reconnect_attempt)
                source_label = "webcam" if is_camera else "network camera"
                print(f"[live] {source_label} feed lost; retry {reconnect_attempt} "
                      f"in {delay_s:.0f}s. Camera health is not being sent to the caretaker.")
                failed_cap = cap
                cap, _delay_s = reopen_capture(
                    capture_source, reconnect_attempt, cap, cv2.VideoCapture,
                )
                if cap is None:
                    print(f"[live] Reconnect attempt {reconnect_attempt} failed; retrying.")
                    cap = failed_cap
                    continue
                fps = normalize_fps(cap.get(cv2.CAP_PROP_FPS), fallback=fps)
                print(f"[live] {source_label} feed reopened; clearing motion history on next frame.")
                continue
            reconnect_attempt = 0
            if is_stream_source:
                capture_time_s = time.monotonic()
                timestamp_s = capture_time_s - capture_origin_s
                dt_s, frame_gap = frame_interval(timestamp_s, previous_capture_s, fps)
            else:
                # File playback is evaluated on the clip timeline, not the speed
                # at which this computer happens to decode the file.
                timestamp_s = i / fps
                dt_s, frame_gap = 1.0 / fps, False
            previous_capture_s = timestamp_s
            decision_dt_s = 0.0 if frame_gap else dt_s
            i += 1
            h, w = frame.shape[:2]
            if frame_gap:
                frame_gap_count += 1
                print(f"[live] Frame gap ({dt_s:.2f}s): pausing confirmation time and "
                      "resetting motion history for this discontinuity.")
                p_fall = reset_temporal_state(m1, m2, buf)

            kp, furniture, quality = m1.process_frame(
                frame.copy(), timestamp_ms=timestamp_s * 1000.0)
            feats, valid, info = m2.process(kp, quality, timestamp_s=timestamp_s)

            window = buf.update(feats, valid, timestamp_s=timestamp_s)
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
                jerk=info.get("jerk", 0.0) if valid else 0.0,
                p_fall=p_fall, on_rest_surface=on_rest, dt=decision_dt_s,
                kinematics_reliable=bool(info.get("motion_reliable", False)) if valid else False,
            )
            rec = gw.handle_m4(out, p_fall=p_fall, furniture_context=furn_ctx)
            if rec:
                tier = rec.get("tier", 2)
                if tier >= 2:
                    _banner = ("EMERGENCY EVENT RECORDED", (0, 0, 200))
                    _flash_until = time.time() + 3.0
                    print(f"\n*** EMERGENCY EVENT: {rec['eventType']}  "
                          f"P(fall)={rec['fallProbability']} -> elder {rec['elderId']} "
                          f"(alertId {rec['alertId']}); phone delivery is not confirmed here. ***\n")
                elif tier == 1:
                    _banner = (f"CHECKING ON {ctx.elder_name.upper()}...", (0, 165, 255))
                    _flash_until = time.time() + 3.0
                    print(f"\n--- TIER-1 CHECK: {rec['elderName']} lost balance "
                          f"(episode {rec['alertId']}) ---\n")
                else:
                    _banner = ("RECOVERED - AUTO-CANCELLED", (80, 180, 80))
                    _flash_until = time.time() + 2.0
                    print(f"\n--- RECOVERED: episode {rec['alertId']} auto-cancelled, "
                          f"no emergency escalated ---\n")

            # Rich demo HUD.
            now = time.time()
            fps_live = 1.0 / max(now - _last_t, 1e-6); _last_t = now
            tilt = info.get("trunk_tilt_deg", 0.0) if valid else 0.0
            vy = info.get("hip_v_y", 0.0) if valid else 0.0
            jerk = float(feats[71]) if valid else 0.0
            alerting_banner = _banner if now < _flash_until else None
            draw_demo_hud(frame, kp, furniture, quality, out.state, p_fall, tilt, vy, jerk,
                          fps_live, ctx, alerting_banner)
            cv2.imshow("INSIGHT-Fall LIVE (press Q to stop)", frame)
            if (cv2.waitKey(1) & 0xFF) in (ord("q"), ord("Q"), 27):
                break
    except KeyboardInterrupt:
        pass
    finally:
        cap.release(); cv2.destroyAllWindows(); m1.close()
    n_emergency = sum(1 for e in gw.emitted if e.get("tier", 2) >= 2)
    print(f"[live] Stopped. {n_emergency} emergency alert(s), "
          f"{len(gw.emitted)} lifecycle event(s), {frame_gap_count} frame gap(s) this session.")


def wizard(no_firestore: bool, demo: bool):
    """Interactive demo flow: pick the video source, then pick the elder."""
    print("\nSelect input source:")
    print("  [1] Webcam (laptop)")
    print("  [2] Phone IP camera (IP Webcam app URL)")
    print("  [3] Video file")
    print("  [4] Direct alert injection (no camera — tests the phone end-to-end)")
    while True:
        raw = input("Pick source # (or q to quit): ").strip().lower()
        if raw in ("q", "quit", "exit", ""):
            return
        if raw == "1":
            run(None, None, True, no_firestore, demo=demo)
            return
        if raw == "2":
            url = input("Stream URL [http://192.168.1.5:8080/video]: ").strip() or \
                "http://192.168.1.5:8080/video"
            run(url, None, False, no_firestore, demo=demo)
            return
        if raw == "3":
            path = input("Video path: ").strip().strip('"')
            if not os.path.isfile(path):
                print(f"  file not found: {path}")
                continue
            run(path, None, False, no_firestore, demo=demo)
            return
        if raw == "4":
            from test_firebase_sync import inject
            inject()
            return
        print("  enter 1-4")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", action="store_true", help="use laptop webcam (device 0)")
    ap.add_argument("--video", help="path to a video clip")
    ap.add_argument("--url", help="MJPEG/RTSP stream URL, e.g. a phone IP Webcam: http://192.168.1.5:8080/video")
    ap.add_argument("--elder", help="production resident UID/code/name; local label with --no-firestore")
    ap.add_argument("--caretaker", help="force-route alerts to this caretaker UID (debug override)")
    ap.add_argument("--demo", action="store_true", help="demo timers (long-lie 10s)")
    ap.add_argument("--list-elders", action="store_true", help="list elder users + codes and exit")
    ap.add_argument("--no-firestore", action="store_true", help="local-only test; no Firebase lookup, writes, or push")
    args = ap.parse_args()

    if args.list_elders:
        list_elders()
    elif args.camera:
        run(None, args.elder, True, args.no_firestore, args.caretaker, args.demo)
    elif args.url:
        run(args.url, args.elder, False, args.no_firestore, args.caretaker, args.demo)   # phone IP-camera stream
    elif args.video:
        run(args.video, args.elder, False, args.no_firestore, args.caretaker, args.demo)
    elif sys.stdin.isatty():
        wizard(args.no_firestore, args.demo)
    else:
        print("Specify --camera, --url <stream>, --video <path>, or --list-elders. See --help.")

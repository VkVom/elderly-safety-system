"""
M2 Kinematic Visual Inspection Tool
Project: Proactive Elderly Safety System for Pre-Impact Fall Anticipation

Live OpenCV window overlaying, in real time, the full M1 -> M2 pipeline:
  - 33 MediaPipe skeletal keypoints + bone connections (M1)
  - YOLO furniture boxes, fresh vs remembered/cached (M1)
  - Kinematic Telemetry HUD (M2): pose status, trunk tilt, vertical velocity, jerk

Plays through EVERY clip in data/manual_test_videos/ so you can compare a real fall
(True Positive) against a normal bed lie-down (False-Positive rejection) and a
low-light fall, one after another.

Controls (focus the video window):
  Q / ESC : quit the whole tool
  N       : skip to the next video
  SPACE   : pause / resume
  S       : save the current annotated frame to output/

Usage:
  python test_m2_visual.py                    # all clips in data/manual_test_videos/
  python test_m2_visual.py clipA.mp4 clipB    # only the clips you pass
"""

import os
import sys
import glob
import time

import cv2
import numpy as np

from src.m1_perception import SingleAuthorityPerception
from src.m2_kinematics import KinematicExtractor, FEATURE_DIM

# Full MediaPipe Pose connection set (33-landmark topology).
POSE_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 7), (0, 4), (4, 5), (5, 6), (6, 8), (9, 10),
    (11, 12), (11, 13), (13, 15), (15, 17), (15, 19), (15, 21), (17, 19),
    (12, 14), (14, 16), (16, 18), (16, 20), (16, 22), (18, 20),
    (11, 23), (12, 24), (23, 24),
    (23, 25), (25, 27), (27, 29), (27, 31), (29, 31),
    (24, 26), (26, 28), (28, 30), (28, 32), (30, 32),
]
VIS_THRESHOLD = 0.5

# Kinematic warning thresholds.
# NOTE: velocity is in torso-normalised units/second (not m/s). These thresholds are
# derived from measured behaviour on the test clips: during the chair fall the hip
# vertical velocity spiked well above ~2.0 while normal bed activity stayed low.
TILT_WARN_DEG = 25.0
TILT_ALARM_DEG = 45.0
VY_ALARM = 2.0


def draw_overlay(frame, keypoints, furniture_boxes, quality, kin_info, valid, jerk, fps, title):
    h, w, _ = frame.shape

    # 1. Furniture: fresh = solid orange, remembered (cached) = muted blue-gray "MEM".
    for box in furniture_boxes:
        x1, y1, x2, y2 = map(int, box["bbox"])
        cached = box.get("cached", False)
        color = (180, 130, 90) if cached else (255, 165, 0)
        tag = "MEM" if cached else f"{box['confidence']:.2f}"
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        cv2.putText(frame, f"{box['label'].upper()} ({tag})", (x1, max(y1 - 8, 18)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)

    # 2. Skeleton.
    if keypoints is not None and len(keypoints) >= 33:
        pts_px = []
        for kp in keypoints:
            px = min(max(int(kp[0] * w), 0), w - 1)
            py = min(max(int(kp[1] * h), 0), h - 1)
            pts_px.append((px, py))
        for a, b in POSE_CONNECTIONS:
            if keypoints[a][3] >= VIS_THRESHOLD and keypoints[b][3] >= VIS_THRESHOLD:
                cv2.line(frame, pts_px[a], pts_px[b], (0, 255, 255), 2)
        for kp, (px, py) in zip(keypoints, pts_px):
            color = (0, 255, 0) if kp[3] >= VIS_THRESHOLD else (0, 0, 255)
            cv2.circle(frame, (px, py), 4, color, -1)

    # 3. Kinematic Telemetry HUD.
    panel_w = min(400, w)
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (panel_w, 150), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)

    status = quality.get("pose_status", "TRACKING" if keypoints is not None else "LOST")
    status_colors = {"TRACKING": (0, 255, 0), "HELD": (0, 215, 255), "LOST": (0, 0, 255)}
    status_color = status_colors.get(status, (0, 255, 0))

    tilt = kin_info.get("trunk_tilt_deg", 0.0) if valid else 0.0
    vy = kin_info.get("hip_v_y", 0.0) if valid else 0.0

    tilt_color = (0, 0, 255) if tilt > TILT_ALARM_DEG else (0, 215, 255) if tilt > TILT_WARN_DEG else (0, 255, 0)
    vy_color = (0, 0, 255) if abs(vy) > VY_ALARM else (0, 255, 0)

    cv2.putText(frame, title, (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    cv2.putText(frame, f"M1+M2 Pipeline  Status: {status}", (10, 42),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, status_color, 2)
    cv2.putText(frame, f"Trunk Tilt   : {tilt:5.1f} deg", (10, 66),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, tilt_color, 2)
    cv2.putText(frame, f"Vert Vel  vy : {vy:6.2f} u/s", (10, 88),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, vy_color, 2)
    cv2.putText(frame, f"Jerk         : {jerk:7.1f}", (10, 110),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
    cv2.putText(frame, f"Proc FPS: {fps:.1f}  |  Furniture: {len(furniture_boxes)}", (10, 132),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)

    return frame


def _play_one(m1, m2, window, video_path, index, total, saved_counter):
    name = os.path.basename(video_path)
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[skip] unable to open {video_path}")
        return "next"

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_delay = 1.0 / src_fps
    m1.reset_context()  # clear furniture memory + pose history so clips don't leak
    m2.reset()          # fresh kinematic history per clip
    frame_idx = 0
    print(f"[{index}/{total}] Playing: {name}  ({src_fps:.1f} FPS source)")

    paused = False
    annotated = None

    while True:
        if not paused:
            ret, frame = cap.read()
            if not ret:
                break
            frame_idx += 1

            loop_start = time.time()
            keypoints, furniture_boxes, quality = m1.process_frame(frame.copy())
            feats, valid, kin_info = m2.process(keypoints, quality, timestamp_s=frame_idx / src_fps)
            jerk = float(feats[71]) if valid else 0.0
            proc_fps = 1.0 / max(time.time() - loop_start, 1e-6)

            title = f"Video {index}/{total}: {name}"
            annotated = draw_overlay(frame, keypoints, furniture_boxes, quality,
                                     kin_info, valid, jerk, proc_fps, title)
            cv2.imshow(window, annotated)

            elapsed = time.time() - loop_start
            wait_ms = max(int((frame_delay - elapsed) * 1000), 1)
        else:
            wait_ms = 30

        key = cv2.waitKey(wait_ms) & 0xFF
        if key in (ord("q"), ord("Q"), 27):
            cap.release()
            return "quit"
        elif key in (ord("n"), ord("N")):
            cap.release()
            return "next"
        elif key == ord(" "):
            paused = not paused
        elif key in (ord("s"), ord("S")) and annotated is not None:
            path = os.path.join("output", f"m2_frame_{saved_counter[0]:03d}.png")
            cv2.imwrite(path, annotated)
            print(f"Saved {path}")
            saved_counter[0] += 1

        if cv2.getWindowProperty(window, cv2.WND_PROP_VISIBLE) < 1:
            cap.release()
            return "quit"

    cap.release()
    return "next"


def run_visual_pipeline(video_paths):
    video_paths = [p for p in video_paths if os.path.isfile(p)]
    if not video_paths:
        print("No videos to play.")
        return

    os.makedirs("output", exist_ok=True)
    m1 = SingleAuthorityPerception()
    m2 = KinematicExtractor()
    window = "M1+M2 Kinematic Visualizer"
    cv2.namedWindow(window, cv2.WINDOW_NORMAL)

    total = len(video_paths)
    print(f"Loaded {total} clip(s).")
    print("Controls:  Q/ESC = quit   N = next video   SPACE = pause   S = save frame")

    saved_counter = [0]
    for i, path in enumerate(video_paths, start=1):
        if _play_one(m1, m2, window, path, i, total, saved_counter) == "quit":
            print("Quit requested.")
            break

    cv2.destroyAllWindows()
    m1.close()
    print("Inspection ended.")


def _resolve_videos():
    if len(sys.argv) > 1:
        return sys.argv[1:]
    clips = sorted(glob.glob(os.path.join("data", "manual_test_videos", "*.mp4")))
    clips += sorted(glob.glob(os.path.join("data", "manual_test_videos", "*.avi")))
    if not clips:
        print("Please place test videos in data/manual_test_videos/")
    return clips


if __name__ == "__main__":
    run_visual_pipeline(_resolve_videos())

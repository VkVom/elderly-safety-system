"""
M1 Visual Inspection Tool
Project: Proactive Elderly Safety System for Pre-Impact Fall Anticipation

Opens a live OpenCV window that overlays, in real time:
  - The 33 MediaPipe skeletal keypoints + bone connections (sole human authority)
  - YOLO furniture bounding boxes (chair / couch / bed)
  - A telemetry HUD (pose status, visible keypoints, processing FPS, furniture count)

It plays through EVERY clip in data/manual_test_videos/ one after another.

Controls (focus the video window):
  Q / ESC : quit the whole tool
  N       : skip to the next video
  SPACE   : pause / resume
  S       : save the current annotated frame to output/

Usage:
  python test_m1_visual.py                       # all clips in data/manual_test_videos/
  python test_m1_visual.py clipA.mp4 clipB.mp4   # only the clips you pass
"""

import os
import sys
import glob
import time

import cv2
import numpy as np

from src.m1_perception import SingleAuthorityPerception

# Full MediaPipe Pose connection set (33-landmark topology): face, arms, torso, legs, feet.
POSE_CONNECTIONS = [
    # Face
    (0, 1), (1, 2), (2, 3), (3, 7), (0, 4), (4, 5), (5, 6), (6, 8),
    (9, 10),
    # Arms
    (11, 12), (11, 13), (13, 15), (15, 17), (15, 19), (15, 21), (17, 19),
    (12, 14), (14, 16), (16, 18), (16, 20), (16, 22), (18, 20),
    # Torso
    (11, 23), (12, 24), (23, 24),
    # Legs + feet
    (23, 25), (25, 27), (27, 29), (27, 31), (29, 31),
    (24, 26), (26, 28), (28, 30), (28, 32), (30, 32),
]

VIS_THRESHOLD = 0.5


def draw_perception_overlay(frame, keypoints, furniture_boxes, quality, fps,
                            title="M1 Perception Engine - Live Inspection"):
    h, w, _ = frame.shape

    # 1. Furniture bounding boxes.
    #    Fresh detection = solid orange; remembered/occluded (cached) = dashed gray-blue.
    for box in furniture_boxes:
        x1, y1, x2, y2 = map(int, box["bbox"])
        cached = box.get("cached", False)
        color = (180, 130, 90) if cached else (255, 165, 0)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        tag = "MEM" if cached else f"{box['confidence']:.2f}"
        label = f"{box['label'].upper()} ({tag})"
        cv2.putText(frame, label, (x1, max(y1 - 8, 18)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

    # 2. Skeleton + keypoints
    if keypoints is not None and len(keypoints) >= 33:
        pts_px = []
        for kp in keypoints:
            px = min(max(int(kp[0] * w), 0), w - 1)
            py = min(max(int(kp[1] * h), 0), h - 1)
            pts_px.append((px, py))

        # Bones (cyan) - only when both endpoints are confidently visible
        for a, b in POSE_CONNECTIONS:
            if keypoints[a][3] >= VIS_THRESHOLD and keypoints[b][3] >= VIS_THRESHOLD:
                cv2.line(frame, pts_px[a], pts_px[b], (0, 255, 255), 2)

        # Joints (green = visible, red = low confidence)
        for kp, (px, py) in zip(keypoints, pts_px):
            color = (0, 255, 0) if kp[3] >= VIS_THRESHOLD else (0, 0, 255)
            cv2.circle(frame, (px, py), 4, color, -1)

    # 3. Telemetry HUD (semi-transparent panel, scales with width)
    panel_w = min(380, w)
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (panel_w, 92), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)

    # Pose status: TRACKING (green) / HELD (yellow, buffered through a drop) / LOST (red)
    status = quality.get("pose_status", "TRACKING" if keypoints is not None else "LOST")
    status_colors = {"TRACKING": (0, 255, 0), "HELD": (0, 215, 255), "LOST": (0, 0, 255)}
    status_color = status_colors.get(status, (0, 255, 0))
    status_str = f"POSE: {status}"
    if status == "HELD":
        status_str += f"  (buffer {int(quality.get('missing_frames', 0))})"

    cv2.putText(frame, title, (10, 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    cv2.putText(frame, status_str, (10, 44),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, status_color, 2)
    cv2.putText(frame, f"Visible Keypoints: {quality['visible_keypoints']}/33", (10, 64),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
    cv2.putText(frame, f"Proc FPS: {fps:.1f}  |  Furniture: {len(furniture_boxes)}", (10, 84),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)

    return frame


def _play_one(engine, window, video_path, index, total, saved_counter):
    """Play a single clip. Returns 'quit' if the user asked to exit the whole tool,
    otherwise 'next' when the clip ends or is skipped."""
    name = os.path.basename(video_path)
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[skip] unable to open {video_path}")
        return "next"

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_delay = 1.0 / src_fps
    engine.reset_context()  # clear furniture memory so clips don't leak into each other
    print(f"[{index}/{total}] Playing: {name}  ({src_fps:.1f} FPS source)")

    paused = False
    annotated = None

    while True:
        if not paused:
            ret, frame = cap.read()
            if not ret:
                break  # clip finished -> advance to next

            loop_start = time.time()
            keypoints, furniture_boxes, quality = engine.process_frame(frame.copy())
            proc_fps = 1.0 / max(time.time() - loop_start, 1e-6)

            title = f"Video {index}/{total}: {name}"
            annotated = draw_perception_overlay(
                frame, keypoints, furniture_boxes, quality, proc_fps, title)
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
            path = os.path.join("output", f"m1_frame_{saved_counter[0]:03d}.png")
            cv2.imwrite(path, annotated)
            print(f"Saved {path}")
            saved_counter[0] += 1

        if cv2.getWindowProperty(window, cv2.WND_PROP_VISIBLE) < 1:
            cap.release()
            return "quit"

    cap.release()
    return "next"


def run_visual_inspection(video_paths):
    """Play through every clip in `video_paths`, one after another."""
    video_paths = [p for p in video_paths if os.path.isfile(p)]
    if not video_paths:
        print("No videos to play.")
        return

    os.makedirs("output", exist_ok=True)
    engine = SingleAuthorityPerception()
    window = "M1 Perception Engine - Live Inspection"
    cv2.namedWindow(window, cv2.WINDOW_NORMAL)

    total = len(video_paths)
    print(f"Loaded {total} clip(s).")
    print("Controls:  Q/ESC = quit   N = next video   SPACE = pause   S = save frame")

    saved_counter = [0]  # mutable so the count persists across clips
    for i, path in enumerate(video_paths, start=1):
        result = _play_one(engine, window, path, i, total, saved_counter)
        if result == "quit":
            print("Quit requested.")
            break

    cv2.destroyAllWindows()
    engine.close()
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
    run_visual_inspection(_resolve_videos())

import cv2
import time
import sys
import glob
import os
from src.m1_perception import SingleAuthorityPerception


def run_m1_test(video_path: str):
    print("=" * 65)
    print(f"  TESTING M1 PERCEPTION ENGINE ON: {video_path}")
    print("=" * 65)

    engine = SingleAuthorityPerception()
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        print(f"Error: Could not open {video_path}")
        return

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"Total Frames: {total_frames} | Input FPS: {cap.get(cv2.CAP_PROP_FPS):.1f}")
    print("-" * 65)

    valid_pose_count = 0
    furniture_event_count = 0
    start_time = time.time()
    frame_idx = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        frame_idx += 1

        # Process single frame
        keypoints, furniture_boxes, quality = engine.process_frame(frame)

        if keypoints is not None and quality['visible_keypoints'] > 5:
            valid_pose_count += 1
        if len(furniture_boxes) > 0:
            furniture_event_count += 1

        if frame_idx % 15 == 0 or frame_idx == total_frames:
            print(f"Frame {frame_idx:03d}/{total_frames} | "
                  f"Pose Detected: {'YES' if keypoints is not None else 'NO '} | "
                  f"Visible Keypoints: {quality['visible_keypoints']:02d}/33 | "
                  f"Furniture Objects: {len(furniture_boxes)}")

    cap.release()
    elapsed = time.time() - start_time
    fps = frame_idx / elapsed if elapsed > 0 else 0

    print("-" * 65)
    print("  M1 TEST SUMMARY")
    print("-" * 65)
    print(f"• Total Processed Frames  : {frame_idx}")
    if frame_idx > 0:
        print(f"• Valid Human Poses       : {valid_pose_count}/{frame_idx} ({valid_pose_count/frame_idx*100:.1f}%)")
    else:
        print(f"• Valid Human Poses       : 0/0 (no frames read)")
    print(f"• Furniture Detected      : {furniture_event_count} frame events")
    print(f"• Processing Speed        : {fps:.1f} FPS (Time: {elapsed:.3f}s)")
    print("=" * 65)


def _resolve_video() -> str:
    # 1. Explicit path from command line
    if len(sys.argv) > 1:
        return sys.argv[1]

    # 2. Guide default, if present
    default = os.path.join("data", "manual_test_videos", "test_walk.mp4")
    if os.path.isfile(default):
        return default

    # 3. Fall back to the first available clip in the test folder
    clips = sorted(glob.glob(os.path.join("data", "manual_test_videos", "*.mp4")))
    clips += sorted(glob.glob(os.path.join("data", "manual_test_videos", "*.avi")))
    if clips:
        return clips[0]

    return default


if __name__ == "__main__":
    run_m1_test(_resolve_video())

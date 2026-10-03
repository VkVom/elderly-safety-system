"""
M2 integration test: run M1 -> M2 on a real clip and print the kinematic signal.
Verifies trunk tilt rises and vertical velocity spikes during a fall descent.
"""
import sys
import cv2
from src.m1_perception import SingleAuthorityPerception
from src.m2_kinematics import KinematicExtractor


def run(video_path: str):
    perception = SingleAuthorityPerception()
    kin = KinematicExtractor()
    cap = cv2.VideoCapture(video_path)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    print(f"M1 -> M2 on {video_path}")
    print(f"{'frame':>5} {'status':>8} {'tilt_deg':>9} {'hip_v_y':>9} {'jerk':>8} {'valid':>6}")
    i = 0
    max_vy = 0.0
    max_tilt = 0.0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        i += 1
        kp, furniture, quality = perception.process_frame(frame)
        t = i / src_fps
        feats, valid, info = kin.process(kp, quality, timestamp_s=t)

        if valid:
            max_vy = max(max_vy, abs(info["hip_v_y"]))
            max_tilt = max(max_tilt, info["trunk_tilt_deg"])
        if i % 15 == 0:
            status = quality.get("pose_status", "?")
            tilt = info.get("trunk_tilt_deg", 0.0) if valid else 0.0
            vy = info.get("hip_v_y", 0.0) if valid else 0.0
            jerk = round(float(feats[71]), 2)
            print(f"{i:>5} {status:>8} {tilt:>9} {vy:>9} {jerk:>8} {str(valid):>6}")

    cap.release()
    perception.close()
    print(f"\nPeak |hip_v_y| = {max_vy:.2f}   Peak trunk tilt = {max_tilt:.1f} deg")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else \
        "data/manual_test_videos/gmdcsa24_s1_fall_chair_partial_original.mp4"
    run(path)

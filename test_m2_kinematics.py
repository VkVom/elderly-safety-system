"""Safety checks for M2 motion features and kinematic outlier handling."""

import numpy as np

from src.m2_kinematics import FEATURE_DIM, KinematicExtractor


def make_pose(offset_y=0.0):
    points = np.zeros((33, 4), dtype=np.float32)
    points[11] = [0.45, 0.30 + offset_y, 0, 1.0]
    points[12] = [0.55, 0.30 + offset_y, 0, 1.0]
    points[23] = [0.46, 0.55 + offset_y, 0, 1.0]
    points[24] = [0.54, 0.55 + offset_y, 0, 1.0]
    for idx in (25, 26, 27, 28):
        points[idx] = [0.5, 0.75 + offset_y, 0, 1.0]
    return points


def test_plausible_fast_descent_preserves_motion_features():
    extractor = KinematicExtractor()
    extractor.process(make_pose(), timestamp_s=0.0)
    features, valid, info = extractor.process(make_pose(0.05), timestamp_s=1 / 30)

    assert valid
    assert info["motion_reliable"] is True
    assert features.shape == (FEATURE_DIM,)
    assert info["hip_v_y"] > 2.0
    assert features[67] > 2.0


def test_pose_jitter_zeros_motion_channels_and_reports_raw_outlier():
    extractor = KinematicExtractor()
    extractor.process(make_pose(), timestamp_s=0.0)
    features, valid, info = extractor.process(make_pose(0.30), timestamp_s=1 / 30)

    assert valid
    assert info["motion_reliable"] is False
    assert info["velocity_ready"] is False
    assert info["jerk_ready"] is False
    assert abs(info["raw_hip_v_y"]) > 12.0
    assert np.all(features[67:72] == 0.0)
    assert info["hip_v_y"] == 0.0
    assert info["jerk"] == 0.0


def test_outlier_rebase_recovers_without_permanent_velocity_spike():
    extractor = KinematicExtractor()
    extractor.process(make_pose(), timestamp_s=0.0)
    extractor.process(make_pose(0.30), timestamp_s=1 / 30)
    features, valid, info = extractor.process(make_pose(0.30), timestamp_s=2 / 30)

    assert valid
    assert info["motion_reliable"] is True
    assert abs(info["hip_v_y"]) < 1e-6
    assert np.all(np.isfinite(features))


if __name__ == "__main__":
    for check in (
        test_plausible_fast_descent_preserves_motion_features,
        test_pose_jitter_zeros_motion_channels_and_reports_raw_outlier,
        test_outlier_rebase_recovers_without_permanent_velocity_spike,
    ):
        check()
        print(f"[ok] {check.__name__}")
    print("[M2 kinematics tests: 3/3 passed]")

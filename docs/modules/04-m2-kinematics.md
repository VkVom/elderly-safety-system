# M2: Movement and Kinematics Module

## Purpose

M2 is in `src/m2_kinematics.py`. It receives body landmarks from M1 and turns them into numbers that describe movement. These numbers are called features and are read by M3 and M4.

## Why This Module Exists

A single picture cannot reliably separate a fall from bending or sitting. M2 compares body position over time. It looks for rapid downward movement, a large change in body angle, and sudden motion changes.

## Main Measurements

- **Trunk tilt:** how far the upper body is leaning away from upright.
- **Hip vertical velocity:** how quickly the body centre moves up or down.
- **Jerk:** how suddenly acceleration changes; an impact can produce a sharp jerk.
- **Relative joint positions and velocities:** movement of shoulders, hips, knees, ankles, and other landmarks.

The module produces a 72-number feature vector for each usable frame.

## Scale Normalisation

People can stand near or far from the camera. M2 uses body size, especially torso-related distances, to normalise its measurements. This makes the movement features more stable across camera distance and different people.

## Input and Output

Input:

- M1 keypoints
- M1 quality flags
- frame timestamp

Output:

- a 72-value feature array
- `valid`: whether pose geometry can be used
- `info`: tilt, sanitized motion, raw motion for diagnosis, and `motion_reliable`

M2 rejects finite-difference spikes when torso-normalized hip speed exceeds 12 units/s,
jerk exceeds 20,000, or M1 marks the pose as held. It keeps pose and tilt, zeros the
five motion features for that frame, and rebases its history at the current pose.
The same sanitizer is applied when rebuilding candidate training windows so live
inference and training use matching feature rules. The bounds are engineering
outlier limits, not physical speed measurements, and should be recalibrated with
more labeled camera footage.

If the pose is lost or insufficient, M2 marks the output invalid. Downstream modules then avoid treating missing data as normal movement.

## Reset Rule

Call `reset()` between separate videos or sessions. This clears old landmark history so the first frame of one video is never compared with the last frame of another.

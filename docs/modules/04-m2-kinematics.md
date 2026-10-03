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
- `valid`: whether the frame contains reliable movement information
- `info`: readable values such as trunk tilt and vertical hip velocity

If the pose is lost or insufficient, M2 marks the output invalid. Downstream modules then avoid treating missing data as normal movement.

## Reset Rule

Call `reset()` between separate videos or sessions. This clears old landmark history so the first frame of one video is never compared with the last frame of another.

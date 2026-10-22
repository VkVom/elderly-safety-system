# 01 Repository and environment

Evidence collected 2026-10-22. Credentials redacted. Status: IMPLEMENTED source exists; PARTIAL code exists but validation/operation is incomplete; NOT BUILT absent in inspected source.

Remote: origin https://github.com/VkVom/elderly-safety-system.git. Branches feat/withyu-auth-redesign, main, origin/main. Working tree was already dirty. Python 3.12.10; Node v23.10.0; npm 11.11.0; Windows 11 Home 64-bit build 10.0.26200; Intel i5-13450HX, 10 cores/16 logical; total RAM 16,454,352 KB, free 1,887,544 KB at query; NVIDIA RTX 3050 Laptop GPU, 6144 MiB, nvidia-smi driver 610.60. Commands: python --version, node --version, npm --version, Get-CimInstance OS/Processor, nvidia-smi.

Python runtime is not pinned. requirements.txt contains lower bounds. Venv freeze is python_freeze.txt. Mobile declarations in mobile_app/package.json, transitive locks package-lock.json. Expo ~51, React Native .74.5, React 18.2; Functions Node 20, firebase-functions ^5.1.1, firebase-admin ^12.7. Android min SDK 23, target/compile 34, Kotlin 1.9.23, NDK 27.1.12297006, Gradle 8.8.

## Actual behavior (10 lines)
1. IMPLEMENTED Python OpenCV webcam/video/network capture.
2. IMPLEMENTED M1 MediaPipe pose and YOLO furniture.
3. IMPLEMENTED M2 72-dimensional features.
4. IMPLEMENTED M3 temporal window and ONNX inference.
5. IMPLEMENTED M4 state and confirmation logic.
6. PARTIAL local JSON and optional Firestore/Expo alerting.
7. PARTIAL Streamlit replay of fixed local clips.
8. IMPLEMENTED separate elder/caretaker/volunteer mobile app.
9. PARTIAL Android call path; delivery depends on device/config.
10. NOT BUILT mobile vision, GPS, real SMS, cloud video, MCU integration.

## Component status
| Area | Status | Main paths |
|---|---|---|
| M1/M2/M3/M4 | IMPLEMENTED | src/m1_perception.py, m2_kinematics.py, m3_temporal_model.py, m4_state_machine.py |
| Dashboard | PARTIAL | dashboard/app.py, dashboard/pipeline.py |
| Alert backend | PARTIAL | src/escalation.py |
| Firebase | PARTIAL | firestore.rules, functions/index.js |
| Elder/caretaker/volunteer apps | IMPLEMENTED source | mobile_app/src/screens |
| Push | PARTIAL | src/escalation.py, mobile_app/src/services/notifications.js |
| SMS/GPS/mobile camera/MCU | NOT BUILT | no sender/location/camera/firmware path |

## Structure
Major folders: analysis/, dashboard/, data/manual_test_videos/, data/processed_features/, data/raw_datasets/, docs/modules/, functions/, logs/, mobile_app/src/screens/, mobile_app/src/services/, mobile_app/modules/insight-call/, models/, output/, src/. Root has run_live.py, model training/eval/extraction scripts and test_*.py. Per-file inventory with line counts is file_inventory.tsv; excludes venv, node_modules, .git.

Full commit log (73 entries): git_history.txt. Python exact installed versions: python_freeze.txt. Python declared minimums: OpenCV 4.8, MediaPipe 1.0, Ultralytics 8, NumPy 1.26, SciPy 1.11, Torch 2.2, ONNX/ORT 1.16, Streamlit 1.32, Plotly 5.18, pandas 2, Pillow 10, requests 2.31, firebase-admin 6.5.

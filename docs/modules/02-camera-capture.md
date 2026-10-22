# Camera and Video Capture Module

## Purpose

`run_live.py` is the program that starts a live detection session. It accepts three sources: the laptop webcam, a saved video, or a network camera stream from another phone/device.

## Inputs It Accepts

| Source | Command | Use case |
| --- | --- | --- |
| Laptop webcam | `python run_live.py --camera --elder YOUR_ELDER_UID` | Quick local demonstration. |
| Saved video | `python run_live.py --video "path/to/video.mp4" --elder YOUR_ELDER_UID` | Repeatable, safe test. |
| Phone/network stream | `python run_live.py --url "http://PHONE_IP:PORT/video" --elder YOUR_ELDER_UID` | Remote camera placed in a room. |

In production mode, `--elder` selects the monitored resident in Firebase and resolves that resident's linked caretaker. Use `python run_live.py --list-elders` to list available residents. This lookup requires Firebase credentials.

## What the Runner Does

1. Opens the selected source with OpenCV.
2. Loads the M1, M2, M3, and M4 modules once.
3. Loads the ONNX fall model and normalisation values from `models/`.
4. Reads one frame at a time.
5. Sends the frame through every module.
6. Shows a preview window with skeleton, furniture boxes, system state, fall score, and alert banner.
7. Keeps video frames in the local processing path; alert records contain event and resident metadata, not video frames. Alert records are also written to the local log. Firestore and push are used only in production mode when configured.

## Phone as a Remote Camera

The phone camera is separate from the INSIGHT mobile app. Install an IP-camera streaming app on the camera phone, connect both devices to the same Wi-Fi, start its video server, and use its MJPEG/RTSP address with `--url`.

Example:

```powershell
python run_live.py --url "http://192.168.1.5:8080/video" --elder YOUR_ELDER_UID
```

Open the address in the computer browser first. If video is not visible in the browser, the Python runner cannot read it either.

## Current Deployment Boundary

The camera runner is an edge process: this computer receives the stream and runs M1–M4. A CCTV/NVR RTSP stream must be reachable from this computer on the local network. One runner process monitors one selected source and one resident at a time. Camera assignment is currently command-line setup, not an in-app camera administration screen, and the runner must remain running for monitoring to continue. Do not expose a room-camera stream to a public server for this local-processing design.

## Safe Local Mode

Add `--no-firestore` to run the camera pipeline without Firebase reads, Firestore writes, or push notifications:

```powershell
python run_live.py --camera --elder local-camera-test --no-firestore
```

Alert lifecycle records go to local files under `logs/` with the local test resident label. The supplied `--elder` value is treated only as a local label; no caretaker is selected or notified.

## Stop and Troubleshoot

- Press `Q`, `Esc`, or `Ctrl+C` to stop.
- If the camera cannot open, close other programs using it and check the correct camera index. The current command uses webcam device `0`.
- If the stream cannot open, check Wi-Fi, the phone IP address, port, and stream path.
- After a live camera feed has opened, failed reads trigger automatic reopen attempts with 1, 2, 4, 8... second delays capped at 30 seconds. Motion history is reset when frames resume. The console reports outages; camera health is not yet sent to the caretaker, so a deployment must separately monitor the camera host.
- If the model cannot load, check for `models/m3_temporal_fall.onnx` and `models/m3_norm.npz`.
- If alerts do not reach the app, check the elder ID, Firebase service-account file, and the caretaker link.

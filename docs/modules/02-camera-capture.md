# Camera and Video Capture Module

## Purpose

`run_live.py` is the program that starts a live detection session. It accepts three sources: the laptop webcam, a saved video, or a network camera stream from another phone/device.

## Inputs It Accepts

| Source | Command | Use case |
| --- | --- | --- |
| Laptop webcam | `python run_live.py --camera --elder YOUR_ELDER_UID` | Quick local demonstration. |
| Saved video | `python run_live.py --video "path/to/video.mp4" --elder YOUR_ELDER_UID` | Repeatable, safe test. |
| Phone/network stream | `python run_live.py --url "http://PHONE_IP:PORT/video" --elder YOUR_ELDER_UID` | Remote camera placed in a room. |

`--elder` is important. It is the Firebase user ID for the monitored older adult. It tells the system which caretaker should receive the alert. Use `python run_live.py --list-elders` to list available elder IDs.

## What the Runner Does

1. Opens the selected source with OpenCV.
2. Loads the M1, M2, M3, and M4 modules once.
3. Loads the ONNX fall model and normalisation values from `models/`.
4. Reads one frame at a time.
5. Sends the frame through every module.
6. Shows a preview window with skeleton, furniture boxes, system state, fall score, and alert banner.
7. Sends alerts to Firestore when credentials are available, and always keeps a local alert log.

## Phone as a Remote Camera

The phone camera is separate from the INSIGHT mobile app. Install an IP-camera streaming app on the camera phone, connect both devices to the same Wi-Fi, start its video server, and use its MJPEG/RTSP address with `--url`.

Example:

```powershell
python run_live.py --url "http://192.168.1.5:8080/video" --elder YOUR_ELDER_UID
```

Open the address in the computer browser first. If video is not visible in the browser, the Python runner cannot read it either.

## Safe Local Mode

Add `--no-firestore` to test the camera pipeline without contacting Firebase:

```powershell
python run_live.py --camera --elder YOUR_ELDER_UID --no-firestore
```

Alerts go to local files under `logs/` in this mode.

## Stop and Troubleshoot

- Press `Q`, `Esc`, or `Ctrl+C` to stop.
- If the camera cannot open, close other programs using it and check the correct camera index. The current command uses webcam device `0`.
- If the stream cannot open, check Wi-Fi, the phone IP address, port, and stream path.
- If the model cannot load, check for `models/m3_temporal_fall.onnx` and `models/m3_norm.npz`.
- If alerts do not reach the app, check the elder ID, Firebase service-account file, and the caretaker link.

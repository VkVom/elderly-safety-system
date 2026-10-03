# Elderly Safety System

An end-to-end prototype for proactive fall-risk monitoring. The system analyses a live camera feed or saved video, estimates fall risk from body movement over time, confirms suspected falls with safety rules, and delivers alerts to a role-based mobile application.

> This is a prototype for research and demonstration. It is not a medical device, emergency service, or replacement for human supervision.

## What It Does

- Reads video from a laptop webcam, saved video file, or remote phone/IP-camera stream.
- Detects a person's pose and nearby beds, couches, and chairs.
- Measures body tilt, downward movement, and sudden motion changes.
- Uses a temporal machine-learning model to estimate fall probability.
- Confirms a possible fall only when the person appears to remain down.
- Avoids common false alarms, including ordinary bending and lying on a detected bed/couch.
- Sends confirmed alerts to Firebase for linked caretaker and volunteer workflows.
- Provides a Streamlit dashboard for visual demonstrations and an Expo mobile app for alert response.

## Architecture

```text
Camera / saved video / remote phone stream
                  |
                  v
      Python live runner: run_live.py
                  |
                  v
  M1: pose landmarks + furniture context
                  |
                  v
  M2: movement, tilt, speed, and jerk features
                  |
                  v
       M3: temporal fall-probability model
                  |
                  v
        M4: rule-based fall confirmation
                  |
                  v
      Firebase Firestore alert record
                  |
          +-------+--------+
          v                v
   Caretaker app     Volunteer app after escalation
```

## Repository Structure

| Path | Description |
| --- | --- |
| `src/` | Core fall-detection modules: perception, movement analysis, temporal model, decision logic, and alert gateway. |
| `run_live.py` | Starts the full live system using a webcam, video file, or network camera stream. |
| `dashboard/` | Streamlit visual dashboard for local demonstrations. |
| `mobile_app/` | Expo / React Native app for older adults, caretakers, and volunteers. |
| `data/` | Local training datasets and test videos. Large data files are intentionally ignored by Git. |
| `models/` | Downloaded and trained AI models. Intentionally ignored by Git. |
| `docs/` | Detailed module-by-module technical documentation. |
| `PROJECT_GUIDE.md` | Step-by-step guide for running, testing, and installing the app. |

## Documentation

Start with these documents:

- [Project run guide](PROJECT_GUIDE.md): dashboard, cameras, remote phone camera, APK installation, account setup, and testing.
- [Technical documentation index](docs/README.md): separate explanations for every major module.
- [System overview](docs/modules/01-system-overview.md): complete data flow and component responsibilities.
- [Cloud and alert delivery](docs/modules/07-cloud-and-alerts.md): Firebase, account linking, alert records, and escalation.
- [Mobile application](docs/modules/09-mobile-app.md): roles, screens, Firebase connection, and Android build process.

## Prerequisites

- Python and `pip`
- Node.js and `npm`
- A webcam, saved test video, or network video stream for live detection
- Firebase project for live mobile/cloud alerts
- Android phone for APK testing, if testing the mobile app

## Quick Start

### 1. Set up the Python environment

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Run the visual dashboard

```powershell
python -m streamlit run dashboard/app.py
```

Open the local address shown in the terminal, normally `http://localhost:8501`.

The dashboard requires local test clips and the trained M3 model. See [the run guide](PROJECT_GUIDE.md#run-the-dashboard) for details.

### 3. Run with a laptop webcam

Create and link an older-adult account to a caretaker account first. Then list available older-adult IDs:

```powershell
python run_live.py --list-elders
```

Start the live system:

```powershell
python run_live.py --camera --elder YOUR_ELDER_UID
```

Press `Q`, `Esc`, or `Ctrl+C` to stop.

### 4. Run with a remote phone camera

Start an MJPEG or RTSP stream from a phone IP-camera app on the same Wi-Fi network. Then run:

```powershell
python run_live.py --url "http://PHONE_IP:PORT/video" --elder YOUR_ELDER_UID
```

The camera phone only streams video. The computer runs the AI pipeline and creates alerts.

### 5. Run the mobile app for development

```powershell
cd mobile_app
npm ci
npx expo start
```

For an installable Android preview APK:

```powershell
npx eas build -p android --profile preview
```

Read [the mobile-app guide](docs/modules/09-mobile-app.md) before changing Expo owner, EAS project, Android package, or iOS bundle IDs.

## Mobile Roles

| Role | Main responsibility |
| --- | --- |
| Older Adult | Can send an SOS alert and shares a pairing code with their caretaker. |
| Caretaker | Links to one older adult and receives that person's active alerts. |
| Volunteer | Can be on duty and receive alerts that were escalated beyond the caretaker. |

The pairing process is simple: the older adult creates an account and receives a `SAFE-XXXX` code; the caretaker creates a separate account and enters that code to link the two profiles.

## Local Files Required for Live Detection

The following generated or private files are not stored in GitHub and must be available locally when needed:

| File or folder | Why it is needed |
| --- | --- |
| `models/m3_temporal_fall.onnx` | Deployed temporal fall-detection model. |
| `models/m3_norm.npz` | Normalisation values used by the M3 model. |
| `models/pose_landmarker_lite.task` | MediaPipe pose model; downloaded automatically when possible. |
| `yolov8n.pt` | YOLO furniture-context model. |
| `data/manual_test_videos/` | Test clips used by the dashboard and video tests. |
| `firebase-service-account.json` | Private Firebase administrator credential for Python-to-Firestore alerts. |

## Testing

Use safe recorded clips for fall tests. Do not ask people to fall for a demonstration.

Useful checks include:

```powershell
python test_escalation.py
python test_m4_runner.py
python test_firebase_sync.py
```

`test_firebase_sync.py` requires `firebase-admin` and a local `firebase-service-account.json`. It creates a mock cloud alert; it does not require a real fall.

For a practical end-to-end test, follow [Test the Full Camera-to-App Alert](PROJECT_GUIDE.md#test-the-full-camera-to-app-alert).

## Security and Privacy

- Never commit `firebase-service-account.json`, `.env` files, signing keys, APK keystores, or private credentials.
- Never commit `node_modules/`, virtual environments, generated logs, datasets, trained weights, or generated model files.
- The root `.gitignore` excludes these local files.
- Review and lock down Firestore security rules before using real user data.
- The current app receives live Firestore updates while it is open. Background push notifications are not yet configured.

Before committing, review staged files:

```powershell
git status --short --ignored
git diff --cached --stat
```

## Training and Model Maintenance

The training workflow is local because datasets and model outputs are large:

```powershell
python extract_dataset_features.py
python train_m3.py
python evaluate_m3.py
python export_onnx.py
```

See [data setup instructions](data/raw_datasets/DATASETS_README.md) and [data/model maintenance documentation](docs/modules/10-data-tests-maintenance.md) for details.

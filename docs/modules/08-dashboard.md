# Dashboard Module

## Purpose

The dashboard is a local Streamlit demonstration screen. It is not the caretaker mobile app. It helps developers and reviewers see what every AI stage is doing while a prepared test video plays.

## Files

- `dashboard/app.py`: Streamlit user interface.
- `dashboard/pipeline.py`: reusable pipeline wrapper for dashboard frames.

## What It Shows

- selected test video
- body skeleton and furniture boxes
- current M4 system state
- fall probability from M3
- trunk tilt, vertical velocity, and jerk from M2
- recent local alert records

## How It Works

`dashboard/app.py` opens a selected video from `data/manual_test_videos/`. For each frame it calls `DashboardPipeline.process()`.

The pipeline creates M1, M2, M3, M4, and an `AlertGateway`. Its gateway uses a local JSON sink, not Firebase. This keeps a normal dashboard demo safe and independent of cloud credentials.

## Run It

```powershell
.\.venv\Scripts\Activate.ps1
python -m streamlit run dashboard/app.py
```

Open the local browser address printed by Streamlit. Use the left panel to select a clip, playback speed, display size, and start/stop controls.

## Required Files

- test clips in `data/manual_test_videos/`
- `models/m3_temporal_fall.onnx`
- optional `models/m3_norm.npz`
- M1 pose and YOLO model files available locally

The videos and trained models are ignored by GitHub because they are large. A fresh clone needs those files restored locally before the dashboard can run.

## Alert Log

The dashboard writes its alerts to `logs/dashboard_alerts.json`. The **Clear alert log** button clears this local file only. It does not change Firebase or the mobile app.

## Common Problems

- Missing clip: restore the matching video under `data/manual_test_videos/`.
- Missing ONNX model: restore or export the M3 model under `models/`.
- Slow playback: lower display width or increase the render-every setting. The pipeline still processes every frame; only browser drawing is reduced.

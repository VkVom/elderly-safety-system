# Elderly Safety System

Proactive elderly-safety system for pre-impact fall anticipation using temporal reasoning.

## Repository layout

- `src/` and the root Python scripts: fall-detection pipeline, model training/export, and Firebase escalation.
- `dashboard/`: Streamlit visual dashboard for local demonstrations.
- `mobile_app/`: Expo / React Native application for elder, caretaker, and volunteer roles.
- `data/`: local datasets and generated features. Large local data is intentionally ignored by Git.
- `models/`, `logs/`, and `output/`: generated runtime files. They are intentionally ignored by Git.

## Quick start

### Python pipeline and dashboard

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m pytest
python -m streamlit run dashboard/app.py
```

The pipeline needs local model files and test media. See `data/raw_datasets/DATASETS_README.md` for dataset setup. Do not commit datasets, model weights, Firebase service-account files, or runtime logs.

### Mobile app

```powershell
cd mobile_app
npm ci
npx expo start
```

The app is part of this same repository. Its Expo and Firebase identifiers are in `mobile_app/app.json` and `mobile_app/src/config/firebase.js`. Replace them with identifiers owned by your team before publishing a build; do not commit service-account credentials or signing keys.

## GitHub safety check

From the repository root, run:

```powershell
git status --short --ignored
git check-ignore -v firebase-service-account.json yolov8n.pt mobile_app/node_modules
```

Only source code, lockfiles, documentation, tests, and small app assets should be staged.

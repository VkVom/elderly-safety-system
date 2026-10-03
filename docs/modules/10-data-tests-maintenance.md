# Data, Models, Tests, and Maintenance

## Data Folders

| Folder | Contents | GitHub status |
| --- | --- | --- |
| `data/raw_datasets/` | Original datasets, videos, frames, and CSV files | Ignored because files are large. |
| `data/processed_features/` | Generated arrays used to train/validate M3 | Ignored because generated and large. |
| `data/manual_test_videos/` | Local repeatable demo clips | Ignored; `.gitkeep` preserves the empty folder. |
| `models/` | Downloaded and trained AI model files | Ignored. |
| `logs/` | Runtime and local alert records | Ignored. |
| `output/` | Generated inspection frames/output | Ignored. |

The dataset guide is `data/raw_datasets/DATASETS_README.md`.

## Model Workflow

1. Prepare raw datasets locally.
2. Run `extract_dataset_features.py` to generate M2 feature arrays.
3. Run `train_m3.py` to train the temporal fall model.
4. Run `evaluate_m3.py` to evaluate it.
5. Run `export_onnx.py` to create the live ONNX model and perform a parity check.

Do not commit generated datasets, `.pt` weights, `.onnx` files, or model caches to this source repository.

## Test Files

| Test | Focus |
| --- | --- |
| `test_m1_video_runner.py` / `test_m1_visual.py` | Pose and furniture perception on video. |
| `test_m2_pipeline.py` / `test_m2_visual.py` | Kinematic feature extraction. |
| `test_m3_runner.py` | Temporal model behaviour. |
| `test_m4_runner.py` | End-to-end state logic on test clips. |
| `test_escalation.py` | Alert record creation and de-duplication. |
| `test_firebase_sync.py` | Real Firestore connectivity with a mock alert. |

Some scripts are executable checks rather than a standard `pytest` test suite. Read each file's top usage comments before running it.

## Safe Git Rules

Commit source code, documentation, tests, package lockfiles, configuration templates, and small app image assets.

Never commit:

- `firebase-service-account.json`
- `.env` files and signing keys
- `node_modules/` and virtual environments
- datasets, test recordings, generated feature arrays
- trained model weights and runtime logs

The root `.gitignore` already enforces these rules. Check before a push:

```powershell
git status --short --ignored
git diff --cached --stat
```

## Regular Maintenance Checklist

1. Run tests after changing any module.
2. Test the safe saved-video path before using a live camera.
3. Test the elder/caretaker link before testing an alert.
4. Confirm the caretaker app is open before a live alert test.
5. Use `test_firebase_sync.py` to verify cloud connectivity without a real fall.
6. Review Firebase security rules before any real-user deployment.

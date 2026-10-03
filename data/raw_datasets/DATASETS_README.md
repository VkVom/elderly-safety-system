# Raw video datasets for M3 training

Place RGB fall-detection video datasets here. The extractor (`extract_dataset_features.py`)
runs each clip through M1 (pose) + M2 (kinematics) into labelled 15-frame windows.

## Expected layout

```
data/raw_datasets/
├── urfd/
│   ├── fall/     <- fall videos (.mp4/.avi)         -> windows labelled 1 where a fall occurs
│   └── adl/      <- normal activity videos          -> all windows labelled 0
├── le2i/
│   ├── fall/
│   └── adl/
└── mcfd/
    ├── fall/
    └── adl/
```

### The simplest convention (recommended)
Just sort each clip into a `fall/` or `adl/` subfolder:

- **adl/** clips → every window is labelled **0** (normal).
- **fall/** clips → windows are labelled **1 only where the fall actually happens**
  (strong kinematic signature: high trunk tilt + downward velocity), **0** elsewhere.
  This avoids labelling the stand/walk/setup parts of a fall clip as "fall".

That's it — no annotation files needed. The kinematic auto-labelling is the same honest
approach used for the original UMAFall clips.

### Optional: precise frame labels
If a dataset ships per-frame fall windows (e.g. URFD CSVs, Le2i annotation .txt with
start/end frames), you can place a sidecar label file NEXT TO a video with the SAME base
name and extension `.labels.txt`, containing one line: `fall_start_frame,fall_end_frame`
(1-indexed, inclusive). Windows overlapping that range are labelled 1; others 0.
Example: `fall-01.mp4` + `fall-01.labels.txt` containing `120,165`.

If no `.labels.txt` is present for a fall clip, the kinematic auto-labelling is used.

## Where to get the datasets (you download these — research pages, may need a form)
- **URFD** (UR Fall Detection): http://fenix.ur.edu.pl/~mkepski/ds/uf.html  — RGB + depth, 70 clips.
- **Le2i** Fall Detection Dataset: search "Le2i fall detection dataset" (multi-room RGB).
- **MCFD** (Multiple Cameras Fall Dataset): http://www.iro.umontreal.ca/~labimage/Dataset/

## After adding files
```
python extract_dataset_features.py          # builds data/processed_features/*
python train_m3.py                           # retrains + full metrics
python export_onnx.py                        # fixed-batch ONNX + parity (train_m3 also exports)
python test_escalation.py                    # end-to-end check
```

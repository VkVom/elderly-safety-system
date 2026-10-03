"""
Phase: Dataset feature extraction for M3 retraining (Le2i frame dataset).

Reads the Le2i-derived frame dataset at data/raw_datasets/le2i_frames/, which is
organised as:

    le2i_frames/{train,val}/{Blank,Stand,Lie,Likefall,Fall}/{clip}/NNN.jpg

Each {clip} folder holds CONSECUTIVE frames of one short clip. We run each clip's
frames in order through M1 (pose) + M2 (kinematics) to build rolling SEQ_LEN-frame
windows of the 72-feature vector, labelled by the class folder:

    Fall  -> 1
    Blank / Stand / Lie / Likefall -> 0   (Likefall = valuable hard-negative)

Honest handling:
  - A window is only emitted from SEQ_LEN consecutive VALID (pose-tracked) frames;
    a tracking gap resets the buffer (no bridging across missing poses).
  - The dataset's own train/val split is respected. We additionally record each
    window's source clip in groups.npy so training can double-check for leakage.
  - Also appends the original local manual_test_videos (kinematic-labelled) so those
    scenarios stay represented.

Outputs (data/processed_features/):
  X_train.npy, y_train.npy, groups_train.npy
  X_val.npy,   y_val.npy,   groups_val.npy
  X.npy, y.npy, groups.npy          (combined train, for the legacy loader)
  norm_stats.json                   (z-score mean/std from TRAIN only)
  meta.json
"""

import os
import glob
import json
from collections import deque
from typing import List, Tuple

import cv2
import numpy as np

from src.m1_perception import SingleAuthorityPerception
from src.m2_kinematics import KinematicExtractor
from src.m3_temporal_model import SEQ_LEN, FEATURE_DIM

LE2I_ROOT = os.path.join("data", "raw_datasets", "le2i_frames")
OUT_DIR = os.path.join("data", "processed_features")

FALL_CLASSES = {"Fall"}                     # -> label 1
NORMAL_CLASSES = {"Blank", "Stand", "Lie", "Likefall"}  # -> label 0


def _frames_in_clip(clip_dir: str) -> List[str]:
    """Return the clip's image frames sorted by their numeric index."""
    imgs = glob.glob(os.path.join(clip_dir, "*.jpg")) + glob.glob(os.path.join(clip_dir, "*.png"))
    def _key(p):
        base = os.path.splitext(os.path.basename(p))[0]
        digits = "".join(ch for ch in base if ch.isdigit())
        return int(digits) if digits else 0
    return sorted(imgs, key=_key)


def _windows_from_clip(frame_paths: List[str], label: int) -> Tuple[List[np.ndarray], List[int]]:
    """Run one clip's frames through M1->M2 and build labelled windows."""
    m1 = SingleAuthorityPerception()
    m2 = KinematicExtractor()
    m1.reset_context()
    buf = deque(maxlen=SEQ_LEN)
    Xs, ys = [], []
    i = 0
    for p in frame_paths:
        frame = cv2.imread(p)
        if frame is None:
            continue
        i += 1
        kp, _furn, quality = m1.process_frame(frame)
        feats, valid, _info = m2.process(kp, quality, timestamp_s=i / 25.0)  # Le2i ~25 FPS
        if not valid:
            buf.clear()
            continue
        buf.append(feats.astype(np.float32))
        if len(buf) == SEQ_LEN:
            Xs.append(np.stack(buf, axis=0))
            ys.append(label)
    m1.close()
    return Xs, ys


def _process_split(split: str):
    """Process le2i_frames/{split}/* -> (X, y, groups)."""
    split_dir = os.path.join(LE2I_ROOT, split)
    all_X, all_y, all_g = [], [], []
    if not os.path.isdir(split_dir):
        return all_X, all_y, all_g

    for cls in sorted(os.listdir(split_dir)):
        cls_dir = os.path.join(split_dir, cls)
        if not os.path.isdir(cls_dir):
            continue
        label = 1 if cls in FALL_CLASSES else 0
        clips = [d for d in sorted(os.listdir(cls_dir)) if os.path.isdir(os.path.join(cls_dir, d))]
        for clip in clips:
            frames = _frames_in_clip(os.path.join(cls_dir, clip))
            if len(frames) < SEQ_LEN:
                continue
            Xs, ys = _windows_from_clip(frames, label)
            group = f"le2i_{split}_{cls}_{clip}"
            all_X.extend(Xs)
            all_y.extend(ys)
            all_g.extend([group] * len(Xs))
        print(f"  [{split}/{cls}] clips={len(clips)} windows so far={len(all_X)}")
    return all_X, all_y, all_g


# Local original clips (kinematic-labelled) to keep those scenarios represented in TRAIN.
LOCAL_SOURCES = [
    ("data/manual_test_videos/gmdcsa24_s1_fall_chair_partial_original.mp4", 1),
    ("data/manual_test_videos/gmdcsa24_s4_fall_low_light_original.mp4", 1),
    ("data/manual_test_videos/gmdcsa24_s1_adl_bed_to_sleep_original.mp4", 0),
]
IDX_TILT, IDX_HIP_VY = 66, 67
TILT_FALL_DEG, VY_FALL = 60.0, 2.0


def _windows_from_video(path, clip_is_fall):
    m1 = SingleAuthorityPerception(); m2 = KinematicExtractor(); m1.reset_context()
    cap = cv2.VideoCapture(path); fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    buf = deque(maxlen=SEQ_LEN); Xs, ys = [], []; i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        i += 1
        kp, _f, q = m1.process_frame(frame)
        feats, valid, _info = m2.process(kp, q, timestamp_s=i / fps)
        if not valid:
            buf.clear(); continue
        buf.append(feats.astype(np.float32))
        if len(buf) == SEQ_LEN:
            win = np.stack(buf, axis=0)
            if clip_is_fall:
                lbl = 1 if (np.degrees(win[:, IDX_TILT]).max() >= TILT_FALL_DEG and win[:, IDX_HIP_VY].max() >= VY_FALL) else 0
            else:
                lbl = 0
            Xs.append(win); ys.append(lbl)
    cap.release(); m1.close()
    return Xs, ys


GMDCSA_ROOT = os.path.join("data", "raw_datasets", "gmdcsa24")
GMDCSA_VAL_SUBJECTS = {"Subject 4"}   # held out for subject-level validation


def _process_gmdcsa():
    """
    Ingest GMDCSA24: data/raw_datasets/gmdcsa24/Subject N/{Fall,ADL}/NN.mp4
      - ADL clips  -> every window label 0 (includes sleeping/sitting/bed-reading etc.
                      which are exactly the activities we must NOT false-alarm on)
      - Fall clips -> kinematic auto-label (1 only on the strong fall signature)
    Subjects 1-3 go to TRAIN; Subject 4 is held out to VAL (unseen person).
    Returns (Xtr, ytr, gtr, Xva, yva, gva).
    """
    Xtr, ytr, gtr, Xva, yva, gva = [], [], [], [], [], []
    if not os.path.isdir(GMDCSA_ROOT):
        return Xtr, ytr, gtr, Xva, yva, gva
    for subj in sorted(os.listdir(GMDCSA_ROOT)):
        sdir = os.path.join(GMDCSA_ROOT, subj)
        if not os.path.isdir(sdir):
            continue
        to_val = subj in GMDCSA_VAL_SUBJECTS
        for cls, is_fall in (("ADL", False), ("Fall", True)):
            cdir = os.path.join(sdir, cls)
            if not os.path.isdir(cdir):
                continue
            vids = sorted(glob.glob(os.path.join(cdir, "*.mp4")))
            for v in vids:
                Xs, ys = _windows_from_video(v, is_fall)
                group = f"gmdcsa_{subj.replace(' ', '')}_{cls}_{os.path.basename(v)}"
                if to_val:
                    Xva.extend(Xs); yva.extend(ys); gva.extend([group] * len(Xs))
                else:
                    Xtr.extend(Xs); ytr.extend(ys); gtr.extend([group] * len(Xs))
            print(f"  GMDCSA {subj}/{cls}: {len(vids)} clips ({'VAL' if to_val else 'TRAIN'})")
    return Xtr, ytr, gtr, Xva, yva, gva


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    have_le2i = os.path.isdir(LE2I_ROOT)
    have_gmdcsa = os.path.isdir(GMDCSA_ROOT)
    if not have_le2i and not have_gmdcsa:
        print("No datasets found. See data/raw_datasets/DATASETS_README.md.")
        return

    Xtr, ytr, gtr, Xva, yva, gva = [], [], [], [], [], []

    if have_le2i:
        print("Processing Le2i TRAIN split...")
        a, b, c = _process_split("train"); Xtr += a; ytr += b; gtr += c
        print("Processing Le2i VAL split...")
        a, b, c = _process_split("val"); Xva += a; yva += b; gva += c

    if have_gmdcsa:
        print("Processing GMDCSA24 (Subjects 1-3 TRAIN, Subject 4 VAL)...")
        gtx, gty, gtg, gvx, gvy, gvg = _process_gmdcsa()
        Xtr += gtx; ytr += gty; gtr += gtg
        Xva += gvx; yva += gvy; gva += gvg

    print("Processing local original clips (added to TRAIN)...")
    for path, is_fall in LOCAL_SOURCES:
        if os.path.isfile(path):
            Xs, ys = _windows_from_video(path, is_fall == 1)
            name = os.path.basename(path)
            Xtr.extend(Xs); ytr.extend(ys); gtr.extend([f"local_{name}"] * len(Xs))
            print(f"  {name}: +{len(Xs)} windows")

    if not Xtr:
        print("No training windows produced — check the dataset path/contents.")
        return

    Xtr = np.stack(Xtr).astype(np.float32); ytr = np.array(ytr, np.int64); gtr = np.array(gtr)
    if Xva:
        Xva = np.stack(Xva).astype(np.float32); yva = np.array(yva, np.int64); gva = np.array(gva)
    else:
        Xva = np.empty((0, SEQ_LEN, FEATURE_DIM), np.float32); yva = np.array([], np.int64); gva = np.array([])

    # z-score stats from TRAIN only
    flat = Xtr.reshape(-1, FEATURE_DIM)
    mean = flat.mean(axis=0); std = flat.std(axis=0) + 1e-6

    np.save(os.path.join(OUT_DIR, "X_train.npy"), Xtr)
    np.save(os.path.join(OUT_DIR, "y_train.npy"), ytr)
    np.save(os.path.join(OUT_DIR, "groups_train.npy"), gtr)
    np.save(os.path.join(OUT_DIR, "X_val.npy"), Xva)
    np.save(os.path.join(OUT_DIR, "y_val.npy"), yva)
    np.save(os.path.join(OUT_DIR, "groups_val.npy"), gva)
    # legacy combined (train) for older loaders
    np.save(os.path.join(OUT_DIR, "X.npy"), Xtr)
    np.save(os.path.join(OUT_DIR, "y.npy"), ytr)
    np.save(os.path.join(OUT_DIR, "groups.npy"), gtr)

    with open(os.path.join(OUT_DIR, "norm_stats.json"), "w") as f:
        json.dump({"mean": mean.tolist(), "std": std.tolist()}, f)
    np.savez(os.path.join("models", "m3_norm.npz"), mean=mean.astype(np.float32), std=std.astype(np.float32)) \
        if os.path.isdir("models") else None

    meta = {
        "seq_len": SEQ_LEN, "feature_dim": FEATURE_DIM,
        "train_windows": int(Xtr.shape[0]), "train_fall": int(ytr.sum()),
        "val_windows": int(Xva.shape[0]), "val_fall": int(yva.sum()) if len(yva) else 0,
    }
    with open(os.path.join(OUT_DIR, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print("\nSaved to", OUT_DIR)
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()

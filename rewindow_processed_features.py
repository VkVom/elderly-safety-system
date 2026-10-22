"""Rewindow cached M2 sequences to the 25 FPS M3 cadence without rerunning M1.

Old feature exports contain one overlapping 15-frame window per source frame.
This script reconstructs each uninterrupted valid sequence, resamples it onto the
inference cadence, and writes a separate candidate feature directory. It never
overwrites the source feature files or deployed model artifacts.
"""

import argparse
import glob
import json
import os
import re

import cv2
import numpy as np

from extract_dataset_features import LOCAL_SOURCES
from src.frame_timing import normalize_fps
from src.feature_rewindow import rewindow_feature_arrays


def _fps_resolver():
    cache = {}
    local_paths = {f"local_{os.path.basename(path)}": path for path, _label in LOCAL_SOURCES}

    def get_fps(group):
        if group in cache:
            return cache[group]
        if group.startswith("le2i_"):
            fps = 25.0
        elif group.startswith("gmdcsa_"):
            parts = group.split("_", 3)
            if len(parts) != 4:
                raise ValueError(f"Cannot parse GMDCSA feature group: {group}")
            subject_label, activity, filename = parts[1], parts[2], parts[3]
            match = re.fullmatch(r"Subject(\d+)", subject_label)
            if not match:
                raise ValueError(f"Cannot parse GMDCSA subject in feature group: {group}")
            video_path = os.path.join(
                "data", "raw_datasets", "gmdcsa24", f"Subject {match.group(1)}",
                activity, filename,
            )
            cap = cv2.VideoCapture(video_path)
            try:
                if not cap.isOpened():
                    raise FileNotFoundError(f"Cannot open source video for group {group}: {video_path}")
                fps = normalize_fps(cap.get(cv2.CAP_PROP_FPS))
            finally:
                cap.release()
        elif group.startswith("local_"):
            video_path = local_paths.get(group)
            if not video_path or not os.path.isfile(video_path):
                raise FileNotFoundError(f"Cannot find local source video for group {group}")
            cap = cv2.VideoCapture(video_path)
            try:
                fps = normalize_fps(cap.get(cv2.CAP_PROP_FPS))
            finally:
                cap.release()
        else:
            raise ValueError(f"Unknown feature group prefix: {group}")
        cache[group] = fps
        return fps

    return get_fps


def _transform_split(input_dir, output_dir, split, fps_resolver):
    X = np.load(os.path.join(input_dir, f"X_{split}.npy"), mmap_mode="r")
    y = np.load(os.path.join(input_dir, f"y_{split}.npy"))
    groups = np.load(os.path.join(input_dir, f"groups_{split}.npy"))
    transformed = rewindow_feature_arrays(X, y, groups, fps_resolver)
    for name, array in zip(("X", "y", "groups"), transformed):
        np.save(os.path.join(output_dir, f"{name}_{split}.npy"), array)
    print(f"{split}: {len(y)} source windows -> {len(transformed[1])} fixed-cadence windows")
    return transformed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", default="data/processed_features")
    parser.add_argument("--output-dir", default="data/processed_features/25hz_candidate")
    args = parser.parse_args()
    os.makedirs(args.output_dir, exist_ok=True)

    get_fps = _fps_resolver()
    Xtr, ytr, gtr = _transform_split(args.input_dir, args.output_dir, "train", get_fps)
    Xva, yva, gva = _transform_split(args.input_dir, args.output_dir, "val", get_fps)
    if not len(Xtr):
        raise RuntimeError("No training windows were produced.")

    mean = Xtr.reshape(-1, Xtr.shape[-1]).mean(axis=0)
    std = Xtr.reshape(-1, Xtr.shape[-1]).std(axis=0) + 1e-6
    with open(os.path.join(args.output_dir, "norm_stats.json"), "w", encoding="utf-8") as f:
        json.dump({"mean": mean.tolist(), "std": std.tolist()}, f)
    metadata = {
        "source_feature_dir": os.path.abspath(args.input_dir),
        "target_fps": 25.0,
        "sequence_length": int(Xtr.shape[1]),
        "feature_dim": int(Xtr.shape[2]),
        "train_windows": int(len(Xtr)),
        "train_fall_windows": int(ytr.sum()),
        "train_groups": int(len(np.unique(gtr))),
        "val_windows": int(len(Xva)),
        "val_fall_windows": int(yva.sum()),
        "val_groups": int(len(np.unique(gva))),
        "split_rule": "Preserve source train/val arrays and clip groups",
    }
    with open(os.path.join(args.output_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(json.dumps(metadata, indent=2))
    print(f"Candidate features saved under {os.path.abspath(args.output_dir)}")


if __name__ == "__main__":
    main()

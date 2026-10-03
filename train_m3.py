"""
M3 retraining on the Le2i-scaled feature set — production-grade training + full metrics.

Uses the dataset's own train/val split (data/processed_features/X_train.npy etc.), which
is already clip-grouped (groups_*.npy) so there is no frame leakage between splits.

Handles class imbalance with either weighted BCE (default) or Focal Loss.
Reports: Accuracy, Precision, Recall, F1, ROC-AUC, Confusion Matrix — at the default
0.5 threshold AND at the F1-optimal threshold found on the validation set.

Metrics (incl. ROC-AUC) are computed with numpy — no scikit-learn dependency.

Outputs:
  models/m3_temporal_fall.pt    trained weights + feat_mean/std + metrics + best threshold
  models/m3_temporal_fall.onnx  fixed-batch ONNX (via export_onnx, parity-checked)
  models/m3_norm.npz            normalisation stats (also written by extractor)
"""

import os
import json
import argparse

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader

from src.m3_temporal_model import TemporalFallModel, export_onnx, count_parameters

FEAT_DIR = os.path.join("data", "processed_features")
PT_PATH = os.path.join("models", "m3_temporal_fall.pt")
SEED = 42


# ----------------------------------------------------------------- metrics (numpy)
def confusion(y_true, y_pred):
    tp = int(((y_pred == 1) & (y_true == 1)).sum())
    fp = int(((y_pred == 1) & (y_true == 0)).sum())
    fn = int(((y_pred == 0) & (y_true == 1)).sum())
    tn = int(((y_pred == 0) & (y_true == 0)).sum())
    return tp, fp, fn, tn


def metrics_at(y_true, y_prob, thr):
    y_pred = (y_prob >= thr).astype(np.int64)
    tp, fp, fn, tn = confusion(y_true, y_pred)
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    acc = (tp + tn) / max(tp + tn + fp + fn, 1)
    return {"threshold": round(float(thr), 3), "precision": round(precision, 4),
            "recall": round(recall, 4), "f1": round(f1, 4), "accuracy": round(acc, 4),
            "tp": tp, "fp": fp, "fn": fn, "tn": tn}


def roc_auc(y_true, y_prob):
    """ROC-AUC via the rank-sum (Mann-Whitney U) identity. No sklearn needed."""
    pos = y_prob[y_true == 1]
    neg = y_prob[y_true == 0]
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    order = np.argsort(y_prob)
    ranks = np.empty(len(y_prob), dtype=np.float64)
    ranks[order] = np.arange(1, len(y_prob) + 1)
    # average ranks for ties
    _, inv, counts = np.unique(y_prob, return_inverse=True, return_counts=True)
    sums = np.zeros(len(counts)); np.add.at(sums, inv, ranks)
    ranks = (sums / counts)[inv]
    r_pos = ranks[y_true == 1].sum()
    auc = (r_pos - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg))
    return float(auc)


def best_f1_threshold(y_true, y_prob):
    best_t, best_f1 = 0.5, -1.0
    for t in np.linspace(0.05, 0.95, 19):
        m = metrics_at(y_true, y_prob, t)
        if m["f1"] > best_f1:
            best_f1, best_t = m["f1"], t
    return float(best_t)


# ----------------------------------------------------------------- losses
class FocalLoss(nn.Module):
    def __init__(self, alpha=0.75, gamma=2.0):
        super().__init__()
        self.alpha, self.gamma = alpha, gamma
    def forward(self, logits, targets):
        p = torch.sigmoid(logits)
        ce = nn.functional.binary_cross_entropy_with_logits(logits, targets, reduction="none")
        p_t = p * targets + (1 - p) * (1 - targets)
        alpha_t = self.alpha * targets + (1 - self.alpha) * (1 - targets)
        return (alpha_t * (1 - p_t) ** self.gamma * ce).mean()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--loss", choices=["bce", "focal"], default="bce")
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--lr", type=float, default=1e-3)
    args = ap.parse_args()

    torch.manual_seed(SEED); np.random.seed(SEED)

    Xtr = np.load(os.path.join(FEAT_DIR, "X_train.npy"))
    ytr = np.load(os.path.join(FEAT_DIR, "y_train.npy"))
    Xva = np.load(os.path.join(FEAT_DIR, "X_val.npy"))
    yva = np.load(os.path.join(FEAT_DIR, "y_val.npy"))
    if len(Xva) == 0:
        print("No validation split found. Run extract_dataset_features.py first.")
        return

    print(f"Train: {len(ytr)} windows ({int(ytr.sum())} fall)   Val: {len(yva)} windows ({int(yva.sum())} fall)")

    with open(os.path.join(FEAT_DIR, "norm_stats.json")) as f:
        ns = json.load(f)
    mean = np.array(ns["mean"], np.float32); std = np.array(ns["std"], np.float32)
    Xtr = (Xtr - mean) / std; Xva = (Xva - mean) / std

    tr = DataLoader(TensorDataset(torch.from_numpy(Xtr).float(), torch.from_numpy(ytr).float()),
                    batch_size=args.batch, shuffle=True)

    model = TemporalFallModel()
    print(f"Model parameters: {count_parameters(model):,}  |  loss={args.loss}")

    pos = max(int(ytr.sum()), 1); neg = int((ytr == 0).sum())
    if args.loss == "focal":
        criterion = FocalLoss()
    else:
        criterion = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([neg / pos], dtype=torch.float32))
        print(f"pos_weight (neg/pos) = {neg / pos:.1f}")

    opt = torch.optim.Adam(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.ReduceLROnPlateau(opt, mode="max", factor=0.5, patience=5)

    Xva_t = torch.from_numpy(Xva).float()
    best_auc, best_state = -1.0, None

    for epoch in range(1, args.epochs + 1):
        model.train(); total = 0.0
        for xb, yb in tr:
            opt.zero_grad()
            loss = criterion(model(xb).squeeze(1), yb)
            loss.backward(); opt.step()
            total += loss.item() * len(xb)
        total /= len(ytr)

        model.eval()
        with torch.no_grad():
            va_prob = torch.sigmoid(model(Xva_t).squeeze(1)).numpy()
        auc = roc_auc(yva, va_prob)
        sched.step(auc)
        if epoch % 5 == 0 or epoch == 1:
            m = metrics_at(yva, va_prob, 0.5)
            print(f"epoch {epoch:3d}  loss={total:.4f}  val AUC={auc:.3f}  "
                  f"P={m['precision']:.2f} R={m['recall']:.2f} F1={m['f1']:.2f}")
        if auc >= best_auc:
            best_auc = auc
            best_state = {k: v.clone() for k, v in model.state_dict().items()}

    if best_state is not None:
        model.load_state_dict(best_state)
    model.eval()
    with torch.no_grad():
        va_prob = torch.sigmoid(model(Xva_t).squeeze(1)).numpy()

    auc = roc_auc(yva, va_prob)
    thr_best = best_f1_threshold(yva, va_prob)
    m_half = metrics_at(yva, va_prob, 0.5)
    m_best = metrics_at(yva, va_prob, thr_best)

    print("\n================ VALIDATION REPORT ================")
    print(f"ROC-AUC: {auc:.4f}")
    print(f"\n-- at threshold 0.50 --")
    print(json.dumps(m_half, indent=2))
    print(f"\n-- at F1-optimal threshold {thr_best:.2f} --")
    print(json.dumps(m_best, indent=2))
    print(f"\nConfusion (thr {thr_best:.2f}): TP={m_best['tp']} FP={m_best['fp']} "
          f"FN={m_best['fn']} TN={m_best['tn']}")

    os.makedirs("models", exist_ok=True)
    torch.save({"state_dict": model.state_dict(),
                "feat_mean": mean, "feat_std": std,
                "roc_auc": auc, "metrics_half": m_half, "metrics_best": m_best,
                "best_threshold": thr_best}, PT_PATH)
    np.savez(os.path.join("models", "m3_norm.npz"), mean=mean, std=std)
    onnx_path = export_onnx(model)
    print(f"\nSaved weights -> {PT_PATH}")
    print(f"Exported ONNX -> {onnx_path} (parity-checked)")
    print(f"NOTE: recommended decision threshold = {thr_best:.2f} (used by runtime if wired).")


if __name__ == "__main__":
    main()

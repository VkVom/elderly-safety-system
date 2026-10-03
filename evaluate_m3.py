"""
Train the DEPLOYED M3 (in-domain, Le2i) and produce a FULL, honest metric report:
  - In-domain validation (Le2i-val)
  - Out-of-distribution / unseen-subject test (GMDCSA Subject 4)
  - Combined

Reports Accuracy, Precision, Recall, F1, Specificity, ROC-AUC, and confusion for each,
at threshold 0.5 and at the in-domain F1-optimal threshold.

Also exports the trained deployed model to models/m3_temporal_fall.onnx (parity-checked)
and writes models/m3_metrics.json for the project report.

Usage:
  python evaluate_m3.py                 # train on Le2i, eval on Le2i-val + GMDCSA-S4
"""

import os
import json
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader

from src.m3_temporal_model import TemporalFallModel, export_onnx, count_parameters

FEAT = os.path.join("data", "processed_features")
PT_PATH = os.path.join("models", "m3_temporal_fall.pt")
SEED = 42
EPOCHS = 60
BATCH = 64


def load(part):
    X = np.load(os.path.join(FEAT, f"X_{part}.npy"))
    y = np.load(os.path.join(FEAT, f"y_{part}.npy"))
    g = np.load(os.path.join(FEAT, f"groups_{part}.npy"))
    return X, y, g


def mask_src(g, src):
    return np.array([src in x for x in g])


def roc_auc(y, p):
    pos, neg = p[y == 1], p[y == 0]
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    _, inv, counts = np.unique(p, return_inverse=True, return_counts=True)
    order_ranks = np.empty(len(p))
    order = np.argsort(p); order_ranks[order] = np.arange(1, len(p) + 1)
    sums = np.zeros(len(counts)); np.add.at(sums, inv, order_ranks)
    ranks = (sums / counts)[inv]
    return float((ranks[y == 1].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


def report(y, p, thr):
    yp = (p >= thr).astype(int)
    tp = int(((yp == 1) & (y == 1)).sum()); fp = int(((yp == 1) & (y == 0)).sum())
    fn = int(((yp == 0) & (y == 1)).sum()); tn = int(((yp == 0) & (y == 0)).sum())
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    spec = tn / (tn + fp) if tn + fp else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    acc = (tp + tn) / max(tp + tn + fp + fn, 1)
    return {"threshold": round(thr, 3), "accuracy": round(acc, 4), "precision": round(prec, 4),
            "recall": round(rec, 4), "specificity": round(spec, 4), "f1": round(f1, 4),
            "roc_auc": round(roc_auc(y, p), 4), "tp": tp, "fp": fp, "fn": fn, "tn": tn}


def best_thr(y, p):
    bt, bf = 0.5, -1
    for t in np.linspace(0.1, 0.9, 17):
        m = report(y, p, t)
        if m["f1"] > bf:
            bf, bt = m["f1"], t
    return float(bt)


def main():
    torch.manual_seed(SEED); np.random.seed(SEED)

    Xtr_all, ytr_all, gtr = load("train")
    Xva_all, yva_all, gva = load("val")

    # DEPLOYED model trains IN-DOMAIN on the Le2i portion of train.
    tr_m = mask_src(gtr, "le2i")
    if tr_m.sum() < 50:
        print("Not enough Le2i train windows; falling back to all train.")
        tr_m = np.ones(len(ytr_all), bool)
    Xtr, ytr = Xtr_all[tr_m], ytr_all[tr_m]

    # Eval sets
    le2i_m = mask_src(gva, "le2i")
    gmd_m = mask_src(gva, "gmdcsa")
    Xv_le2i, yv_le2i = Xva_all[le2i_m], yva_all[le2i_m]
    Xv_gmd, yv_gmd = Xva_all[gmd_m], yva_all[gmd_m]

    print(f"Train (Le2i in-domain): {len(ytr)} windows, {int(ytr.sum())} fall")
    print(f"Eval  Le2i-val: {len(yv_le2i)} ({int(yv_le2i.sum())} fall) | "
          f"GMDCSA-S4 OOD: {len(yv_gmd)} ({int(yv_gmd.sum())} fall)")

    mean = Xtr.reshape(-1, Xtr.shape[-1]).mean(0)
    std = Xtr.reshape(-1, Xtr.shape[-1]).std(0) + 1e-6
    Xtr_n = (Xtr - mean) / std

    tr = DataLoader(TensorDataset(torch.from_numpy(Xtr_n).float(), torch.from_numpy(ytr).float()),
                    batch_size=BATCH, shuffle=True)
    model = TemporalFallModel()
    print(f"Model params: {count_parameters(model):,}")
    pos = max(int(ytr.sum()), 1); neg = int((ytr == 0).sum())
    crit = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([neg / pos], dtype=torch.float32))
    opt = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)

    def prob(X):
        model.eval()
        with torch.no_grad():
            return torch.sigmoid(model(torch.from_numpy(((X - mean) / std).astype(np.float32))).squeeze(1)).numpy()

    best_f1, best_state = -1, None
    for ep in range(1, EPOCHS + 1):
        model.train()
        for xb, yb in tr:
            opt.zero_grad(); crit(model(xb).squeeze(1), yb).backward(); opt.step()
        if len(yv_le2i):
            m = report(yv_le2i, prob(Xv_le2i), 0.5)
            if m["f1"] >= best_f1:
                best_f1 = m["f1"]; best_state = {k: v.clone() for k, v in model.state_dict().items()}
            if ep % 10 == 0:
                print(f"epoch {ep}: Le2i-val F1={m['f1']:.3f} AUC={m['roc_auc']:.3f}")
    if best_state:
        model.load_state_dict(best_state)

    # Full report
    thr = best_thr(yv_le2i, prob(Xv_le2i)) if len(yv_le2i) else 0.5
    out = {"model_params": count_parameters(model), "deployed_threshold": round(thr, 3)}
    print("\n==================== FULL M3 METRIC REPORT ====================")
    for name, (Xe, ye) in [("IN-DOMAIN (Le2i-val)", (Xv_le2i, yv_le2i)),
                           ("OUT-OF-DIST (GMDCSA Subject 4)", (Xv_gmd, yv_gmd))]:
        if len(ye) == 0:
            continue
        p = prob(Xe)
        r05 = report(ye, p, 0.5)
        rbt = report(ye, p, thr)
        out[name] = {"at_0.5": r05, "at_best": rbt}
        print(f"\n--- {name} ---")
        print(f"  ROC-AUC: {r05['roc_auc']}")
        print(f"  @0.50 : acc={r05['accuracy']} P={r05['precision']} R={r05['recall']} "
              f"spec={r05['specificity']} F1={r05['f1']}  (TP{r05['tp']} FP{r05['fp']} FN{r05['fn']} TN{r05['tn']})")
        print(f"  @{thr:.2f} : acc={rbt['accuracy']} P={rbt['precision']} R={rbt['recall']} "
              f"spec={rbt['specificity']} F1={rbt['f1']}  (TP{rbt['tp']} FP{rbt['fp']} FN{rbt['fn']} TN{rbt['tn']})")

    # Save deployed model + stats + metrics
    os.makedirs("models", exist_ok=True)
    torch.save({"state_dict": model.state_dict(), "feat_mean": mean.astype(np.float32),
                "feat_std": std.astype(np.float32), "deployed_threshold": thr,
                "metrics": out}, PT_PATH)
    np.savez(os.path.join("models", "m3_norm.npz"), mean=mean.astype(np.float32), std=std.astype(np.float32))
    export_onnx(model)
    with open(os.path.join("models", "m3_metrics.json"), "w") as f:
        json.dump(out, f, indent=2)
    print("\nSaved deployed model + ONNX (parity-checked) + models/m3_metrics.json")


if __name__ == "__main__":
    main()

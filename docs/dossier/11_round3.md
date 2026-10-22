# Round 3 evidence and raw outputs

Captured 2026-10-22. No project code was modified. The only generated project files are this report and the accompanying raw capture `round3_ablation_raw.json`. Full M3+rules results were replayed using the same `run_live.run(..., no_firestore=True)` pipeline; the alert gateway and sink were intercepted in memory, so these runs wrote no alerts to Firestore or `logs/alerts.json`.

## 1. Artifact provenance

**Finding: `evaluate_m3.py` produced the current checkpoint, ONNX file, and `m3_metrics.json`.** It uses the shared train arrays as input, then selects only rows whose `groups_train` value contains `le2i`: 812 windows (116 fall). It evaluates on 118 Le2i validation windows and 7,648 GMDCSA Subject 4 windows. Thus this is `evaluate_m3.py` on the 812-row Le2i subset of the 24,135-row array, not `train_m3.py` training on all 24,135 rows.

Evidence: `evaluate_m3.py` writes a checkpoint with top-level keys `state_dict`, `feat_mean`, `feat_std`, `deployed_threshold`, and `metrics`, and metrics keys `model_params`, `deployed_threshold`, `IN-DOMAIN (Le2i-val)`, and `OUT-OF-DIST (GMDCSA Subject 4)`. The present `.pt` and `.json` have exactly that schema. `train_m3.py` instead writes top-level checkpoint fields `roc_auc`, `metrics_half`, `metrics_best`, `best_threshold`, `source_validation`; its JSON starts with `roc_auc`, `metrics_half`, `metrics_best`, `best_threshold`, `source_validation`. The ONNX and JSON were written in the same evaluator save sequence; file mtimes are 0.15 seconds apart.

Train-array source counts from `groups_train.npy`:

| Source group | Windows |
|---|---:|
| `gmdcsa_Subject1` | 5255 |
| `gmdcsa_Subject2` | 9923 |
| `gmdcsa_Subject3` | 7645 |
| `le2i` | 812 |
| `local` | 500 |
| **Total** | **24135** |

`meta.json` raw contents:

```json
{
  "seq_len": 15,
  "feature_dim": 72,
  "train_windows": 24135,
  "train_fall": 3140,
  "val_windows": 7766,
  "val_fall": 851
}
```

Relevant raw evaluator stdout, previously saved at `docs/dossier/evaluate_m3_output.txt`:

```text
.\venv\Scripts\python.exe : C:\Users\sathi\Desktop\real-majorp\elderly-safety-system\venv\Lib\site-packages\torch\onnx\
_internal\torchscript_exporter\symbolic_opset9.py:4604: UserWarning: Exporting a model to ONNX with a batch_size other 
than 1, with a variable length with GRU can cause an error when running the ONNX model with a different batch size. 
Make sure to save the model with a batch size of 1, or define the initial states (h0/c0) as inputs of the model. 
At line:2 char:253
+ ... $backup -Force; .\venv\Scripts\python.exe evaluate_m3.py 2>&1 | Tee-O ...
+                     ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (C:\Users\sathi\... of the model. :String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
  return _generic_rnn(
Train (Le2i in-domain): 812 windows, 116 fall
Eval  Le2i-val: 118 (49 fall) | GMDCSA-S4 OOD: 7648 (802 fall)
Model params: 78,529
epoch 10: Le2i-val F1=0.918 AUC=0.985
epoch 20: Le2i-val F1=0.926 AUC=0.987
epoch 30: Le2i-val F1=0.907 AUC=0.986
epoch 40: Le2i-val F1=0.911 AUC=0.990
epoch 50: Le2i-val F1=0.886 AUC=0.991
epoch 60: Le2i-val F1=0.899 AUC=0.992

==================== FULL M3 METRIC REPORT ====================

--- IN-DOMAIN (Le2i-val) ---
  ROC-AUC: 0.9965
  @0.50 : acc=0.9831 P=1.0 R=0.9592 spec=1.0 F1=0.9792  (TP47 FP0 FN2 TN69)
  @0.15 : acc=0.9831 P=1.0 R=0.9592 spec=1.0 F1=0.9792  (TP47 FP0 FN2 TN69)

--- OUT-OF-DIST (GMDCSA Subject 4) ---
  ROC-AUC: 0.7576
  @0.50 : acc=0.6617 P=0.1843 R=0.6496 spec=0.6632 F1=0.2871  (TP521 FP2306 FN281 TN4540)
  @0.15 : acc=0.6391 P=0.1821 R=0.6995 spec=0.632 F1=0.289  (TP561 FP2519 FN241 TN4327)

Saved deployed model + ONNX (parity-checked) + models/m3_metrics.json
```

Artifact and input timestamps are UTC; hashes are SHA-256:

| File | Bytes | Last modified UTC | SHA-256 |
|---|---:|---|---|
| `models/m3_temporal_fall.pt` | 325941 | 2026-10-01T19:03:34.993016+00:00 | `d1828449fdd7751bc6a828f098d74f425766d7d190d2f60098b4fe6bbbc9a0d6` |
| `models/m3_temporal_fall.onnx` | 317947 | 2026-10-01T19:03:35.228979+00:00 | `3023f9425ed5a415d818c70668b180f0f079834ae5428cfe5f859915a5ccd3f0` |
| `models/m3_metrics.json` | 1232 | 2026-10-01T19:03:35.382043+00:00 | `d82e941a5dbcbdf4f4722357ff6155d5a92bf9818ce8813aefcd598e177a195a` |
| `evaluate_m3.py` | 6646 | 2026-10-01T19:03:06.907050+00:00 | `752ef7c796fdf25db6e596229e3ccf9bc1a5b2237155d11328e544e82871e4e7` |
| `train_m3.py` | 9600 | 2026-10-21T18:51:52.132492+00:00 | `deb71042a679397441336125815c30a5cc6e8c4ea213f1ef948086549c73dbe5` |
| `data/processed_features/X_train.npy` | 104263328 | 2026-10-01T18:26:58.343998+00:00 | `98697d05be40e5afaf2987c0d22cea1b2702e986f6618e334bed54fd8daff77a` |
| `data/processed_features/y_train.npy` | 193208 | 2026-10-01T18:26:58.345110+00:00 | `59dcff4c1c28a7c999776b67880d99cc08bfc2b860d30c2a862faac6f5b85808` |
| `data/processed_features/groups_train.npy` | 4730588 | 2026-10-01T18:26:58.347819+00:00 | `ae7a2c0baaa4823ca160710b61bf3777445a92acfbab0736fbf9427004dd1a65` |
| `data/manual_test_videos/gmdcsa24_s4_fall_low_light_original.mp4` | 950773 | 2026-09-21T19:30:36.991927+00:00 | `a04d831d11811425eff66e60dddf0b67219f53e202bb85c35278bc2d266a65da` |
| `data/raw_datasets/gmdcsa24/Subject 4/Fall/03.mp4` | 2421154 | 2026-10-01T17:58:09.074621+00:00 | `4f178dea77bf9abb9036bcd7fedfbe345358fc2d63e1704dc49b7ec1a621e2f7` |

`git log --date=iso-strict -- models/m3_temporal_fall.onnx models/m3_metrics.json models/m3_temporal_fall.pt evaluate_m3.py train_m3.py` returned:

```text
7686d3c 2026-10-03T12:23:11+05:30 Add elderly safety system source code
```

No later artifact-specific commit exists in the available history. The tracked artifact working-tree status was clean. The checkpoint schema and evaluator save code are the direct provenance evidence; mtimes and the single commit provide supporting chronology.

Full current `models/m3_metrics.json` (raw):

```json
{
  "model_params": 78529,
  "deployed_threshold": 0.15,
  "IN-DOMAIN (Le2i-val)": {
    "at_0.5": {
      "threshold": 0.5,
      "accuracy": 0.9831,
      "precision": 1.0,
      "recall": 0.9592,
      "specificity": 1.0,
      "f1": 0.9792,
      "roc_auc": 0.9965,
      "tp": 47,
      "fp": 0,
      "fn": 2,
      "tn": 69
    },
    "at_best": {
      "threshold": 0.15,
      "accuracy": 0.9831,
      "precision": 1.0,
      "recall": 0.9592,
      "specificity": 1.0,
      "f1": 0.9792,
      "roc_auc": 0.9965,
      "tp": 47,
      "fp": 0,
      "fn": 2,
      "tn": 69
    }
  },
  "OUT-OF-DIST (GMDCSA Subject 4)": {
    "at_0.5": {
      "threshold": 0.5,
      "accuracy": 0.6617,
      "precision": 0.1843,
      "recall": 0.6496,
      "specificity": 0.6632,
      "f1": 0.2871,
      "roc_auc": 0.7576,
      "tp": 521,
      "fp": 2306,
      "fn": 281,
      "tn": 4540
    },
    "at_best": {
      "threshold": 0.15,
      "accuracy": 0.6391,
      "precision": 0.1821,
      "recall": 0.6995,
      "specificity": 0.632,
      "f1": 0.289,
      "roc_auc": 0.7576,
      "tp": 561,
      "fp": 2519,
      "fn": 241,
      "tn": 4327
    }
  }
}
```

## 2. M4 trigger paths on Subject 4

The full M3+rules run instrumented M4 input values in memory without changing project code. M4 evaluates probability first: PRE_FALL uses `p_fall > 0.40`, else `hip_v_y > 1.2` and `trunk_tilt_deg > 35`; FALL_IMPACT confirmation uses `p_fall > 0.70`, else `tilt > 60`, `jerk > 1500`, and `vy > 1.2`. When both paths qualify, the recorded primary trigger is probability because that branch wins first. The exact recorded values and whether the alternate kinematic predicate also passed are in each row below.

Observed PRE_FALL state-entry transitions: **37 probability**, **19 kinematic** (56 transitions). Observed transitions from PRE_FALL into pending FALL_IMPACT confirmation: **46 probability**, **7 kinematic** (53 attempts). Of the 15 actual FALL_IMPACT alerts (10 labeled Fall clips and 5 ADL clips), the preceding transition was **8 probability** and **7 kinematic**. Confirmed candidate was mapped to the nearest preceding pending-impact transition using the alert time from the previously captured event run. The 10 labeled Fall alerts split 4 probability / 6 kinematic; the 5 ADL false Tier 2 alerts split 4 / 1.

### Every PRE_FALL transition

| Clip | Time (s) | Trigger | p | p threshold | Tilt (Â°) | vy | Jerk | Kinematic predicate also true |
|---|---:|---|---:|---:|---:|---:|---:|---|
| `Fall/01.mp4` | 2.044 | kinematic | 0.3548 | 0.40 | 35.4 | 7.7539 | 5702.14 | True |
| `Fall/02.mp4` | 2.977 | kinematic | 0.0159 | 0.40 | 54.4 | 11.6079 | 0.00 | True |
| `Fall/03.mp4` | 2.347 | kinematic | 0.0000 | 0.40 | 44.6 | 9.7599 | 0.00 | True |
| `Fall/04.mp4` | 1.641 | probability | 0.6233 | 0.40 | 32.4 | 0.0000 | 0.00 | False |
| `Fall/05.mp4` | 2.850 | kinematic | 0.0011 | 0.40 | 37.3 | 4.5325 | 166.45 | True |
| `Fall/06.mp4` | 1.407 | kinematic | 0.0063 | 0.40 | 35.7 | 1.4871 | 1027.74 | True |
| `Fall/07.mp4` | 1.710 | kinematic | 0.0051 | 0.40 | 40.2 | 2.3253 | 624.25 | True |
| `Fall/08.mp4` | 2.443 | kinematic | 0.0055 | 0.40 | 37.3 | 4.9867 | 2198.78 | True |
| `Fall/09.mp4` | 2.547 | kinematic | 0.0012 | 0.40 | 39.7 | 1.9756 | 0.00 | True |
| `Fall/10.mp4` | 2.010 | kinematic | 0.0013 | 0.40 | 35.8 | 1.9759 | 466.59 | True |
| `Fall/11.mp4` | 1.442 | kinematic | 0.0152 | 0.40 | 36.5 | 8.0427 | 2230.73 | True |
| `Fall/12.mp4` | 1.843 | probability | 0.9092 | 0.40 | 9.9 | 0.0000 | 0.00 | False |
| `Fall/13.mp4` | 0.536 | kinematic | 0.0000 | 0.40 | 37.8 | 4.4286 | 1023.05 | True |
| `Fall/14.mp4` | 1.070 | kinematic | 0.0011 | 0.40 | 36.2 | 1.7264 | 277.20 | True |
| `Fall/15.mp4` | 2.140 | probability | 0.7471 | 0.40 | 13.4 | 0.0000 | 0.00 | False |
| `Fall/16.mp4` | 2.514 | probability | 0.9780 | 0.40 | 7.9 | 0.0000 | 0.00 | False |
| `Fall/17.mp4` | 2.979 | kinematic | 0.0011 | 0.40 | 36.7 | 2.9697 | 1043.53 | True |
| `ADL/03.mp4` | 0.603 | probability | 0.9904 | 0.40 | 3.1 | -1.0159 | 169.17 | False |
| `ADL/03.mp4` | 2.613 | probability | 0.8958 | 0.40 | 9.4 | 0.4835 | 1419.73 | False |
| `ADL/03.mp4` | 4.624 | probability | 0.4776 | 0.40 | 5.5 | 0.6052 | 352.30 | False |
| `ADL/03.mp4` | 6.801 | probability | 0.4003 | 0.40 | 8.1 | 0.0344 | 21.22 | False |
| `ADL/04.mp4` | 0.604 | probability | 0.9868 | 0.40 | 20.1 | 0.0101 | 229.21 | False |
| `ADL/04.mp4` | 2.615 | probability | 0.9889 | 0.40 | 19.9 | -0.2251 | 277.66 | False |
| `ADL/04.mp4` | 4.627 | probability | 0.9888 | 0.40 | 19.4 | 0.7479 | 484.65 | False |
| `ADL/04.mp4` | 6.639 | probability | 0.9862 | 0.40 | 19.0 | 0.1708 | 89.18 | False |
| `ADL/04.mp4` | 8.651 | probability | 0.9880 | 0.40 | 21.8 | -0.7709 | 653.91 | False |
| `ADL/04.mp4` | 10.662 | probability | 0.9874 | 0.40 | 21.6 | 0.1998 | 262.47 | False |
| `ADL/04.mp4` | 12.674 | probability | 0.9882 | 0.40 | 20.7 | -0.0096 | 73.13 | False |
| `ADL/05.mp4` | 2.376 | probability | 0.6735 | 0.40 | 12.7 | 0.0000 | 0.00 | False |
| `ADL/06.mp4` | 1.175 | kinematic | 0.0149 | 0.40 | 40.3 | 7.9650 | 520.23 | True |
| `ADL/07.mp4` | 0.369 | kinematic | 0.0000 | 0.40 | 49.1 | 2.5671 | 2758.68 | True |
| `ADL/09.mp4` | 0.603 | probability | 0.8970 | 0.40 | 1.3 | -1.1326 | 49.84 | False |
| `ADL/09.mp4` | 2.614 | probability | 0.8156 | 0.40 | 1.8 | 1.5019 | 1941.21 | False |
| `ADL/09.mp4` | 4.624 | probability | 0.9213 | 0.40 | 1.4 | 1.0590 | 1550.76 | False |
| `ADL/09.mp4` | 6.634 | probability | 0.9817 | 0.40 | 1.5 | -0.0998 | 204.28 | False |
| `ADL/09.mp4` | 8.645 | probability | 0.9724 | 0.40 | 0.8 | 0.4594 | 1097.12 | False |
| `ADL/09.mp4` | 10.655 | probability | 0.7185 | 0.40 | 1.2 | 0.0263 | 71.61 | False |
| `ADL/10.mp4` | 1.776 | probability | 0.5389 | 0.40 | 9.1 | 3.6077 | 169.43 | False |
| `ADL/10.mp4` | 3.787 | probability | 0.9145 | 0.40 | 2.5 | 1.2302 | 365.03 | False |
| `ADL/11.mp4` | 0.603 | probability | 0.9895 | 0.40 | 2.9 | 0.6664 | 398.51 | False |
| `ADL/11.mp4` | 2.613 | probability | 0.9927 | 0.40 | 0.5 | -3.6209 | 3614.58 | False |
| `ADL/11.mp4` | 4.624 | probability | 0.9940 | 0.40 | 3.6 | -1.0337 | 1678.53 | False |
| `ADL/11.mp4` | 6.634 | probability | 0.9945 | 0.40 | 4.5 | 0.0814 | 218.91 | False |
| `ADL/11.mp4` | 8.644 | probability | 0.9938 | 0.40 | 5.3 | -0.1207 | 245.27 | False |
| `ADL/11.mp4` | 10.654 | probability | 0.9950 | 0.40 | 3.2 | -3.2810 | 1923.16 | False |
| `ADL/12.mp4` | 0.603 | probability | 0.9910 | 0.40 | 1.0 | 6.1624 | 608.29 | False |
| `ADL/12.mp4` | 2.613 | probability | 0.9772 | 0.40 | 5.9 | -0.4930 | 2053.23 | False |
| `ADL/12.mp4` | 4.623 | probability | 0.9834 | 0.40 | 2.0 | -0.5937 | 372.44 | False |
| `ADL/12.mp4` | 6.633 | probability | 0.9805 | 0.40 | 0.6 | -0.0451 | 307.27 | False |
| `ADL/14.mp4` | 2.813 | kinematic | 0.0093 | 0.40 | 38.5 | 2.5156 | 572.35 | True |
| `ADL/15.mp4` | 1.006 | probability | 0.7557 | 0.40 | 36.9 | -1.5517 | 2137.22 | False |
| `ADL/16.mp4` | 2.949 | probability | 0.4825 | 0.40 | 35.6 | -0.3379 | 2671.97 | False |
| `ADL/17.mp4` | 1.205 | probability | 0.5973 | 0.40 | 1.0 | 0.0000 | 0.00 | False |
| `ADL/19.mp4` | 1.539 | kinematic | 0.0014 | 0.40 | 35.5 | 2.1438 | 260.54 | True |
| `ADL/20.mp4` | 0.402 | kinematic | 0.0000 | 0.40 | 36.1 | 2.3207 | 1591.02 | True |
| `ADL/20.mp4` | 14.339 | kinematic | 0.0600 | 0.40 | 35.8 | 2.3857 | 728.19 | True |

### Every pending-impact transition, with confirmation outcome

| Clip | Time (s) | Trigger | p | p threshold | Tilt (Â°) | vy | Jerk | Kinematic predicate also true | Confirmed Tier 2 FALL_IMPACT |
|---|---:|---|---:|---:|---:|---:|---:|---|---|
| `Fall/01.mp4` | 2.077 | probability | 0.8613 | 0.70 | 37.5 | 0.0000 | 0.00 | False | False |
| `Fall/03.mp4` | 2.883 | probability | 0.9491 | 0.70 | 46.6 | 2.2434 | 1222.29 | False | True |
| `Fall/04.mp4` | 1.674 | probability | 0.9659 | 0.70 | 40.3 | 0.0000 | 0.00 | False | True |
| `Fall/05.mp4` | 3.118 | kinematic | 0.0021 | 0.70 | 71.6 | 2.0524 | 1571.17 | True | True |
| `Fall/06.mp4` | 1.976 | kinematic | 0.2064 | 0.70 | 70.3 | 3.1438 | 2969.96 | True | True |
| `Fall/07.mp4` | 1.878 | probability | 0.7090 | 0.70 | 56.5 | 1.0585 | 541.64 | False | True |
| `Fall/08.mp4` | 2.610 | kinematic | 0.0199 | 0.70 | 60.2 | 1.4751 | 2854.48 | True | True |
| `Fall/09.mp4` | 3.150 | probability | 0.8365 | 0.70 | 74.1 | 0.0000 | 0.00 | False | True |
| `Fall/10.mp4` | 2.378 | probability | 0.8286 | 0.70 | 75.2 | 0.0000 | 0.00 | False | False |
| `Fall/11.mp4` | 1.509 | probability | 0.7627 | 0.70 | 55.7 | 7.4974 | 1308.21 | False | False |
| `Fall/12.mp4` | 1.877 | probability | 0.9745 | 0.70 | 9.5 | 0.0000 | 0.00 | False | False |
| `Fall/13.mp4` | 0.771 | kinematic | 0.0021 | 0.70 | 85.2 | 3.3497 | 3333.15 | True | True |
| `Fall/14.mp4` | 1.271 | kinematic | 0.0018 | 0.70 | 62.9 | 2.9973 | 3154.67 | True | True |
| `Fall/15.mp4` | 2.174 | probability | 0.9238 | 0.70 | 19.2 | 0.0000 | 0.00 | False | False |
| `Fall/17.mp4` | 3.180 | kinematic | 0.0018 | 0.70 | 67.2 | 1.5023 | 1852.31 | True | True |
| `ADL/03.mp4` | 0.637 | probability | 0.9904 | 0.70 | 3.1 | 0.2667 | 762.22 | False | False |
| `ADL/03.mp4` | 2.647 | probability | 0.9207 | 0.70 | 8.7 | 0.4416 | 1263.18 | False | False |
| `ADL/03.mp4` | 4.724 | probability | 0.7234 | 0.70 | 5.9 | 0.3763 | 178.07 | False | False |
| `ADL/04.mp4` | 0.637 | probability | 0.9874 | 0.70 | 21.0 | 0.4230 | 13.59 | False | False |
| `ADL/04.mp4` | 2.649 | probability | 0.9886 | 0.70 | 19.9 | -0.0636 | 197.23 | False | False |
| `ADL/04.mp4` | 4.661 | probability | 0.9887 | 0.70 | 19.4 | 0.1887 | 239.38 | False | False |
| `ADL/04.mp4` | 6.672 | probability | 0.9859 | 0.70 | 19.0 | 0.0935 | 7.74 | False | False |
| `ADL/04.mp4` | 8.684 | probability | 0.9883 | 0.70 | 21.9 | 0.1680 | 230.90 | False | False |
| `ADL/04.mp4` | 10.696 | probability | 0.9863 | 0.70 | 21.6 | 0.3313 | 133.44 | False | False |
| `ADL/04.mp4` | 12.708 | probability | 0.9884 | 0.70 | 20.7 | -0.0382 | 211.50 | False | False |
| `ADL/05.mp4` | 2.409 | probability | 0.8639 | 0.70 | 17.3 | 0.0000 | 0.00 | False | False |
| `ADL/06.mp4` | 1.275 | probability | 0.9026 | 0.70 | 51.5 | 7.6747 | 2743.76 | False | True |
| `ADL/07.mp4` | 0.603 | probability | 0.9964 | 0.70 | 51.1 | 4.6305 | 649.39 | False | True |
| `ADL/09.mp4` | 0.637 | probability | 0.8848 | 0.70 | 1.8 | -0.3515 | 61.05 | False | False |
| `ADL/09.mp4` | 2.647 | probability | 0.8803 | 0.70 | 1.9 | 0.1384 | 1620.41 | False | False |
| `ADL/09.mp4` | 4.657 | probability | 0.8995 | 0.70 | 1.5 | -0.8681 | 844.53 | False | False |
| `ADL/09.mp4` | 6.668 | probability | 0.9791 | 0.70 | 1.5 | -0.1491 | 66.69 | False | False |
| `ADL/09.mp4` | 8.678 | probability | 0.9730 | 0.70 | 1.0 | 0.1324 | 1454.29 | False | False |
| `ADL/09.mp4` | 10.856 | probability | 0.7589 | 0.70 | 0.5 | -0.2432 | 464.76 | False | False |
| `ADL/10.mp4` | 1.810 | probability | 0.7270 | 0.70 | 9.1 | -2.2454 | 5764.04 | False | False |
| `ADL/10.mp4` | 3.820 | probability | 0.8959 | 0.70 | 1.8 | 7.7564 | 5002.03 | False | True |
| `ADL/11.mp4` | 0.637 | probability | 0.9899 | 0.70 | 3.1 | 2.5764 | 1538.57 | False | False |
| `ADL/11.mp4` | 2.647 | probability | 0.9928 | 0.70 | 0.5 | -3.2370 | 3853.18 | False | False |
| `ADL/11.mp4` | 4.657 | probability | 0.9939 | 0.70 | 4.0 | 1.6715 | 2010.10 | False | False |
| `ADL/11.mp4` | 6.667 | probability | 0.9947 | 0.70 | 4.6 | 1.4033 | 386.86 | False | False |
| `ADL/11.mp4` | 8.678 | probability | 0.9938 | 0.70 | 5.0 | 0.5825 | 622.71 | False | False |
| `ADL/11.mp4` | 10.688 | probability | 0.9950 | 0.70 | 3.2 | 1.8179 | 2856.74 | False | False |
| `ADL/12.mp4` | 0.636 | probability | 0.9906 | 0.70 | 1.0 | -0.0826 | 1309.78 | False | False |
| `ADL/12.mp4` | 2.646 | probability | 0.9799 | 0.70 | 5.7 | -1.2472 | 5487.33 | False | False |
| `ADL/12.mp4` | 4.656 | probability | 0.9825 | 0.70 | 1.6 | -0.1836 | 609.85 | False | False |
| `ADL/12.mp4` | 6.666 | probability | 0.9801 | 0.70 | 0.7 | 0.0792 | 82.64 | False | False |
| `ADL/14.mp4` | 3.081 | probability | 0.7544 | 0.70 | 57.5 | 0.6597 | 136.29 | False | False |
| `ADL/15.mp4` | 1.039 | probability | 0.8969 | 0.70 | 36.9 | -0.0430 | 961.51 | False | False |
| `ADL/16.mp4` | 2.982 | probability | 0.8926 | 0.70 | 35.3 | 1.1256 | 599.01 | False | True |
| `ADL/17.mp4` | 2.075 | probability | 0.8824 | 0.70 | 35.5 | 0.0000 | 0.00 | False | False |
| `ADL/19.mp4` | 1.707 | kinematic | 0.0270 | 0.70 | 62.7 | 2.9221 | 4133.52 | True | True |
| `ADL/20.mp4` | 0.637 | probability | 0.8905 | 0.70 | 60.5 | 1.6627 | 992.96 | False | False |
| `ADL/20.mp4` | 14.439 | probability | 0.7225 | 0.70 | 39.8 | 1.2249 | 185.52 | False | False |

`FALL_IMPACT` in this table is the trigger transition that starts M4 confirmation. M4 emits the Tier 2 alert only after the confirmation timer succeeds; canceled candidates are marked `false`. `POSE_LOST_WHILE_FALLEN` is a separate Tier 2 type and is not counted as a FALL_IMPACT.

## 3. Ablation results

Each configuration processed all 17 Fall and 20 ADL clips end to end. `Tier 1`, `FALL_IMPACT`, and `Tier 2` counts are video counts (a clip counts once if it emitted that event at least once).

| Configuration | Fall videos with Tier 1 / 17 | Fall videos with FALL_IMPACT / 17 | Fall videos with any Tier 2 / 17 | ADL videos with Tier 1 / 20 | ADL videos with Tier 2 / 20 |
|---|---:|---:|---:|---:|---:|
| (b) Full M3 + rules | 17 | 10 | 11 | 15 | 5 |
| (a) Rules only; force p=0 | 14 | 8 | 8 | 10 | 5 |
| (c) M3 only; disable kinematic entry rules | 16 | 9 | 10 | 15 | 4 |

Full-run consistency check against `round2_run_live_raw.json`: **37 videos; Tier 1, Tier 2, and Tier 2 type fields matched for all 37 clips** (differences: 0).

Exact per-clip event counts are printed below as `Tier1/FALL_IMPACT/anyTier2` (1=yes, 0=no):

| Clip | Full M3 + rules | Rules only | M3 only |
|---|---:|---:|---:|
| `Fall/01.mp4` | 1/0/0 | 1/1/1 | 1/1/1 |
| `Fall/02.mp4` | 1/0/0 | 1/0/0 | 0/0/0 |
| `Fall/03.mp4` | 1/1/1 | 1/0/0 | 1/1/1 |
| `Fall/04.mp4` | 1/1/1 | 0/0/0 | 1/1/1 |
| `Fall/05.mp4` | 1/1/1 | 1/1/1 | 1/1/1 |
| `Fall/06.mp4` | 1/1/1 | 1/1/1 | 1/1/1 |
| `Fall/07.mp4` | 1/1/1 | 1/1/1 | 1/1/1 |
| `Fall/08.mp4` | 1/1/1 | 1/1/1 | 1/1/1 |
| `Fall/09.mp4` | 1/1/1 | 1/0/0 | 1/1/1 |
| `Fall/10.mp4` | 1/0/0 | 1/0/0 | 1/0/0 |
| `Fall/11.mp4` | 1/0/0 | 1/0/0 | 1/0/0 |
| `Fall/12.mp4` | 1/0/0 | 1/0/0 | 1/0/0 |
| `Fall/13.mp4` | 1/1/1 | 1/1/1 | 1/0/0 |
| `Fall/14.mp4` | 1/1/1 | 1/1/1 | 1/0/0 |
| `Fall/15.mp4` | 1/0/0 | 0/0/0 | 1/0/0 |
| `Fall/16.mp4` | 1/0/1 | 0/0/0 | 1/0/1 |
| `Fall/17.mp4` | 1/1/1 | 1/1/1 | 1/1/1 |
| `ADL/01.mp4` | 0/0/0 | 0/0/0 | 0/0/0 |
| `ADL/02.mp4` | 0/0/0 | 0/0/0 | 0/0/0 |
| `ADL/03.mp4` | 1/0/0 | 0/0/0 | 1/0/0 |
| `ADL/04.mp4` | 1/0/0 | 0/0/0 | 1/0/0 |
| `ADL/05.mp4` | 1/0/0 | 1/0/0 | 1/0/0 |
| `ADL/06.mp4` | 1/1/1 | 1/1/1 | 1/1/1 |
| `ADL/07.mp4` | 1/1/1 | 1/1/1 | 1/1/1 |
| `ADL/08.mp4` | 0/0/0 | 0/0/0 | 0/0/0 |
| `ADL/09.mp4` | 1/0/0 | 0/0/0 | 1/0/0 |
| `ADL/10.mp4` | 1/1/1 | 1/0/0 | 1/1/1 |
| `ADL/11.mp4` | 1/0/0 | 0/0/0 | 1/0/0 |
| `ADL/12.mp4` | 1/0/0 | 0/0/0 | 1/0/0 |
| `ADL/13.mp4` | 0/0/0 | 0/0/0 | 0/0/0 |
| `ADL/14.mp4` | 1/0/0 | 1/0/0 | 1/0/0 |
| `ADL/15.mp4` | 1/0/0 | 1/1/1 | 1/0/0 |
| `ADL/16.mp4` | 1/1/1 | 1/1/1 | 1/1/1 |
| `ADL/17.mp4` | 1/0/0 | 1/0/0 | 1/0/0 |
| `ADL/18.mp4` | 0/0/0 | 0/0/0 | 0/0/0 |
| `ADL/19.mp4` | 1/1/1 | 1/1/1 | 1/0/0 |
| `ADL/20.mp4` | 1/0/0 | 1/0/0 | 1/0/0 |

Runtime ablation definitions: rules-only overwrote only the p value supplied to M4 with 0.0; M3 extraction/inference still ran. M3-only set `pre_fall_vy = +inf` in a runtime M4Config copy, which disables the kinematic PRE_FALL and impact predicates while preserving M3 probability thresholds and the ordinary confirmation/alert lifecycle. No code or saved config was modified.

## 4. Low-light file identity

**Yes: the low-light manual-test file is the same clip footage as `data/raw_datasets/gmdcsa24/Subject 4/Fall/03.mp4`; it is not byte-identical.** SHA-256 differs (`a04dâ€¦65da` vs `4f17â€¦e2f7`). Both decode as 200 frames at 29.826 FPS and 640Ã—480. The frame matcher sampled every 4 frames from local frame 0 through 196 and matched each to the same frame index in validation `Fall/03.mp4`, with 600â€“968 RANSAC inliers per sampled pair (sample pairs: 0â†’0: 897, 4â†’4: 847, 80â†’80: 968, 196â†’196: 884). This is consistent with a re-encoded copy of the same full clip. The exact resized-frame hash check (every fifth frame, grayscale 64Ã—64) had no exact digest overlap because of encoding differences.

The all-video ORB scanâ€™s top five best frame pairs were:

| Validation clip | Inliers | Local frame | Validation frame |
|---|---:|---:|---:|
| `Subject 4/Fall/03.mp4` | 816 | 80 | 80 |
| `Subject 4/Fall/04.mp4` | 226 | 120 | 56 |
| `Subject 4/Fall/05.mp4` | 160 | 192 | 32 |
| `Subject 4/Fall/06.mp4` | 120 | 168 | 168 |
| `Subject 4/Fall/07.mp4` | 105 | 112 | 96 |

The substantial match to `Fall/03.mp4` across all sampled frame indices establishes the clip relation; lower isolated matches to other clips are shared room/background features and do not show a temporal sequence.

## 5. Subject 4 `Fall.csv` raw output

Found 1 matching `Fall.csv` file(s). Printed header plus first three data rows:

```csv
# data/raw_datasets/gmdcsa24/Subject 4\Fall.csv
File Name,Length (seconds),Time of Recording,Attire,Description, Classes
01.mp4,04,Day (Lights On),Full Shirt & Pant,Standing on the bed to falling (LS) on the bed, Falling (SW)[1.8 to 4]; Standing[0 to 1.5]
02.mp4,02,Day (Lights On),Full Shirt & Pant,Falling (LS) from the bed to the floor, Falling (SW)[1.5 to 2]; Sleeping[0 to 1.4]
03.mp4,06,Day (Lights Off),Full Shirt & Pant,Walking then falling (forward) view 1, Falling (FW)[1.7 to 6]; Walking[0 to 1.7]
```

## Raw ablation capture

The complete JSON capture from the 111 full-pipeline runs (37 videos Ã— 3 configurations), including every PRE_FALL and pending-impact input tuple, is in [round3_ablation_raw.json](round3_ablation_raw.json). It contains no resident/caretaker IDs or secrets. The saved evaluator console output is [evaluate_m3_output.txt](evaluate_m3_output.txt).



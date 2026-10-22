# Round 2 measurements

Date: 2026-10-22 (Asia/Calcutta).

No code files were modified. All event-level rows come from calling `run_live.run(video, None, False, True)` for each input (CLI-equivalent to `--video ... --no-firestore`). To avoid the runner?s local `logs/alerts.json` persistence, a temporary in-memory sink replaced `LocalJsonSink`; preview display calls were suppressed. Firestore was disabled. The runner printed local lifecycle messages; IDs and names are omitted/redacted here. Raw per-video records: [`round2_run_live_raw.json`](round2_run_live_raw.json).

## 1. DATA / M3 training split

Training uses `data/processed_features/{X,y,groups}_{train,val}.npy`; feature arrays have shape [windows, 15, 72]. Stored groups are clip/video group IDs. There is no test array/split (`X_test.npy`, `y_test.npy`, `groups_test.npy` absent): **test videos/windows = NOT MEASURED**.

| Split | Windows | Non-fall (0) | Fall (1) | Video groups |
|---|---:|---:|---:|---:|
| train | 24135 | 20995 | 3140 | 537 |
| val | 7766 | 6915 | 851 | 97 |

Source and grouping rules read from `extract_dataset_features.py`: Le2i `train` folders feed train and Le2i `val` folders feed validation (folder `Fall` is class 1; `Blank`, `Stand`, `Lie`, `Likefall` class 0); GMDCSA Subjects 1?3 feed train and Subject 4 feeds validation; the three named local manual clips are appended to train. GMDCSA ADL windows are all class 0. GMDCSA Fall windows are class 1 only when a 15-frame window has `max(degrees(tilt)) >= 60.0` AND `max(hip_vy) >= 2.0`; otherwise 0. Local fall clips use the same signature; the local ADL clip is always 0. A window is formed from 15 consecutive valid pose frames; invalid frames/gaps reset the temporal buffer.

**Subject 4 exclusion:** raw GMDCSA Subject 4 groups are validation, excluded from the training split. However `data/manual_test_videos/gmdcsa24_s4_fall_low_light_original.mp4` is explicitly appended as a local training source. Thus Subject 4?s directory videos are excluded, but complete Subject 4 person-level exclusion is **NO** (the locally named clip may be the same subject; identity cannot be independently established).

**Exact per-video group inventory:** `group` strings are the stored source group IDs; counts are `non-fall_windows` / `fall_windows`. Full tab separated lists also saved as [`round2_train_groups.tsv`](../../data/processed_features/round2_train_groups.tsv) and [`round2_val_groups.tsv`](../../data/processed_features/round2_val_groups.tsv).

### train groups (537)

| Video/group ID | Class 0 windows | Class 1 windows |
|---|---:|---:|
| `gmdcsa_Subject1_ADL_01.mp4` | 231 | 0 |
| `gmdcsa_Subject1_ADL_02.mp4` | 184 | 0 |
| `gmdcsa_Subject1_ADL_03.mp4` | 185 | 0 |
| `gmdcsa_Subject1_ADL_04.mp4` | 156 | 0 |
| `gmdcsa_Subject1_ADL_05.mp4` | 248 | 0 |
| `gmdcsa_Subject1_ADL_06.mp4` | 350 | 0 |
| `gmdcsa_Subject1_ADL_07.mp4` | 210 | 0 |
| `gmdcsa_Subject1_ADL_08.mp4` | 173 | 0 |
| `gmdcsa_Subject1_ADL_09.mp4` | 133 | 0 |
| `gmdcsa_Subject1_ADL_10.mp4` | 101 | 0 |
| `gmdcsa_Subject1_ADL_11.mp4` | 263 | 0 |
| `gmdcsa_Subject1_ADL_12.mp4` | 204 | 0 |
| `gmdcsa_Subject1_ADL_13.mp4` | 173 | 0 |
| `gmdcsa_Subject1_ADL_14.mp4` | 159 | 0 |
| `gmdcsa_Subject1_ADL_15.mp4` | 198 | 0 |
| `gmdcsa_Subject1_ADL_16.mp4` | 90 | 0 |
| `gmdcsa_Subject1_Fall_01.mp4` | 93 | 27 |
| `gmdcsa_Subject1_Fall_02.mp4` | 54 | 32 |
| `gmdcsa_Subject1_Fall_03.mp4` | 118 | 44 |
| `gmdcsa_Subject1_Fall_04.mp4` | 104 | 28 |
| `gmdcsa_Subject1_Fall_05.mp4` | 84 | 76 |
| `gmdcsa_Subject1_Fall_06.mp4` | 75 | 80 |
| `gmdcsa_Subject1_Fall_07.mp4` | 91 | 48 |
| `gmdcsa_Subject1_Fall_08.mp4` | 57 | 58 |
| `gmdcsa_Subject1_Fall_09.mp4` | 29 | 88 |
| `gmdcsa_Subject1_Fall_10.mp4` | 97 | 22 |
| `gmdcsa_Subject1_Fall_11.mp4` | 69 | 98 |
| `gmdcsa_Subject1_Fall_12.mp4` | 79 | 107 |
| `gmdcsa_Subject1_Fall_13.mp4` | 93 | 0 |
| `gmdcsa_Subject1_Fall_14.mp4` | 105 | 10 |
| `gmdcsa_Subject1_Fall_15.mp4` | 126 | 38 |
| `gmdcsa_Subject1_Fall_16.mp4` | 122 | 45 |
| `gmdcsa_Subject2_ADL_01.mp4` | 326 | 0 |
| `gmdcsa_Subject2_ADL_02.mp4` | 318 | 0 |
| `gmdcsa_Subject2_ADL_03.mp4` | 342 | 0 |
| `gmdcsa_Subject2_ADL_04.mp4` | 220 | 0 |
| `gmdcsa_Subject2_ADL_05.mp4` | 309 | 0 |
| `gmdcsa_Subject2_ADL_06.mp4` | 307 | 0 |
| `gmdcsa_Subject2_ADL_07.mp4` | 374 | 0 |
| `gmdcsa_Subject2_ADL_08.mp4` | 394 | 0 |
| `gmdcsa_Subject2_ADL_09.mp4` | 313 | 0 |
| `gmdcsa_Subject2_ADL_10.mp4` | 212 | 0 |
| `gmdcsa_Subject2_ADL_11.mp4` | 284 | 0 |
| `gmdcsa_Subject2_ADL_12.mp4` | 182 | 0 |
| `gmdcsa_Subject2_ADL_13.mp4` | 131 | 0 |
| `gmdcsa_Subject2_ADL_14.mp4` | 91 | 0 |
| `gmdcsa_Subject2_ADL_15.mp4` | 165 | 0 |
| `gmdcsa_Subject2_ADL_16.mp4` | 149 | 0 |
| `gmdcsa_Subject2_ADL_17.mp4` | 136 | 0 |
| `gmdcsa_Subject2_ADL_18.mp4` | 160 | 0 |
| `gmdcsa_Subject2_ADL_19.mp4` | 156 | 0 |
| `gmdcsa_Subject2_ADL_20.mp4` | 142 | 0 |
| `gmdcsa_Subject2_ADL_21.mp4` | 144 | 0 |
| `gmdcsa_Subject2_ADL_22.mp4` | 168 | 0 |
| `gmdcsa_Subject2_ADL_23.mp4` | 95 | 0 |
| `gmdcsa_Subject2_Fall_01.mp4` | 117 | 59 |
| `gmdcsa_Subject2_Fall_02.mp4` | 95 | 58 |
| `gmdcsa_Subject2_Fall_03.mp4` | 159 | 37 |
| `gmdcsa_Subject2_Fall_04.mp4` | 170 | 104 |
| `gmdcsa_Subject2_Fall_05.mp4` | 49 | 72 |
| `gmdcsa_Subject2_Fall_06.mp4` | 133 | 47 |
| `gmdcsa_Subject2_Fall_07.mp4` | 67 | 54 |
| `gmdcsa_Subject2_Fall_08.mp4` | 140 | 27 |
| `gmdcsa_Subject2_Fall_09.mp4` | 56 | 53 |
| `gmdcsa_Subject2_Fall_10.mp4` | 30 | 92 |
| `gmdcsa_Subject2_Fall_11.mp4` | 64 | 62 |
| `gmdcsa_Subject2_Fall_12.mp4` | 140 | 15 |
| `gmdcsa_Subject2_Fall_13.mp4` | 103 | 16 |
| `gmdcsa_Subject2_Fall_14.mp4` | 53 | 38 |
| `gmdcsa_Subject2_Fall_15.mp4` | 277 | 0 |
| `gmdcsa_Subject2_Fall_16.mp4` | 79 | 27 |
| `gmdcsa_Subject2_Fall_17.mp4` | 86 | 94 |
| `gmdcsa_Subject2_Fall_18.mp4` | 307 | 24 |
| `gmdcsa_Subject2_Fall_19.mp4` | 249 | 200 |
| `gmdcsa_Subject2_Fall_20.mp4` | 277 | 51 |
| `gmdcsa_Subject2_Fall_21.mp4` | 241 | 28 |
| `gmdcsa_Subject2_Fall_22.mp4` | 55 | 86 |
| `gmdcsa_Subject2_Fall_23.mp4` | 151 | 60 |
| `gmdcsa_Subject2_Fall_24.mp4` | 199 | 0 |
| `gmdcsa_Subject2_Fall_25.mp4` | 184 | 20 |
| `gmdcsa_Subject3_ADL_01.mp4` | 247 | 0 |
| `gmdcsa_Subject3_ADL_02.mp4` | 259 | 0 |
| `gmdcsa_Subject3_ADL_03.mp4` | 282 | 0 |
| `gmdcsa_Subject3_ADL_04.mp4` | 286 | 0 |
| `gmdcsa_Subject3_ADL_05.mp4` | 140 | 0 |
| `gmdcsa_Subject3_ADL_06.mp4` | 253 | 0 |
| `gmdcsa_Subject3_ADL_07.mp4` | 86 | 0 |
| `gmdcsa_Subject3_ADL_08.mp4` | 132 | 0 |
| `gmdcsa_Subject3_ADL_09.mp4` | 218 | 0 |
| `gmdcsa_Subject3_ADL_10.mp4` | 357 | 0 |
| `gmdcsa_Subject3_ADL_11.mp4` | 347 | 0 |
| `gmdcsa_Subject3_ADL_12.mp4` | 146 | 0 |
| `gmdcsa_Subject3_ADL_13.mp4` | 105 | 0 |
| `gmdcsa_Subject3_ADL_14.mp4` | 113 | 0 |
| `gmdcsa_Subject3_ADL_15.mp4` | 101 | 0 |
| `gmdcsa_Subject3_ADL_16.mp4` | 292 | 0 |
| `gmdcsa_Subject3_ADL_17.mp4` | 168 | 0 |
| `gmdcsa_Subject3_ADL_18.mp4` | 153 | 0 |
| `gmdcsa_Subject3_ADL_19.mp4` | 83 | 0 |
| `gmdcsa_Subject3_ADL_20.mp4` | 127 | 0 |
| `gmdcsa_Subject3_ADL_21.mp4` | 291 | 0 |
| `gmdcsa_Subject3_ADL_22.mp4` | 269 | 0 |
| `gmdcsa_Subject3_Fall_01.mp4` | 1 | 99 |
| `gmdcsa_Subject3_Fall_02.mp4` | 84 | 72 |
| `gmdcsa_Subject3_Fall_03.mp4` | 66 | 87 |
| `gmdcsa_Subject3_Fall_04.mp4` | 124 | 25 |
| `gmdcsa_Subject3_Fall_05.mp4` | 246 | 40 |
| `gmdcsa_Subject3_Fall_06.mp4` | 110 | 42 |
| `gmdcsa_Subject3_Fall_07.mp4` | 225 | 30 |
| `gmdcsa_Subject3_Fall_08.mp4` | 0 | 172 |
| `gmdcsa_Subject3_Fall_09.mp4` | 156 | 16 |
| `gmdcsa_Subject3_Fall_10.mp4` | 59 | 58 |
| `gmdcsa_Subject3_Fall_11.mp4` | 212 | 41 |
| `gmdcsa_Subject3_Fall_12.mp4` | 95 | 18 |
| `gmdcsa_Subject3_Fall_13.mp4` | 92 | 15 |
| `gmdcsa_Subject3_Fall_14.mp4` | 335 | 0 |
| `gmdcsa_Subject3_Fall_15.mp4` | 71 | 0 |
| `gmdcsa_Subject3_Fall_16.mp4` | 24 | 52 |
| `gmdcsa_Subject3_Fall_17.mp4` | 14 | 14 |
| `gmdcsa_Subject3_Fall_18.mp4` | 117 | 0 |
| `gmdcsa_Subject3_Fall_19.mp4` | 38 | 0 |
| `gmdcsa_Subject3_Fall_20.mp4` | 60 | 20 |
| `gmdcsa_Subject3_Fall_21.mp4` | 213 | 47 |
| `le2i_train_Fall_coffee_v10c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v11c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v13c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v14c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v17c2` | 0 | 2 |
| `le2i_train_Fall_coffee_v19c2` | 0 | 2 |
| `le2i_train_Fall_coffee_v1c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v21c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v24c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v25c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v25c2` | 0 | 2 |
| `le2i_train_Fall_coffee_v26c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v27c2` | 0 | 2 |
| `le2i_train_Fall_coffee_v28c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v29c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v2c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v30c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v33c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v34c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v35c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v37c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v38c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v39c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v3c2` | 0 | 2 |
| `le2i_train_Fall_coffee_v40c2` | 0 | 2 |
| `le2i_train_Fall_coffee_v41c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v42c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v44c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v45c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v47c2` | 0 | 2 |
| `le2i_train_Fall_coffee_v48c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v4c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v50c2` | 0 | 2 |
| `le2i_train_Fall_coffee_v51c2` | 0 | 2 |
| `le2i_train_Fall_coffee_v53c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v56c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v57c2` | 0 | 2 |
| `le2i_train_Fall_coffee_v58c2` | 0 | 2 |
| `le2i_train_Fall_coffee_v59c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v5c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v60c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v62c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v6c1` | 0 | 2 |
| `le2i_train_Fall_coffee_v8c1` | 0 | 1 |
| `le2i_train_Fall_home_v11c2` | 0 | 2 |
| `le2i_train_Fall_home_v12c1` | 0 | 2 |
| `le2i_train_Fall_home_v13c1` | 0 | 2 |
| `le2i_train_Fall_home_v19c1` | 0 | 2 |
| `le2i_train_Fall_home_v1c1` | 0 | 2 |
| `le2i_train_Fall_home_v20c1` | 0 | 2 |
| `le2i_train_Fall_home_v22c1` | 0 | 2 |
| `le2i_train_Fall_home_v24c1` | 0 | 2 |
| `le2i_train_Fall_home_v27c1` | 0 | 2 |
| `le2i_train_Fall_home_v28c1` | 0 | 2 |
| `le2i_train_Fall_home_v29c1` | 0 | 2 |
| `le2i_train_Fall_home_v32c1` | 0 | 2 |
| `le2i_train_Fall_home_v4c1` | 0 | 2 |
| `le2i_train_Fall_home_v6c1` | 0 | 2 |
| `le2i_train_Fall_home_v8c1` | 0 | 1 |
| `le2i_train_Lie_coffee_v10c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v10c4` | 2 | 0 |
| `le2i_train_Lie_coffee_v10c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v10c6` | 2 | 0 |
| `le2i_train_Lie_coffee_v10c7` | 2 | 0 |
| `le2i_train_Lie_coffee_v10c8` | 2 | 0 |
| `le2i_train_Lie_coffee_v10c9` | 2 | 0 |
| `le2i_train_Lie_coffee_v11c4` | 2 | 0 |
| `le2i_train_Lie_coffee_v11c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v11c6` | 2 | 0 |
| `le2i_train_Lie_coffee_v12c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v12c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v12c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v12c6` | 2 | 0 |
| `le2i_train_Lie_coffee_v13c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v13c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v13c6` | 2 | 0 |
| `le2i_train_Lie_coffee_v13c7` | 2 | 0 |
| `le2i_train_Lie_coffee_v13c8` | 1 | 0 |
| `le2i_train_Lie_coffee_v13c9` | 2 | 0 |
| `le2i_train_Lie_coffee_v15c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v15c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v15c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v16c9` | 2 | 0 |
| `le2i_train_Lie_coffee_v17c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v17c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v17c4` | 2 | 0 |
| `le2i_train_Lie_coffee_v17c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v17c6` | 2 | 0 |
| `le2i_train_Lie_coffee_v17c7` | 2 | 0 |
| `le2i_train_Lie_coffee_v18c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v18c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v18c4` | 2 | 0 |
| `le2i_train_Lie_coffee_v18c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v18c6` | 2 | 0 |
| `le2i_train_Lie_coffee_v18c7` | 2 | 0 |
| `le2i_train_Lie_coffee_v19c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v19c4` | 2 | 0 |
| `le2i_train_Lie_coffee_v19c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v19c6` | 2 | 0 |
| `le2i_train_Lie_coffee_v1c1` | 2 | 0 |
| `le2i_train_Lie_coffee_v1c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v1c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v1c4` | 2 | 0 |
| `le2i_train_Lie_coffee_v1c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v1c6` | 2 | 0 |
| `le2i_train_Lie_coffee_v20c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v20c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v20c4` | 2 | 0 |
| `le2i_train_Lie_coffee_v20c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v20c6` | 2 | 0 |
| `le2i_train_Lie_coffee_v21c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v21c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v21c4` | 2 | 0 |
| `le2i_train_Lie_coffee_v21c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v21c6` | 2 | 0 |
| `le2i_train_Lie_coffee_v22c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v22c4` | 2 | 0 |
| `le2i_train_Lie_coffee_v22c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v22c6` | 2 | 0 |
| `le2i_train_Lie_coffee_v22c7` | 2 | 0 |
| `le2i_train_Lie_coffee_v23c1` | 2 | 0 |
| `le2i_train_Lie_coffee_v23c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v23c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v23c4` | 2 | 0 |
| `le2i_train_Lie_coffee_v23c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v24c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v24c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v25c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v25c4` | 2 | 0 |
| `le2i_train_Lie_coffee_v25c6` | 2 | 0 |
| `le2i_train_Lie_coffee_v25c7` | 2 | 0 |
| `le2i_train_Lie_coffee_v26c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v26c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v26c4` | 2 | 0 |
| `le2i_train_Lie_coffee_v26c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v27c1` | 2 | 0 |
| `le2i_train_Lie_coffee_v27c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v27c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v27c4` | 2 | 0 |
| `le2i_train_Lie_coffee_v28c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v28c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v28c4` | 2 | 0 |
| `le2i_train_Lie_coffee_v28c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v28c6` | 2 | 0 |
| `le2i_train_Lie_coffee_v28c7` | 2 | 0 |
| `le2i_train_Lie_coffee_v2c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v2c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v2c4` | 2 | 0 |
| `le2i_train_Lie_coffee_v2c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v2c6` | 2 | 0 |
| `le2i_train_Lie_coffee_v30c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v30c3` | 1 | 0 |
| `le2i_train_Lie_coffee_v30c4` | 2 | 0 |
| `le2i_train_Lie_coffee_v3c1` | 2 | 0 |
| `le2i_train_Lie_coffee_v3c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v3c4` | 2 | 0 |
| `le2i_train_Lie_coffee_v3c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v4c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v4c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v4c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v50c1` | 2 | 0 |
| `le2i_train_Lie_coffee_v58c1` | 2 | 0 |
| `le2i_train_Lie_coffee_v5c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v5c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v6c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v6c4` | 2 | 0 |
| `le2i_train_Lie_coffee_v6c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v7c1` | 2 | 0 |
| `le2i_train_Lie_coffee_v7c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v7c4` | 2 | 0 |
| `le2i_train_Lie_coffee_v8c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v8c4` | 1 | 0 |
| `le2i_train_Lie_coffee_v8c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v8c6` | 2 | 0 |
| `le2i_train_Lie_coffee_v9c2` | 2 | 0 |
| `le2i_train_Lie_coffee_v9c3` | 2 | 0 |
| `le2i_train_Lie_coffee_v9c5` | 2 | 0 |
| `le2i_train_Lie_coffee_v9c6` | 2 | 0 |
| `le2i_train_Lie_coffee_v9c7` | 2 | 0 |
| `le2i_train_Lie_home_v19c2` | 2 | 0 |
| `le2i_train_Lie_home_v19c3` | 2 | 0 |
| `le2i_train_Lie_home_v19c4` | 2 | 0 |
| `le2i_train_Likefall_coffee_v11c23` | 2 | 0 |
| `le2i_train_Likefall_coffee_v11c24` | 2 | 0 |
| `le2i_train_Likefall_coffee_v11c7` | 2 | 0 |
| `le2i_train_Likefall_coffee_v13c10` | 2 | 0 |
| `le2i_train_Likefall_coffee_v16c9` | 2 | 0 |
| `le2i_train_Likefall_coffee_v1c7` | 2 | 0 |
| `le2i_train_Likefall_coffee_v21c6` | 2 | 0 |
| `le2i_train_Likefall_coffee_v21c8` | 2 | 0 |
| `le2i_train_Likefall_coffee_v23c6` | 2 | 0 |
| `le2i_train_Likefall_coffee_v24c4` | 2 | 0 |
| `le2i_train_Likefall_coffee_v25c13` | 2 | 0 |
| `le2i_train_Likefall_coffee_v25c14` | 2 | 0 |
| `le2i_train_Likefall_coffee_v25c15` | 2 | 0 |
| `le2i_train_Likefall_coffee_v25c7` | 2 | 0 |
| `le2i_train_Likefall_coffee_v27c6` | 2 | 0 |
| `le2i_train_Likefall_coffee_v28c10` | 2 | 0 |
| `le2i_train_Likefall_coffee_v28c7` | 2 | 0 |
| `le2i_train_Likefall_coffee_v28c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v10c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v10c12` | 2 | 0 |
| `le2i_train_Stand_coffee_v10c13` | 1 | 0 |
| `le2i_train_Stand_coffee_v10c14` | 2 | 0 |
| `le2i_train_Stand_coffee_v10c15` | 2 | 0 |
| `le2i_train_Stand_coffee_v10c16` | 2 | 0 |
| `le2i_train_Stand_coffee_v10c17` | 2 | 0 |
| `le2i_train_Stand_coffee_v10c19` | 2 | 0 |
| `le2i_train_Stand_coffee_v10c20` | 2 | 0 |
| `le2i_train_Stand_coffee_v10c21` | 2 | 0 |
| `le2i_train_Stand_coffee_v11c10` | 2 | 0 |
| `le2i_train_Stand_coffee_v11c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v11c12` | 2 | 0 |
| `le2i_train_Stand_coffee_v11c13` | 2 | 0 |
| `le2i_train_Stand_coffee_v11c14` | 2 | 0 |
| `le2i_train_Stand_coffee_v11c15` | 2 | 0 |
| `le2i_train_Stand_coffee_v11c16` | 2 | 0 |
| `le2i_train_Stand_coffee_v11c17` | 2 | 0 |
| `le2i_train_Stand_coffee_v11c18` | 2 | 0 |
| `le2i_train_Stand_coffee_v11c19` | 2 | 0 |
| `le2i_train_Stand_coffee_v11c20` | 2 | 0 |
| `le2i_train_Stand_coffee_v11c21` | 2 | 0 |
| `le2i_train_Stand_coffee_v11c25` | 2 | 0 |
| `le2i_train_Stand_coffee_v11c26` | 2 | 0 |
| `le2i_train_Stand_coffee_v11c27` | 2 | 0 |
| `le2i_train_Stand_coffee_v11c28` | 1 | 0 |
| `le2i_train_Stand_coffee_v11c8` | 2 | 0 |
| `le2i_train_Stand_coffee_v11c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v12c10` | 2 | 0 |
| `le2i_train_Stand_coffee_v12c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v13c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v13c12` | 2 | 0 |
| `le2i_train_Stand_coffee_v13c14` | 2 | 0 |
| `le2i_train_Stand_coffee_v13c15` | 2 | 0 |
| `le2i_train_Stand_coffee_v14c10` | 2 | 0 |
| `le2i_train_Stand_coffee_v14c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v14c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v15c6` | 2 | 0 |
| `le2i_train_Stand_coffee_v15c7` | 2 | 0 |
| `le2i_train_Stand_coffee_v16c10` | 2 | 0 |
| `le2i_train_Stand_coffee_v17c8` | 2 | 0 |
| `le2i_train_Stand_coffee_v18c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v18c12` | 2 | 0 |
| `le2i_train_Stand_coffee_v18c13` | 2 | 0 |
| `le2i_train_Stand_coffee_v18c15` | 2 | 0 |
| `le2i_train_Stand_coffee_v18c16` | 2 | 0 |
| `le2i_train_Stand_coffee_v18c8` | 2 | 0 |
| `le2i_train_Stand_coffee_v18c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v19c10` | 2 | 0 |
| `le2i_train_Stand_coffee_v19c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v19c12` | 2 | 0 |
| `le2i_train_Stand_coffee_v19c8` | 2 | 0 |
| `le2i_train_Stand_coffee_v19c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v1c8` | 1 | 0 |
| `le2i_train_Stand_coffee_v20c10` | 2 | 0 |
| `le2i_train_Stand_coffee_v20c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v20c12` | 2 | 0 |
| `le2i_train_Stand_coffee_v20c13` | 2 | 0 |
| `le2i_train_Stand_coffee_v20c14` | 2 | 0 |
| `le2i_train_Stand_coffee_v20c16` | 2 | 0 |
| `le2i_train_Stand_coffee_v20c17` | 2 | 0 |
| `le2i_train_Stand_coffee_v20c18` | 2 | 0 |
| `le2i_train_Stand_coffee_v20c19` | 2 | 0 |
| `le2i_train_Stand_coffee_v20c20` | 2 | 0 |
| `le2i_train_Stand_coffee_v20c21` | 2 | 0 |
| `le2i_train_Stand_coffee_v20c22` | 2 | 0 |
| `le2i_train_Stand_coffee_v20c23` | 2 | 0 |
| `le2i_train_Stand_coffee_v20c24` | 2 | 0 |
| `le2i_train_Stand_coffee_v20c25` | 2 | 0 |
| `le2i_train_Stand_coffee_v20c26` | 2 | 0 |
| `le2i_train_Stand_coffee_v20c7` | 2 | 0 |
| `le2i_train_Stand_coffee_v20c8` | 2 | 0 |
| `le2i_train_Stand_coffee_v20c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v21c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v22c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v22c12` | 2 | 0 |
| `le2i_train_Stand_coffee_v22c13` | 2 | 0 |
| `le2i_train_Stand_coffee_v22c14` | 2 | 0 |
| `le2i_train_Stand_coffee_v22c8` | 2 | 0 |
| `le2i_train_Stand_coffee_v22c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v23c10` | 2 | 0 |
| `le2i_train_Stand_coffee_v23c12` | 2 | 0 |
| `le2i_train_Stand_coffee_v23c13` | 2 | 0 |
| `le2i_train_Stand_coffee_v23c14` | 2 | 0 |
| `le2i_train_Stand_coffee_v23c15` | 2 | 0 |
| `le2i_train_Stand_coffee_v23c16` | 2 | 0 |
| `le2i_train_Stand_coffee_v23c17` | 2 | 0 |
| `le2i_train_Stand_coffee_v23c18` | 2 | 0 |
| `le2i_train_Stand_coffee_v23c7` | 2 | 0 |
| `le2i_train_Stand_coffee_v23c8` | 2 | 0 |
| `le2i_train_Stand_coffee_v23c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v24c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v24c12` | 2 | 0 |
| `le2i_train_Stand_coffee_v24c13` | 2 | 0 |
| `le2i_train_Stand_coffee_v24c14` | 2 | 0 |
| `le2i_train_Stand_coffee_v24c15` | 2 | 0 |
| `le2i_train_Stand_coffee_v24c16` | 2 | 0 |
| `le2i_train_Stand_coffee_v24c5` | 2 | 0 |
| `le2i_train_Stand_coffee_v24c6` | 2 | 0 |
| `le2i_train_Stand_coffee_v24c7` | 2 | 0 |
| `le2i_train_Stand_coffee_v24c8` | 2 | 0 |
| `le2i_train_Stand_coffee_v24c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v25c10` | 2 | 0 |
| `le2i_train_Stand_coffee_v25c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v25c8` | 2 | 0 |
| `le2i_train_Stand_coffee_v25c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v26c10` | 2 | 0 |
| `le2i_train_Stand_coffee_v26c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v26c12` | 2 | 0 |
| `le2i_train_Stand_coffee_v26c13` | 2 | 0 |
| `le2i_train_Stand_coffee_v26c14` | 2 | 0 |
| `le2i_train_Stand_coffee_v26c15` | 2 | 0 |
| `le2i_train_Stand_coffee_v26c16` | 2 | 0 |
| `le2i_train_Stand_coffee_v26c17` | 2 | 0 |
| `le2i_train_Stand_coffee_v26c6` | 2 | 0 |
| `le2i_train_Stand_coffee_v26c8` | 2 | 0 |
| `le2i_train_Stand_coffee_v26c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v27c10` | 2 | 0 |
| `le2i_train_Stand_coffee_v27c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v27c12` | 2 | 0 |
| `le2i_train_Stand_coffee_v27c13` | 2 | 0 |
| `le2i_train_Stand_coffee_v27c14` | 2 | 0 |
| `le2i_train_Stand_coffee_v27c7` | 2 | 0 |
| `le2i_train_Stand_coffee_v27c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v29c10` | 2 | 0 |
| `le2i_train_Stand_coffee_v29c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v29c12` | 2 | 0 |
| `le2i_train_Stand_coffee_v29c13` | 2 | 0 |
| `le2i_train_Stand_coffee_v29c14` | 2 | 0 |
| `le2i_train_Stand_coffee_v29c15` | 2 | 0 |
| `le2i_train_Stand_coffee_v29c16` | 2 | 0 |
| `le2i_train_Stand_coffee_v29c17` | 2 | 0 |
| `le2i_train_Stand_coffee_v29c18` | 2 | 0 |
| `le2i_train_Stand_coffee_v29c19` | 2 | 0 |
| `le2i_train_Stand_coffee_v29c20` | 2 | 0 |
| `le2i_train_Stand_coffee_v29c3` | 2 | 0 |
| `le2i_train_Stand_coffee_v29c4` | 2 | 0 |
| `le2i_train_Stand_coffee_v29c5` | 2 | 0 |
| `le2i_train_Stand_coffee_v29c6` | 2 | 0 |
| `le2i_train_Stand_coffee_v29c7` | 2 | 0 |
| `le2i_train_Stand_coffee_v29c8` | 2 | 0 |
| `le2i_train_Stand_coffee_v29c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v2c10` | 2 | 0 |
| `le2i_train_Stand_coffee_v2c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v2c12` | 2 | 0 |
| `le2i_train_Stand_coffee_v2c13` | 2 | 0 |
| `le2i_train_Stand_coffee_v2c14` | 2 | 0 |
| `le2i_train_Stand_coffee_v2c15` | 2 | 0 |
| `le2i_train_Stand_coffee_v2c16` | 2 | 0 |
| `le2i_train_Stand_coffee_v2c17` | 2 | 0 |
| `le2i_train_Stand_coffee_v2c18` | 2 | 0 |
| `le2i_train_Stand_coffee_v2c19` | 1 | 0 |
| `le2i_train_Stand_coffee_v2c8` | 2 | 0 |
| `le2i_train_Stand_coffee_v2c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v30c5` | 2 | 0 |
| `le2i_train_Stand_coffee_v30c6` | 2 | 0 |
| `le2i_train_Stand_coffee_v30c7` | 2 | 0 |
| `le2i_train_Stand_coffee_v30c8` | 2 | 0 |
| `le2i_train_Stand_coffee_v3c10` | 2 | 0 |
| `le2i_train_Stand_coffee_v3c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v3c12` | 2 | 0 |
| `le2i_train_Stand_coffee_v3c13` | 2 | 0 |
| `le2i_train_Stand_coffee_v3c14` | 2 | 0 |
| `le2i_train_Stand_coffee_v3c15` | 2 | 0 |
| `le2i_train_Stand_coffee_v3c16` | 2 | 0 |
| `le2i_train_Stand_coffee_v3c6` | 2 | 0 |
| `le2i_train_Stand_coffee_v3c7` | 2 | 0 |
| `le2i_train_Stand_coffee_v3c8` | 2 | 0 |
| `le2i_train_Stand_coffee_v3c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v4c10` | 2 | 0 |
| `le2i_train_Stand_coffee_v4c6` | 2 | 0 |
| `le2i_train_Stand_coffee_v4c7` | 2 | 0 |
| `le2i_train_Stand_coffee_v4c8` | 2 | 0 |
| `le2i_train_Stand_coffee_v4c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v52c1` | 2 | 0 |
| `le2i_train_Stand_coffee_v5c10` | 2 | 0 |
| `le2i_train_Stand_coffee_v5c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v5c4` | 2 | 0 |
| `le2i_train_Stand_coffee_v5c5` | 2 | 0 |
| `le2i_train_Stand_coffee_v5c6` | 2 | 0 |
| `le2i_train_Stand_coffee_v5c7` | 2 | 0 |
| `le2i_train_Stand_coffee_v5c8` | 2 | 0 |
| `le2i_train_Stand_coffee_v5c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v6c10` | 2 | 0 |
| `le2i_train_Stand_coffee_v6c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v6c12` | 2 | 0 |
| `le2i_train_Stand_coffee_v6c13` | 2 | 0 |
| `le2i_train_Stand_coffee_v6c14` | 2 | 0 |
| `le2i_train_Stand_coffee_v6c7` | 2 | 0 |
| `le2i_train_Stand_coffee_v6c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v7c10` | 2 | 0 |
| `le2i_train_Stand_coffee_v7c5` | 2 | 0 |
| `le2i_train_Stand_coffee_v7c6` | 2 | 0 |
| `le2i_train_Stand_coffee_v7c7` | 2 | 0 |
| `le2i_train_Stand_coffee_v7c8` | 2 | 0 |
| `le2i_train_Stand_coffee_v7c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v8c10` | 2 | 0 |
| `le2i_train_Stand_coffee_v8c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v8c12` | 1 | 0 |
| `le2i_train_Stand_coffee_v8c13` | 2 | 0 |
| `le2i_train_Stand_coffee_v8c14` | 2 | 0 |
| `le2i_train_Stand_coffee_v8c15` | 2 | 0 |
| `le2i_train_Stand_coffee_v8c16` | 2 | 0 |
| `le2i_train_Stand_coffee_v8c8` | 2 | 0 |
| `le2i_train_Stand_coffee_v8c9` | 2 | 0 |
| `le2i_train_Stand_coffee_v9c10` | 2 | 0 |
| `le2i_train_Stand_coffee_v9c11` | 2 | 0 |
| `le2i_train_Stand_coffee_v9c12` | 2 | 0 |
| `le2i_train_Stand_coffee_v9c8` | 2 | 0 |
| `le2i_train_Stand_coffee_v9c9` | 2 | 0 |
| `le2i_train_Stand_home_v28c5` | 2 | 0 |
| `local_gmdcsa24_s1_adl_bed_to_sleep_original.mp4` | 231 | 0 |
| `local_gmdcsa24_s1_fall_chair_partial_original.mp4` | 92 | 24 |
| `local_gmdcsa24_s4_fall_low_light_original.mp4` | 126 | 27 |

### val groups (97)

| Video/group ID | Class 0 windows | Class 1 windows |
|---|---:|---:|
| `gmdcsa_Subject4_ADL_01.mp4` | 356 | 0 |
| `gmdcsa_Subject4_ADL_02.mp4` | 301 | 0 |
| `gmdcsa_Subject4_ADL_03.mp4` | 253 | 0 |
| `gmdcsa_Subject4_ADL_04.mp4` | 374 | 0 |
| `gmdcsa_Subject4_ADL_05.mp4` | 190 | 0 |
| `gmdcsa_Subject4_ADL_06.mp4` | 182 | 0 |
| `gmdcsa_Subject4_ADL_07.mp4` | 135 | 0 |
| `gmdcsa_Subject4_ADL_08.mp4` | 352 | 0 |
| `gmdcsa_Subject4_ADL_09.mp4` | 348 | 0 |
| `gmdcsa_Subject4_ADL_10.mp4` | 297 | 0 |
| `gmdcsa_Subject4_ADL_11.mp4` | 306 | 0 |
| `gmdcsa_Subject4_ADL_12.mp4` | 243 | 0 |
| `gmdcsa_Subject4_ADL_13.mp4` | 150 | 0 |
| `gmdcsa_Subject4_ADL_14.mp4` | 234 | 0 |
| `gmdcsa_Subject4_ADL_15.mp4` | 145 | 0 |
| `gmdcsa_Subject4_ADL_16.mp4` | 199 | 0 |
| `gmdcsa_Subject4_ADL_17.mp4` | 154 | 0 |
| `gmdcsa_Subject4_ADL_18.mp4` | 407 | 0 |
| `gmdcsa_Subject4_ADL_19.mp4` | 280 | 0 |
| `gmdcsa_Subject4_ADL_20.mp4` | 509 | 0 |
| `gmdcsa_Subject4_Fall_01.mp4` | 99 | 26 |
| `gmdcsa_Subject4_Fall_02.mp4` | 38 | 37 |
| `gmdcsa_Subject4_Fall_03.mp4` | 118 | 0 |
| `gmdcsa_Subject4_Fall_04.mp4` | 47 | 51 |
| `gmdcsa_Subject4_Fall_05.mp4` | 169 | 38 |
| `gmdcsa_Subject4_Fall_06.mp4` | 103 | 66 |
| `gmdcsa_Subject4_Fall_07.mp4` | 42 | 132 |
| `gmdcsa_Subject4_Fall_08.mp4` | 74 | 99 |
| `gmdcsa_Subject4_Fall_09.mp4` | 138 | 29 |
| `gmdcsa_Subject4_Fall_10.mp4` | 55 | 25 |
| `gmdcsa_Subject4_Fall_11.mp4` | 81 | 40 |
| `gmdcsa_Subject4_Fall_12.mp4` | 53 | 0 |
| `gmdcsa_Subject4_Fall_13.mp4` | 62 | 73 |
| `gmdcsa_Subject4_Fall_14.mp4` | 42 | 51 |
| `gmdcsa_Subject4_Fall_15.mp4` | 116 | 15 |
| `gmdcsa_Subject4_Fall_16.mp4` | 24 | 97 |
| `gmdcsa_Subject4_Fall_17.mp4` | 170 | 23 |
| `le2i_val_Fall_coffee_v12c1` | 0 | 2 |
| `le2i_val_Fall_coffee_v15c1` | 0 | 2 |
| `le2i_val_Fall_coffee_v16c1` | 0 | 2 |
| `le2i_val_Fall_coffee_v17c1` | 0 | 2 |
| `le2i_val_Fall_coffee_v18c1` | 0 | 2 |
| `le2i_val_Fall_coffee_v20c2` | 0 | 2 |
| `le2i_val_Fall_coffee_v22c1` | 0 | 2 |
| `le2i_val_Fall_coffee_v23c2` | 0 | 2 |
| `le2i_val_Fall_coffee_v31c1` | 0 | 2 |
| `le2i_val_Fall_coffee_v36c1` | 0 | 2 |
| `le2i_val_Fall_coffee_v43c1` | 0 | 2 |
| `le2i_val_Fall_coffee_v46c1` | 0 | 2 |
| `le2i_val_Fall_coffee_v49c1` | 0 | 2 |
| `le2i_val_Fall_coffee_v54c1` | 0 | 2 |
| `le2i_val_Fall_coffee_v64c1` | 0 | 2 |
| `le2i_val_Fall_coffee_v7c1` | 0 | 2 |
| `le2i_val_Fall_home_v11c1` | 0 | 2 |
| `le2i_val_Fall_home_v21c1` | 0 | 2 |
| `le2i_val_Fall_home_v25c1` | 0 | 2 |
| `le2i_val_Fall_home_v26c1` | 0 | 2 |
| `le2i_val_Fall_home_v30c1` | 0 | 2 |
| `le2i_val_Fall_home_v31c1` | 0 | 2 |
| `le2i_val_Fall_home_v37c1` | 0 | 1 |
| `le2i_val_Fall_home_v7c1` | 0 | 2 |
| `le2i_val_Fall_home_v9c1` | 0 | 2 |
| `le2i_val_Lie_coffee_v10c3` | 2 | 0 |
| `le2i_val_Lie_coffee_v11c3` | 2 | 0 |
| `le2i_val_Lie_coffee_v11c7` | 2 | 0 |
| `le2i_val_Lie_coffee_v12c4` | 2 | 0 |
| `le2i_val_Lie_coffee_v12c7` | 2 | 0 |
| `le2i_val_Lie_coffee_v13c2` | 2 | 0 |
| `le2i_val_Lie_coffee_v13c4` | 2 | 0 |
| `le2i_val_Lie_coffee_v15c4` | 1 | 0 |
| `le2i_val_Lie_coffee_v19c7` | 2 | 0 |
| `le2i_val_Lie_coffee_v25c5` | 2 | 0 |
| `le2i_val_Lie_coffee_v40c1` | 2 | 0 |
| `le2i_val_Lie_coffee_v4c4` | 2 | 0 |
| `le2i_val_Lie_coffee_v6c3` | 2 | 0 |
| `le2i_val_Lie_coffee_v7c3` | 2 | 0 |
| `le2i_val_Lie_coffee_v9c4` | 2 | 0 |
| `le2i_val_Likefall_coffee_v10c10` | 2 | 0 |
| `le2i_val_Likefall_coffee_v11c22` | 2 | 0 |
| `le2i_val_Likefall_coffee_v19c7` | 2 | 0 |
| `le2i_val_Likefall_coffee_v21c7` | 2 | 0 |
| `le2i_val_Likefall_coffee_v25c12` | 2 | 0 |
| `le2i_val_Likefall_coffee_v27c5` | 2 | 0 |
| `le2i_val_Stand_coffee_v10c18` | 2 | 0 |
| `le2i_val_Stand_coffee_v12c9` | 2 | 0 |
| `le2i_val_Stand_coffee_v13c13` | 2 | 0 |
| `le2i_val_Stand_coffee_v18c10` | 2 | 0 |
| `le2i_val_Stand_coffee_v18c14` | 2 | 0 |
| `le2i_val_Stand_coffee_v20c15` | 2 | 0 |
| `le2i_val_Stand_coffee_v21c10` | 2 | 0 |
| `le2i_val_Stand_coffee_v23c11` | 2 | 0 |
| `le2i_val_Stand_coffee_v24c10` | 2 | 0 |
| `le2i_val_Stand_coffee_v26c7` | 2 | 0 |
| `le2i_val_Stand_coffee_v27c8` | 2 | 0 |
| `le2i_val_Stand_coffee_v30c9` | 2 | 0 |
| `le2i_val_Stand_home_v28c6` | 2 | 0 |
| `le2i_val_Stand_home_v30c7` | 2 | 0 |

## 2. Event-level test: GMDCSA Subject 4

**Summary:** FALL_IMPACT events: **10/17**; falls with any Tier 2 emergency event: **11/17** (one additional fall emitted POSE_LOST_WHILE_FALLEN without FALL_IMPACT); ADL videos with Tier 2 event: **5/20**; ADL videos with Tier 1 warning: **15/20**. These count emitted lifecycle/event tiers even if an episode later recovered/cancelled.

Times are media seconds from the start. ?First PRE_FALL? is first PRE_FALL warning; ?First FALL_IMPACT? specifically requires an event whose alert type is FALL_IMPACT. A Tier 2 POSE_LOST_WHILE_FALLEN is counted Tier 2, but is not relabeled as FALL_IMPACT.

| Video | PRE_FALL (s) | FALL_IMPACT (s) | Final state | Tier 2 fired | Tier 2 event type(s) |
|---|---:|---:|---|:---:|---|
| 01.mp4 (Fall) | 2.044 | NOT MEASURED | CONFIRMING | no | ? |
| 02.mp4 (Fall) | 2.977 | NOT MEASURED | PRE_FALL | no | ? |
| 03.mp4 (Fall) | 2.347 | 4.493 | POST_FALL_MONITOR | yes | FALL_IMPACT |
| 04.mp4 (Fall) | 1.641 | 4.186 | POST_FALL_MONITOR | yes | FALL_IMPACT |
| 05.mp4 (Fall) | 2.850 | 4.426 | POST_FALL_MONITOR | yes | FALL_IMPACT |
| 06.mp4 (Fall) | 1.407 | 3.283 | POST_FALL_MONITOR | yes | FALL_IMPACT |
| 07.mp4 (Fall) | 1.710 | 4.393 | POST_FALL_MONITOR | yes | FALL_IMPACT |
| 08.mp4 (Fall) | 2.443 | 6.191 | POST_FALL_MONITOR | yes | FALL_IMPACT |
| 09.mp4 (Fall) | 2.547 | 5.664 | POST_FALL_MONITOR | yes | FALL_IMPACT |
| 10.mp4 (Fall) | 2.010 | NOT MEASURED | CONFIRMING | no | ? |
| 11.mp4 (Fall) | 1.442 | NOT MEASURED | CONFIRMING | no | ? |
| 12.mp4 (Fall) | 1.843 | NOT MEASURED | CONFIRMING | no | ? |
| 13.mp4 (Fall) | 0.536 | 2.078 | POST_FALL_MONITOR | yes | FALL_IMPACT |
| 14.mp4 (Fall) | 1.070 | 2.575 | POST_FALL_MONITOR | yes | FALL_IMPACT |
| 15.mp4 (Fall) | 2.140 | NOT MEASURED | STAND_WALK | no | ? |
| 16.mp4 (Fall) | 2.514 | NOT MEASURED | POST_FALL_MONITOR | yes | POSE_LOST_WHILE_FALLEN |
| 17.mp4 (Fall) | 2.979 | 5.691 | POST_FALL_MONITOR | yes | FALL_IMPACT |
| 01.mp4 (ADL) | NOT MEASURED | NOT MEASURED | STAND_WALK | no | ? |
| 02.mp4 (ADL) | NOT MEASURED | NOT MEASURED | STAND_WALK | no | ? |
| 03.mp4 (ADL) | 0.603 | NOT MEASURED | STAND_WALK | no | ? |
| 04.mp4 (ADL) | 0.604 | NOT MEASURED | CONFIRMING | no | ? |
| 05.mp4 (ADL) | 2.376 | NOT MEASURED | CONFIRMING | no | ? |
| 06.mp4 (ADL) | 1.175 | 2.584 | POST_FALL_MONITOR | yes | FALL_IMPACT |
| 07.mp4 (ADL) | 0.369 | 1.910 | POST_FALL_MONITOR | yes | FALL_IMPACT |
| 08.mp4 (ADL) | NOT MEASURED | NOT MEASURED | STAND_WALK | no | ? |
| 09.mp4 (ADL) | 0.603 | NOT MEASURED | STAND_WALK | no | ? |
| 10.mp4 (ADL) | 1.776 | 6.535 | POST_FALL_MONITOR | yes | FALL_IMPACT |
| 11.mp4 (ADL) | 0.603 | NOT MEASURED | CONFIRMING | no | ? |
| 12.mp4 (ADL) | 0.603 | NOT MEASURED | STAND_WALK | no | ? |
| 13.mp4 (ADL) | NOT MEASURED | NOT MEASURED | STAND_WALK | no | ? |
| 14.mp4 (ADL) | 2.813 | NOT MEASURED | STAND_WALK | no | ? |
| 15.mp4 (ADL) | 1.006 | NOT MEASURED | STAND_WALK | no | ? |
| 16.mp4 (ADL) | 2.949 | 5.697 | POST_FALL_MONITOR | yes | FALL_IMPACT |
| 17.mp4 (ADL) | 1.205 | NOT MEASURED | STAND_WALK | no | ? |
| 18.mp4 (ADL) | NOT MEASURED | NOT MEASURED | STAND_WALK | no | ? |
| 19.mp4 (ADL) | 1.539 | 3.012 | STAND_WALK | yes | FALL_IMPACT |
| 20.mp4 (ADL) | 0.402 | NOT MEASURED | STAND_WALK | no | ? |

## 3. Timing

Full-run benchmark: `run_live.run()` wall clock including runtime setup and video decode, divided into decoded frame count. Measurements are machine/runtime-specific and include cold initialization. Per-module values below are from the full `fall-another.mp4` clip; M3 buffer update and ONNX inference are separately instrumented because the combined per-frame sample vector was not retained. M3 combined p95 is therefore **NOT MEASURED**.

| Clip (all frames) | M1 mean / p95 ms | M2 mean / p95 ms | M3 buffer mean / p95 ms | M3 ONNX mean / p95 ms | M4 mean / p95 ms | End-to-end FPS |
|---|---:|---:|---:|---:|---:|---:|
| fall-another.mp4 (246 frames) | 41.655 / 72.740 | 0.186 / 0.236 | 0.399 / 0.523 | 0.350 / 0.322 | 0.020 / 0.025 | 21.10 |
| walk1.mp4 (670 frames) | 33.118 / 105.754 | 0.180 / 0.245 | 0.352 / 0.517 | 0.257 / 0.321 | 0.019 / 0.024 | 19.15 |

The end-to-end FPS values above are wall-clock throughput, including runner setup, decoding, and inference. Event timings are from direct in-process instrumentation; preview window was disabled. Full raw benchmark rows: [`round2_benchmark_raw.json`](round2_benchmark_raw.json).

## 4. TRAINING artifacts

No saved epoch log, curve, TensorBoard data, or per-epoch training loss file was found. The trainer prints loss every five epochs when it is run, but that output was not saved. `models/m3_temporal_fall.pt` contains weights and metrics only; it does not record best epoch or final training loss.

- Epoch curves/log: **NOT MEASURED** (not saved).
- Best epoch: **NOT MEASURED**.
- Final training loss: **NOT MEASURED**.
- `models/m3_metrics.json` (full file):

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

## 5. COCO mapping check

`src/m1_perception.py` hard-codes relevant furniture IDs: `{56: "chair", 57: "couch", 59: "bed"}`. The runtime `YOLO("yolov8n.pt").names` is a dict, so the literal expression `names[56:61]` raises `TypeError` (dict does not support slicing). Explicit equivalent IDs 56 through 60 resolve to:

```text
{56: "chair", 57: "couch", 58: "potted plant", 59: "bed", 60: "dining table"}
```

Mismatch: **none for the configured IDs 56, 57, and 59**. IDs 58 and 60 are not included in the application furniture map.

## 6. M4 per-frame traces

CSV exports contain one row per decoded frame plus a header, generated by full M1?M4 processing. Columns: `time_s,state,p_fall,tilt,vy,jerk`.

- [`trace_fall-another.csv`](trace_fall-another.csv) ? 246 frames.
- [`trace_walk1.csv`](trace_walk1.csv) ? 670 frames.

## Raw records and reproducibility

- [`round2_run_live_raw.json`](round2_run_live_raw.json): all 37 Subject 4 event-run records, including event lists, states, per-video full-run FPS, module means/p95, and tier flags. No person names or alert identifiers are included.
- [`round2_benchmark_raw.json`](round2_benchmark_raw.json): full-run timing/FPS records for the two requested manual clips.
- `round2_pipeline_raw.json` is an initial harness capture retained for raw transitions; identity/alert fields are replaced with `[REDACTED]`.

## 7. Follow-up evidence artifacts

The user also requested these supporting outputs after Round 2:

- Jest: **4 suites passed, 60 tests passed**. Raw terminal output: [`jest_output.txt`](jest_output.txt).
- `evaluate_m3.py`: run completed; stdout/epoch log and full metric output: [`evaluate_m3_output.txt`](evaluate_m3_output.txt). The script overwrites model artifacts, so the existing `.pt`, `.onnx`, normalization, and metrics files were backed up and restored after the run.
- Firestore console read: one document was read from `alerts`; document ID and user/name/contact identifiers are redacted in [`firestore_redacted_output.txt`](firestore_redacted_output.txt). Read-only query.
- Detector and dashboard images: [`screenshots_round2/`](screenshots_round2/). Files include walking pose skeleton, PRE_FALL, confirmed event, bed frame, and Streamlit dashboard. The bed frame was captured with no active alert, but a Tier 1 warning appeared later in the same clip and recovered; that clip produced no Tier 2 event.
- Push notification on a locked phone: **NOT MEASURED**. An Android device was connected and the app package is installed, but the package is non-debuggable and no Expo push token could be safely verified as belonging to that device. The device was awake during inspection; no push was sent.


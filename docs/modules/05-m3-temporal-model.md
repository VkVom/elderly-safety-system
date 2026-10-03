# M3: Temporal Fall-Probability Model

## Purpose

M3 is in `src/m3_temporal_model.py`. It is the machine-learning part of the system. It reads a short sequence of M2 movement features and returns a fall probability.

## Why It Uses Time

Falls are events, not single poses. A person may be horizontal while sleeping, exercising, or picking up an object. M3 looks at how the body got there: the recent movement pattern, not just the final posture.

## Main Components

- `TemporalBufferManager`: collects valid 72-value M2 feature frames into a fixed-length time window.
- `TemporalFallModel`: the training model, built with a 1D convolution layer and GRU sequence layer.
- ONNX model: the smaller deployable file used by `run_live.py` and the dashboard through ONNX Runtime.

## Input and Output

Input: a normalised time window of 72-value features.

Output: one value between 0 and 1 after the runner applies a sigmoid function.

Interpretation:

- Near `0`: the movement looks normal.
- Near `1`: the movement pattern looks like a fall.
- The score is evidence, not an alert on its own. M4 must confirm it.

## Required Files

- `models/m3_temporal_fall.onnx`: deployed M3 model.
- `models/m3_norm.npz`: feature mean and standard deviation used before prediction.

The live runner uses the CPU version of ONNX Runtime. These generated model files are not committed to GitHub.

## Training and Export

- `extract_dataset_features.py`: builds features from prepared datasets.
- `train_m3.py`: trains the model and exports it.
- `evaluate_m3.py`: evaluates trained model quality.
- `export_onnx.py`: exports the trained PyTorch model to ONNX and checks that ONNX agrees with PyTorch.

The ONNX export deliberately uses a fixed batch size of one. Changing that setting can produce a broken model, so keep the parity check when modifying the model.

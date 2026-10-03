# M1: Person Pose and Furniture Perception

## Purpose

M1 is in `src/m1_perception.py`. It turns a camera frame into body landmarks and furniture context. It does not decide whether somebody fell.

## Tools Used

- **MediaPipe Pose Landmarker:** finds one person's 33 body landmarks.
- **YOLOv8:** finds beds, couches, and chairs only.

M1 deliberately ignores YOLO person detections. MediaPipe is the single source of truth for the human body. This avoids mixing two different person trackers.

## Input and Output

Input: one BGR camera frame from OpenCV.

Output:

- `keypoints`: 33 rows of `[x, y, z, visibility]`, or `None` when a usable person is not found.
- `furniture_boxes`: bed/couch as `rest_surface`, chair as `seat`, with screen coordinates and confidence.
- `quality_flags`: `TRACKING`, `HELD`, or `LOST`, plus visibility information.

## How It Avoids Bad Results

### Pose continuity

Sometimes the pose briefly disappears during a fast movement or floor impact. M1 can reuse the last trustworthy skeleton for a very short time. It honestly labels this as `HELD`. If the person stays missing beyond that small buffer, it reports `LOST`; it does not invent a new body position.

### Furniture memory

Furniture is normally still, so YOLO runs only every few frames for speed. M1 remembers valid furniture boxes for a short time. This helps when the person blocks a bed or chair.

Weak detections and huge unrealistic boxes are rejected before they enter memory.

### Bed and couch safety context

Beds and couches are grouped as `rest_surface`. A horizontal person on a rest surface may simply be sleeping or resting. M4 uses this information to reduce false alarms.

## Model Files

The pose model is saved as `models/pose_landmarker_lite.task`. If it is missing, M1 attempts to download it automatically. YOLO loads `yolov8n.pt` from the project root or local model cache. These large model files are ignored by Git.

## Privacy

M1 processes the frame in memory and releases its internal reference after extracting landmarks and furniture boxes. It does not save the raw video itself. The preview/dashboard may still display the current frame while the program is running.

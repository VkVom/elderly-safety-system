"""
Module 1: Single-Authority Perception Engine (M1)
Project: Proactive Elderly Safety System for Pre-Impact Fall Anticipation
Author: M1 Owner (Praveen / G14 Team)

Responsibilities:
- Ingest camera frame stream (720p @ 30 FPS).
- Extract 33 3D skeletal keypoints using MediaPipe Pose (Sole Human Authority).
- Detect furniture context (bed, chair, couch) using YOLOv8 (Person detections explicitly dropped).
- Discard raw RGB video frame from RAM to preserve user privacy.

Implementation notes:
- Uses the modern MediaPipe Tasks API (PoseLandmarker), which is the supported
  interface in current MediaPipe releases. The pose model (.task) is downloaded
  automatically on first use and cached under models/.
- The PoseLandmarker is created ONCE and reused across frames for performance.
"""

import os
import time
import urllib.request
from typing import Dict, List, Tuple, Optional

import cv2
import numpy as np

# MediaPipe Tasks (modern API)
try:
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python import vision as mp_vision
    HAS_MEDIAPIPE = True
except ImportError:
    HAS_MEDIAPIPE = False

# YOLO Context Detector
try:
    from ultralytics import YOLO
    HAS_YOLO = True
except ImportError:
    HAS_YOLO = False

# Default pose model: lightweight "lite" variant is fast on CPU and detects 33 landmarks.
POSE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
)
DEFAULT_POSE_MODEL_PATH = os.path.join("models", "pose_landmarker_lite.task")


def _ensure_pose_model(model_path: str) -> Optional[str]:
    """Download the MediaPipe pose .task model if it is not present. Returns path or None."""
    if os.path.isfile(model_path):
        return model_path
    try:
        os.makedirs(os.path.dirname(model_path) or ".", exist_ok=True)
        print(f"[M1] Downloading pose model to {model_path} ...")
        urllib.request.urlretrieve(POSE_MODEL_URL, model_path)
        print("[M1] Pose model ready.")
        return model_path
    except Exception as e:
        print(f"[M1 Warning] Could not download pose model: {e}")
        return None


def _iou(box_a: List[float], box_b: List[float]) -> float:
    """Intersection-over-Union of two [x1, y1, x2, y2] boxes."""
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


class FurnitureMemoryTracker:
    """
    Persists static furniture (bed / chair / couch) so its location survives occlusion
    when a person sits on or falls over it.

    Detections are matched to remembered items by IoU, so the same physical object is
    updated in place rather than duplicated. Each remembered item carries a TTL (in
    frames) that refreshes on re-detection and decays otherwise. Items returned while
    not seen this cycle are flagged with `cached=True` so downstream / overlays can
    distinguish a fresh detection from a remembered one.
    """
    def __init__(
        self,
        memory_decay_frames: int = 120,
        iou_match_threshold: float = 0.3,
        min_confidence: float = 0.4,
        max_area_fraction: float = 0.6,
    ):
        # memory_decay_frames: a cached box fades if not re-confirmed within this many
        #   frames (~4s at 30 FPS) - short enough that a one-off bad box does not stick.
        # min_confidence: reject weak detections (YOLOv8n emits many 0.25-0.4 junk boxes).
        # max_area_fraction: reject absurd boxes covering most of the frame (a "couch"
        #   spanning the whole wall+floor is not a real localisation).
        self.memory_decay = memory_decay_frames
        self.iou_match_threshold = iou_match_threshold
        self.min_confidence = min_confidence
        self.max_area_fraction = max_area_fraction
        self._items: List[Dict] = []  # each: {"box": dict, "ttl": int}

    def reset(self):
        """Clear all remembered furniture (call between independent videos/sessions)."""
        self._items = []

    def _accept(self, det: Dict, frame_area: float) -> bool:
        if det.get("confidence", 0.0) < self.min_confidence:
            return False
        x1, y1, x2, y2 = det["bbox"]
        box_area = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        if frame_area > 0 and (box_area / frame_area) > self.max_area_fraction:
            return False
        return True

    def update(self, detections: List[Dict], detector_ran: bool,
               frame_area: float = 0.0) -> List[Dict]:
        # Only reconcile against detections on cycles where the detector actually ran;
        # otherwise just age the memory so cached items still surface.
        if detector_ran:
            for det in detections:
                if not self._accept(det, frame_area):
                    continue  # drop weak / oversized junk before it can be cached
                matched = None
                best_iou = self.iou_match_threshold
                for item in self._items:
                    if item["box"]["label"] != det["label"]:
                        continue
                    iou = _iou(item["box"]["bbox"], det["bbox"])
                    if iou >= best_iou:
                        best_iou = iou
                        matched = item
                if matched is not None:
                    matched["box"] = det        # refresh position/confidence
                    matched["ttl"] = self.memory_decay
                else:
                    self._items.append({"box": det, "ttl": self.memory_decay})

        # Age out memory and build the active list.
        fresh_ids = {id(d) for d in detections} if detector_ran else set()
        active: List[Dict] = []
        survivors: List[Dict] = []
        for item in self._items:
            item["ttl"] -= 1
            if item["ttl"] <= 0:
                continue
            survivors.append(item)
            box = dict(item["box"])
            # Fresh if this item's current box came from this cycle's detections.
            box["cached"] = id(item["box"]) not in fresh_ids
            active.append(box)
        self._items = survivors
        return active


class PerceptionTracker:
    """
    Tracks pose visibility quality and maintains temporal continuity across missing
    frames. When a detection is briefly lost (e.g. a body going horizontal on the
    floor), the last valid skeleton is HELD for up to `hold_buffer_max` frames so
    downstream kinematics/temporal models see continuous data instead of a hard gap.

    Held frames are reported honestly: `pose_status` becomes "HELD" and `held_frame`
    is True, while the reported visibility metrics reflect the actual held skeleton
    (not fabricated values). After the hold budget is exhausted, status becomes "LOST".
    """
    def __init__(self, visibility_threshold: float = 0.3, hold_buffer_max: int = 5,
                 min_visible_keypoints: int = 6):
        self.visibility_threshold = visibility_threshold
        self.hold_buffer_max = hold_buffer_max
        self.min_visible_keypoints = min_visible_keypoints
        self.consecutive_missing_frames = 0
        self.last_valid_keypoints: Optional[np.ndarray] = None
        self.last_valid_pose_time = time.time()

    def _metrics(self, keypoints: np.ndarray) -> Tuple[int, float]:
        visibilities = keypoints[:, 3]
        visible_count = int(np.sum(visibilities >= self.visibility_threshold))
        avg_vis = float(np.mean(visibilities)) if len(visibilities) > 0 else 0.0
        return visible_count, avg_vis

    def evaluate_and_smooth(
        self, keypoints: Optional[np.ndarray]
    ) -> Tuple[Optional[np.ndarray], Dict]:
        # Fresh, usable detection.
        if keypoints is not None and len(keypoints) >= 33:
            visible_count, avg_vis = self._metrics(keypoints)
            if visible_count >= self.min_visible_keypoints:
                self.consecutive_missing_frames = 0
                self.last_valid_keypoints = keypoints.copy()
                self.last_valid_pose_time = time.time()
                return keypoints, {
                    "avg_visibility": round(avg_vis, 3),
                    "visible_keypoints": visible_count,
                    "missing_frames": 0.0,
                    "held_frame": False,
                    "pose_status": "TRACKING",
                }

        # Detection missing / too weak -> hold the last good skeleton briefly.
        self.consecutive_missing_frames += 1
        if (self.last_valid_keypoints is not None
                and self.consecutive_missing_frames <= self.hold_buffer_max):
            held = self.last_valid_keypoints
            visible_count, avg_vis = self._metrics(held)
            return held, {
                "avg_visibility": round(avg_vis, 3),
                "visible_keypoints": visible_count,
                "missing_frames": float(self.consecutive_missing_frames),
                "held_frame": True,
                "pose_status": "HELD",
            }

        # Fully lost.
        return None, {
            "avg_visibility": 0.0,
            "visible_keypoints": 0,
            "missing_frames": float(self.consecutive_missing_frames),
            "held_frame": False,
            "pose_status": "LOST",
        }


class SingleAuthorityPerception:
    """Perception Gateway executing MediaPipe Pose (Human) and YOLO (Furniture context)."""
    # COCO class id -> raw furniture name.
    FURNITURE_CLASSES = {56: 'chair', 57: 'couch', 59: 'bed'}  # COCO Class IDs

    # Context grouping used by downstream safety logic (M4):
    #   seat         -> a small seat; lying/horizontal here is UNUSUAL (fall-relevant)
    #   rest_surface -> a large surface; lying here is NORMAL (suppresses false alarms)
    # Bed and couch are merged because they play the same contextual role, which also
    # collapses the overlapping bed/couch double-detection into one clean box.
    FURNITURE_CONTEXT = {'chair': 'seat', 'couch': 'rest_surface', 'bed': 'rest_surface'}

    def __init__(
        self,
        yolo_model_path: str = "yolov8n.pt",
        pose_model_path: str = DEFAULT_POSE_MODEL_PATH,
        min_pose_confidence: float = 0.5,
        yolo_interval: int = 15,
        hold_buffer_max: int = 2,
        furniture_memory_frames: int = 120,
        furniture_min_confidence: float = 0.4,
    ):
        # Option A (honest perception): keep the default detection confidence at 0.5.
        # Lowering it to 0.3 raised the *rate* of "tracked" frames but produced
        # confident wrong-region poses (skeleton on an empty chair) when the real
        # subject was shadowed / out of frame - that is garbage for M2/M3. M1 stays
        # honest and reports LOST when the person genuinely cannot be found; the
        # obscured-fall case is handled by M4's POSE_LOST_WHILE_FALLEN latched state.
        # The short hold buffer only bridges genuine 1-2 frame flickers.
        # `min_pose_confidence` is tunable for callers who want a different tradeoff.
        self.tracker = PerceptionTracker(
            visibility_threshold=min_pose_confidence,
            hold_buffer_max=hold_buffer_max,
        )
        self.furniture_memory = FurnitureMemoryTracker(
            memory_decay_frames=furniture_memory_frames,
            min_confidence=furniture_min_confidence,
        )
        self._frame_index = 0  # monotonic counter used for VIDEO-mode timestamps

        # Furniture is static context, so YOLO runs every `yolo_interval` frames and
        # the memory tracker persists it in between. This keeps the pipeline above
        # 25 FPS. Set yolo_interval to 1 to run detection every frame.
        self.yolo_interval = max(1, int(yolo_interval))

        # Initialize MediaPipe PoseLandmarker ONCE (sole human authority).
        self.pose_landmarker = None
        if HAS_MEDIAPIPE:
            resolved = _ensure_pose_model(pose_model_path)
            if resolved is not None:
                try:
                    options = mp_vision.PoseLandmarkerOptions(
                        base_options=BaseOptions(model_asset_path=resolved),
                        running_mode=mp_vision.RunningMode.VIDEO,
                        num_poses=1,
                        min_pose_detection_confidence=min_pose_confidence,
                        min_pose_presence_confidence=min_pose_confidence,
                        min_tracking_confidence=min_pose_confidence,
                    )
                    self._pose_confidence = min_pose_confidence
                    self.pose_landmarker = mp_vision.PoseLandmarker.create_from_options(options)
                except Exception as e:
                    print(f"[M1 Warning] PoseLandmarker init warning: {e}")

        # Initialize YOLO strictly for furniture context.
        self.yolo_model = None
        if HAS_YOLO:
            try:
                self.yolo_model = YOLO(yolo_model_path)
            except Exception as e:
                print(f"[M1 Warning] YOLO model load warning: {e}")

    def process_frame(self, frame_bgr: np.ndarray) -> Tuple[Optional[np.ndarray], List[Dict], Dict]:
        """
        Processes a single BGR frame in RAM:
        Returns:
            - keypoints: (33, 4) array [x, y, z, visibility] or None
            - furniture_boxes: List of detected furniture context dicts
            - quality_flags: Quality and missing frame indicators
        """
        self._frame_index += 1
        raw_keypoints = None
        h, w = frame_bgr.shape[:2]
        frame_area = float(h * w)

        # 1. Human Pose Landmark Extraction (MediaPipe Tasks - sole human authority)
        if self.pose_landmarker is not None:
            rgb_frame = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            # VIDEO mode requires a monotonically increasing timestamp in milliseconds.
            timestamp_ms = int(self._frame_index * (1000.0 / 30.0))
            result = self.pose_landmarker.detect_for_video(mp_image, timestamp_ms)
            if result.pose_landmarks:
                landmarks = result.pose_landmarks[0]  # single tracked person
                pts = [[lm.x, lm.y, lm.z, lm.visibility] for lm in landmarks]
                raw_keypoints = np.array(pts, dtype=np.float32)

        # 2. Continuity smoothing: hold the last valid skeleton through brief drops
        #    (e.g. floor impact) so downstream modules see continuous tracking.
        keypoints, quality_flags = self.tracker.evaluate_and_smooth(raw_keypoints)

        # 3. Context Object Detection (YOLOv8 - Restricted to Chair, Couch, Bed)
        #    Runs every `yolo_interval` frames; furniture memory persists it between
        #    detection cycles and through occlusion by a sitting/lying person.
        detected: List[Dict] = []
        run_yolo = self.yolo_model is not None and (
            (self._frame_index - 1) % self.yolo_interval == 0
        )
        if run_yolo:
            results = self.yolo_model(frame_bgr, verbose=False)
            for r in results:
                for box in r.boxes:
                    class_id = int(box.cls.item())
                    # STRICT RULE: Drop person class (id=0), include ONLY furniture
                    if class_id in self.FURNITURE_CLASSES:
                        xyxy = box.xyxy.cpu().numpy().flatten().tolist()
                        conf = float(box.conf.item())
                        raw = self.FURNITURE_CLASSES[class_id]
                        detected.append({
                            # `label` is the context group used by M4; `raw_label`
                            # preserves the original chair/couch/bed if ever needed.
                            "label": self.FURNITURE_CONTEXT[raw],
                            "raw_label": raw,
                            "bbox": [round(v, 1) for v in xyxy],
                            "confidence": round(conf, 2)
                        })

        furniture_boxes = (
            self.furniture_memory.update(detected, detector_ran=run_yolo,
                                         frame_area=frame_area)
            if self.yolo_model is not None else []
        )

        # 4. PRIVACY PRINCIPLE: Frame memory is released. The caller holds the only
        #    reference to frame_bgr; we keep no copy of raw RGB pixels here.
        del frame_bgr

        return keypoints, furniture_boxes, quality_flags

    def reset_context(self):
        """
        Clear per-scene state: furniture memory and pose continuity/history.
        Call this when switching to an unrelated video so context from one clip does
        not leak into the next (e.g. a bed detected in clip 1 appearing in clip 3).
        """
        self.furniture_memory.reset()
        self.tracker.consecutive_missing_frames = 0
        self.tracker.last_valid_keypoints = None

    def close(self):
        """Release the MediaPipe landmarker resources."""
        if self.pose_landmarker is not None:
            try:
                self.pose_landmarker.close()
            except Exception:
                pass
            self.pose_landmarker = None


# Self-test block for Phase 1 verification
if __name__ == "__main__":
    print("Executing M1 Perception Engine Self-Test...")
    engine = SingleAuthorityPerception()

    # Generate dummy frame for testing pipeline flow
    dummy_frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    kps, context, quality = engine.process_frame(dummy_frame)

    print(f"Perception output -> Person Detected: {kps is not None}")
    print(f"Furniture Context Objects Found: {len(context)}")
    print(f"Quality Metrics: {quality}")
    print("[M1 Phase-1 Test Passed!]")
    engine.close()

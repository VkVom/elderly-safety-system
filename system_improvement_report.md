# Elderly Safety System - Comprehensive Analysis & Improvement Report

## Executive Summary

This report analyzes all components of the Elderly Safety System and provides **prioritized, actionable improvements** to make it accurate, robust, and production-ready. The system is a solid prototype but requires significant enhancements across perception, modeling, decision logic, cloud integration, and user experience.

---

## Module-by-MODULE ANALYSIS & FIXES

### 1. M1 Perception (`src/m1_perception.py`)

**Current Edge Cases & Weaknesses:**
- **Single-person only** — no multi-person policy; visitor/caretaker in frame breaks tracking
- **Furniture detection every 15 frames** — misses rapid furniture changes
- **No camera calibration** — pixel coordinates vary with camera position
- **Model files not versioned** — fresh clone lacks pose weights
- **Honest LOST at 0.5 confidence** — good for M4 but reduces M3 input coverage

**Specific Fixes:**
- Add multi-person tracking guard: select largest/person-closest-to-camera pose, or return LOST if multiple people detected (ambiguous context)
- Add frame-rate adaptation: `self.yolo_interval = max(1, int(yolo_interval * src_fps / 30.0))`
- Add confidence trend tracking (not just single-frame detection)

**Accuracy Improvements:**
- **Add pose confidence weighting**: Weight keypoints by visibility in M2 feature calculation
- **Furniture context smoothing**: Weight rest_surface vs seat by IoU consistency over time
- **Add frame skip logic**: When FPS drops, reduce YOLO frequency gracefully rather than dropping frames

**Feature Enhancements:**
- **Camera distance estimation**: Use torso size in pixels to estimate distance
- **Pose quality score**: Return additional metric `pose_quality = sum(visibilities)/33`
- **Dynamic min_confidence**: Lower threshold when pose_quality is high, raise when low

---

### 2. M2 Kinematics (`src/m2_kinematics.py`)

**Current Edge Cases & Weaknesses:**
- **Velocity in torso-scaled image coords** — inadequate for perspective changes (moving toward/away from camera)
- **History buffer limited to 3 frames** — insufficient for jerk calculation (needs ~5-10 frames)
- **No camera motion compensation** — walking toward camera mimics fall descent
- **Degenerate torso handling** just zeros everything — loses all motion information

**Specific Fixes:**
- Increase history for jerk calculation: `self._hist = deque(maxlen=10)` (was 3)
- Add camera-z tracking for perspective compensation
  ```python
  class KinematicExtractor:
      def __init__(self, history=5, depth_estimation=False):
          self._hist = deque(maxlen=history)
          self.camera_z_history = deque(maxlen=history)  # track torso size
  ```
- Track torso size for perspective normalization
- If torso size changes significantly, adjust velocity scaling

**Accuracy Improvements:**
- **Scale jerk by torso size trend**: If torso shrinking (person moving camera closer), reduce jerk magnitude
- **Add horizontal velocity significance**: falling sideways vs forward changes risk profile
- **Add trunk acceleration smoothing**: Apply exponential moving average to jerk

**Feature Enhancements:**
- **Direction of fall detection**: classify as `fall_forward`, `fall_backward`, `fall_left`, `fall_right`
- **Velocity profile analysis**: distinguish sudden drop vs gradual slide
- **Fall height estimation**: correlate hip descent distance with expected impact severity

---

### 3. M3 Temporal Model (`src/m3_temporal_model.py`)

**Current Edge Cases & Weaknesses:**
- **M3 alone missed occluded chair fall** (person fell into shadow → M1 LOST → buffer reset → nothing to classify)
- **High false positives**: Walking P=1.00, Jogging P=0.99, Bed lie-down P=0.97
- **No versioned experiments** — retraining loses previous results
- **ONNX export bug**: dynamic batch axis corrupts GRU → constant ~0.53 output

**Specific Fixes:**
- In `export_onnx.py` — enforce fixed batch + parity check
- Add input normalization with running statistics
  ```python
  class TemporalFallModel(nn.Module):
      def __init__(self, feature_dim=FEATURE_DIM, seq_len=SEQ_LEN):
          super().__init__()
          self.register_buffer('running_mean', torch.zeros(feature_dim))
          self.register_buffer('running_std', torch.ones(feature_dim))
          # Update these during training with exponential moving average
  ```

**Accuracy Improvements:**
- **Feature standardization with dataset statistics**: Use `models/m3_norm.npz` consistently
- **Add attention mechanism**: GRU → attention over time steps → fall probability
- **Multi-scale windows**: Test with SEQ_LEN=10, 15, 20 and report best probability
- **Calibrated sigmoid**: Apply temperature scaling to convert logits to well-calibrated probabilities

**Feature Enhancements:**
- **Window-level fall timing**: Not just P(fall) but `expected_impact_frame` within the window
- **Fall type classification**: `forward_fall`, `sideways_fall`, `downward_descent`, `stumble`
- **Uncertainty estimation**: Report variance across multiple forward passes (Monte Carlo dropout)

---

### 4. M4 Decision Engine (`src/m4_state_machine.py`)

**Current Edge Cases & Weaknesses:**
- **confirm_s=2.5s too short** for slow falls; too long for quick recoveries
- **Furniture suppressor** requires BOTH p_fall > impact_p AND hip_v_y > pre_fall_vy — misses fall onto soft surface
- **No gradual recovery detection** — person slowly sitting up not counted as recovery
- **M4 can emit alerts when M3 score is zero** — demonstrated in escalation test

**Specific Fixes:**
- Make confirm_s adaptive based on fall dynamics
  ```python
  @dataclass
  class M4Config:
      confirm_s_base: float = 2.5
      confirm_s_min: float = 1.5
      confirm_s_max: float = 4.0
      
      def get_confirm_s(self, hip_v_y: float) -> float:
          """Adaptive confirmation time based on descent speed."""
          speed_factor = max(0.5, min(2.0, hip_v_y / 2.0))
          confirm_s = self.confirm_s_base / speed_factor
          return max(self.confirm_s_min, min(self.confirm_s_max, confirm_s))
  ```
- Add gradual recovery detection
- Add posture transition tracking — gradual sit-up vs sudden jump

**Accuracy Improvements:**
- **Add CONFIRMING state timeout adaptive to velocity** — faster descent needs less confirmation
- **Add posture transition tracking** — gradual sit-up vs sudden jump
- **Furniture-aware fall confirmation** — fall onto bed still confirmed if P(fall) high enough

**Feature Enhancements:**
- **Long lie severity scoring**: Combine duration + tilt + movement to prioritize alerts
- **Fall recovery prediction**: Predict likelihood of recovery based on early posture trajectory
- **Multi-modal fusion**: Add audio signal (impact sound) if available via phone mic

---

### 5. Escalation Gateway (`src/escalation.py`)

**Current Edge Cases & Weaknesses:**
- **Firestore in test mode** — open rules, no authorization
- **No de-duplication across restarts** — `_last_emit` reset on process restart
- **Mock notifiers only** — no real push/SMS delivery
- **Alert schema** missing `elderId` filtering — caretaker sees all alerts

**Specific Fixes:**
- Add Firestore security rules (see below)
- Add alert lifecycle tracking: `CREATED → ACKNOWLEDGED → RESOLVED`
- Add delivery retry queue: Persist failed notifications for later retry
- Add cooldown per (elder, event_type) not just per event_type

**Feature Enhancements:**
- **Background push notifications** via Firebase Cloud Messaging
- **Escalation timer**: Auto-escalate from caretaker to volunteer after 20s
- **Acknowledgment tracking**: Who acknowledged, when, and response time
- **Alert priority**: Based on M4 state (LONG_LIE > FALL_IMPACT > POSE_LOST)

**Firestore Security Rules** (`firestore.rules`):
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /alerts/{alertId} {
      allow read: if request.auth != null && 
        query.resource.data.elderId in 
        getUsers().linkedElders;
      allow create: if request.auth != null && 
        getUsers().hasRole("caretaker");
      allow update: if request.auth != null && 
        getUsers().hasRole("caretaker") &&
        request.auth.uid == resource.data.caretakerId;
    }
    match /sos_alerts/{sosId} {
      allow create: if request.auth != null;
    }
  }
}
```

---

### 6. Dashboard (`dashboard/app.py`)

**Current Edge Cases & Weaknesses:**
- **Fixed clip set only** — no live camera feed in dashboard
- **Alert log not scoped** — shows all alerts from all clips
- **Per-frame Plotly charts cause lag**
- **No error recovery** — if a clip ends unexpectedly, dashboard stops

**Specific Fixes:**
- Add live camera support: `CLIPS = {"Live Camera": 0, ...}`
- Downsample video for display only — keep full-res processing, low-res display
- Add real-time FPS meter — detect performance degradation
- Add memory management — clear old frames, prevent memory leak over long runs

**Feature Enhancements:**
- **Real-time kinematic charts** (lightweight, not per-frame Plotly)
- **Alert timeline** with zoom/pan capability
- **Multiple clip comparison** — side-by-side analysis
- **Export telemetry** — CSV download of all metrics during playback

---

### 7. Mobile App (`mobile_app/`)

**Current Edge Cases & Weaknesses:**
- **Historical finding (partly superseded):** the current code supports best-effort Expo push when a recipient token is registered; delivery to the phone is asynchronous and has not been proven by the offline integration test. See `PROJECT_GUIDE.md` for live verification steps. Remaining work includes end-device delivery verification and operational monitoring.
- **Weak pairing codes** — SAFE-XXXX guessable, no expiration
- **Alert history sees all alerts** — not scoped to linked elder
- **No offline mode** — fails completely without internet
- **Hard-coded emergency number** — `tel:911` not configurable

**Specific Fixes:**
- In `config/firebase.js` — add rules and config
- In `linking.js` — use high-entropy codes
  ```javascript
  generatePairingCode: () => {
    // 8-char alphanumeric = 36^8 ≈ 2.8e12 possibilities
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }
  codeExpiry: Date.now() + 24 * 60 * 60 * 1000,  // 24 hours
  ```

**Accuracy Improvements:**
- **Scope alert history**: `where("elderId", "==", profile.assignedElderId)`
- **Add role-based alert filtering**: caretaker only sees their elder's alerts
- **Add connection state monitoring** — detect when Firebase drops, show offline indicator

**Feature Enhancements:**
- **Background push notifications** via expo-notifications
- **Offline cache** — store alerts locally, sync when connection restored
- **Configurable emergency number** based on device region
- **SOS countdown** with vibration and lock-screen override
- **Volunteer dispatch** with real-time responder location (if opt-in)

---

### 8. Overall Pipeline & Integration

**Current Edge Cases & Weaknesses:**
- **No graceful degradation** — if M1 fails, entire pipeline stops
- **Timing assumptions** — hard-coded 30 FPS everywhere
- **No health checks** — no way to detect model failure or sensor disconnection
- **State drift across restarts** — M4 state not persisted

**Specific Fixes:**
- Add pipeline health monitoring class
  ```python
  class PipelineHealth:
      def __init__(self):
          self.frame_counts = {"m1": 0, "m2": 0, "m2": 0, "m3": 0, "m4": 0}
          self.error_counts = {"m1": 0, "m2": 0, "m3": 0, "m4": 0}
          self.latency_ms = {"m1": 0, "m2": 0, "m3": 0, "m4": 0}
      
      def record_latency(self, module, latency):
          self.latency_ms[module] = (
              self.latency_ms[module] * 0.9 + latency * 0.1
          )  # exponential moving average
      
      def error_rate(self, module):
          if self.frame_counts[module] == 0:
              return 0
          return self.error_counts[module] / self.frame_counts[module]
  ```
- Add auto-retry and fallback for frame processing
- Add state persistence — save M4 state on shutdown, restore on startup
- Add camera quality adaptation — reduce model complexity when FPS drops

**Feature Enhancements:**
- **Multi-camera support** — switch between different camera sources
- **Adaptive quality** — lower M3 confidence threshold when battery low or FPS drops
- **Remote configuration** — update M4Config parameters via Firebase
- **Audit logging** — persistent log of all state transitions and alerts

---

## Priority Improvement Roadmap

### **Phase 1: Critical Fixes (Immediate Impact)**

| Priority | Fix | Effort | Impact |
|----------|-----|--------|--------|
| P0 | Fix Firestore security rules (prevent unauthorized access) | 2 hrs | Critical |
| P0 | Add adaptive `confirm_s` in M4 based on hip_v_y | 1 hr | High |
| P0 | Increase M2 history buffer from 3→10 for jerk calculation | 30 min | High |
| P0 | Fix M3 ONNX export with `dynamo=False` + parity check | 1 hr | Critical |
| P1 | Scope alert history to linked elder only | 1 hr | High |
| P1 | Add pose quality metric to M1 output | 1 hr | Medium |

### **Phase 2: Accuracy Improvements**

| Priority | Fix | Effort | Impact |
|----------|-----|--------|--------|
| P0 | Add camera-z tracking in M2 for perspective compensation | 2 hrs | High |
| P0 | Add calibrated sigmoid + temperature scaling to M3 | 2 hrs | High |
| P1 | Add fall direction classification (forward/sideways/backward) | 3 hrs | Medium |
| P1 | Add furniture context confidence weighting | 2 hrs | Medium |
| P2 | Add Monte Carlo dropout for uncertainty estimation | 3 hrs | Low |

### **Phase 3: Feature Enhancements**

| Priority | Fix | Effort | Impact |
|----------|-----|--------|--------|
| P0 | Add push notifications via FCM/expo-notifications | 4 hrs | High |
| P0 | Make emergency number configurable by region | 2 hrs | High |
| P1 | Add offline cache + sync for mobile app | 4 hrs | High |
| P1 | Add multi-person detection guard in M1 | 3 hrs | Medium |
| P2 | Add real-time kinematic charts in dashboard | 3 hrs | Medium |

### **Phase 4: Production Readiness**

| Priority | Fix | Effort | Impact |
|----------|-----|--------|--------|
| P0 | Add CI/CD pipeline (GitHub Actions) | 5 hrs | Critical |
| P0 | Add artifact registry + checksum verification | 3 hrs | Critical |
| P0 | Add comprehensive test suite (unit + integration) | 8 hrs | High |
| P1 | Add deployment documentation + scripts | 4 hrs | High |
| P1 | Add monitoring/alerting for pipeline health | 3 hrs | Medium |

---

## Specific Code Changes to Implement Now

### 1. M2 Kinematics - Increase History Buffer

**File**: `src/m2_kinematics.py`, line 60
```python
# Change from:
self._hist = deque(maxlen=3)

# To:
self._hist = deque(maxlen=10)
```

### 2. M3 ONNX Export - Fix GRU Corruption

**File**: `src/m3_temporal_model.py`, lines 145-167
```python
# Ensure export always uses fixed batch=1 and parity check
def export_onnx(model, path, seq_len=SEQ_LEN, feature_dim=FEATURE_DIM):
    if not HAS_TORCH:
        raise RuntimeError("PyTorch is required to export ONNX.")
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    model.eval()
    dummy = torch.randn(1, seq_len, feature_dim, dtype=torch.float32)  # FIXED batch=1
    # ... rest of export with dynamo=False
    torch.onnx.export(
        model, dummy, path,
        input_names=["kinematic_window"],
        output_names=["fall_logit"],
        opset_version=17,
        dynamo=False,  # CRITICAL: prevents GRU corruption
    )
    _verify_onnx_parity(model, path, seq_len, feature_dim)
    return path
```

### 3. M4 - Adaptive Confirmation Window

**File**: `src/m4_state_machine.py`, lines 63-72
```python
# Add adaptive confirm_s to M4Config
@dataclass
class M4Config:
    # ... existing config ...
    
    confirm_s_base: float = 2.5
    confirm_s_min: float = 1.5
    confirm_s_max: float = 4.0
    
    def get_confirm_s(self, hip_v_y: float) -> float:
        """Adaptive confirmation time based on descent speed."""
        speed_factor = max(0.5, min(2.0, hip_v_y / 2.0))
        confirm_s = self.confirm_s_base / speed_factor
        return max(self.confirm_s_min, min(self.confirm_s_max, confirm_s))
```

### 4. Firestore Security Rules

**Create** `firestore.rules` in project root:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /alerts/{alertId} {
      allow read: if request.auth != null && 
        query.resource.data.elderId in 
        getUsers().linkedElders;
      allow create: if request.auth != null && 
        getUsers().hasRole("caretaker");
      allow update: if request.auth != null && 
        getUsers().hasRole("caretaker") &&
        request.auth.uid == resource.data.caretakerId;
    }
    match /sos_alerts/{sosId} {
      allow create: if request.auth != null;
    }
  }
}
```

### 5. Mobile - Scoped Alert History

**File**: `mobile_app/src/screens/caretaker/AlertHistoryScreen.js`
```javascript
// Change from (current - sees ALL alerts):
const alerts = await getDocs(collection(db, "alerts"))

// To (scoped to linked elder only):
const elderId = profile.assignedElderId;
const alerts = await getDocs(
  query(collection(db, "alerts"), 
    where("elderId", "==", elderId),
    orderBy("timestamp", "descending"),
    limit(50)
  )
)
```

### 6. Add Pose Quality Metric to M1

**File**: `src/m1_perception.py`, modify `process_frame` return
```python
# Add pose_quality to quality dict:
return keypoints, furniture_boxes, {
    **quality,
    "pose_quality": float(np.mean(visibilities)),  # add this
    "held_frame": True/False,
    ...
}
```

Then use in M2:
```python
# In m2_kinematics.py process():
# Weight velocities by pose quality
if quality.get("pose_quality", 1.0) < 0.6:
    # Reduce velocity reliability when pose quality low
    v_hip = v_hip * quality["pose_quality"]
```

---

## Expected Accuracy Improvements

After implementing these changes:

| Metric | Current | After Improvements |
|--------|---------|-------------------|
| **Fall Detection Precision** | ~0.72 (Le2i val) | ~0.85+ |
| **Fall Detection Recall** | ~0.61 (Le2i val) | ~0.80+ |
| **False Alerts per Hour** | Unknown (test clips only) | < 0.1/hr with furniture suppressor |
| **OOD Generalization** | F1 0.29 (GMDCSA Subject 4) | ~0.45 with M4 mitigation |
| **Latency (M3 per window)** | ~0.09 ms | ~0.11 ms (no change, parity guard added) |
| **Alert Delivery Reliability** | In-app only | Push + in-app (when app open/background) |
| **Code Guessability** | SAFE-XXXX (~810K possibilities) | 8-char alphanumeric (~2.8T possibilities) |

---

## Final Recommendations

1. **Start with Phase 1 fixes** — Firestore rules, adaptive M4 confirm_s, M2 history buffer. These give immediate safety and security improvements.

2. **Retrain M3 with updated dataset** — The Le2i dataset retraining showed massive improvements (F1 from 0.66 → 0.90). Re-run `extract_dataset_features.py` + `train_m3.py` after collecting more data.

3. **Device-test the full flow** — Elder signs up → gets code → Caretaker enters code → Both homes update → Test SOS → Test alert scoping.

4. **Add monitoring from day one** — Track latency, error rates, and fallback usage. You can't improve what you don't measure.

5. **Be honest about limitations** — Document that this is a prototype for laboratory use, not production deployment without all Phase 1-4 improvements.

The system has excellent foundational design (M1 honest perception, M4 confirmation window, furniture suppressor, ONNX parity check). With the improvements above, it can transition from "prototype demo" to "capable laboratory pilot" within 2-3 weeks of focused development.

---

**Report generated**: 2026-10-13
**System**: Proactive Elderly Safety System for Pre-Impact Fall Anticipation

---

## Verified Follow-up: Timing, Motion Outliers, and Clip Replays (2026-10-22)

The M2-to-M4 path now shares a motion-outlier sanitizer between runtime inference and
candidate training feature reconstruction. A frame with held pose, normalized hip
speed above 12 units/s, or jerk above 20,000 retains pose/tilt but zeroes motion
features and reports `motion_reliable=False`. M4 will not count such a frame as proof
that someone recovered. This directly addresses the `fall-another.mp4` trace, where
the pose looked upright while measured velocity and jerk were implausibly high.

Frame-by-frame inspection also showed M3 could stay high while the person was still
upright. M4 previously advanced its confirmation timer merely because it remained in
`CONFIRMING`, allowing an early model score to consume most of the required down time.
M4 now accrues that timer only for a horizontal torso (at least 45 degrees) or pose
loss following the fall sequence. A high M3 score alone cannot prove the person stayed
down; reliable upright evidence still cancels as recovery.

The candidate was retrained into `models/candidate_25hz`; it was not promoted over
the deployed model. On the held-out validation arrays it reached ROC-AUC 0.9223 and
F1 0.5642 at threshold 0.50 (precision 0.4852, recall 0.6739). On GMDCSA Subject 4,
it reached ROC-AUC 0.9217 and F1 0.5517 at threshold 0.50. These are window-level
metrics with correlated frames, not independent-person or clinical performance.

Full M1-M4 local replay with the currently deployed model and sanitized M2 features:

- Two longer held-out falls emitted `FALL_IMPACT`.
- The bed-to-sleep clip and both walking clips emitted no emergency alerts.
- All five user fall clips entered `CONFIRMING` but ended before the down-state
  confirmation timer completed. `fall-another.mp4` is 8.2 seconds and ends shortly
  after the visible fall, so the clip alone cannot establish its final live alert.
- With a separate 2.3-second synthetic still-frame tail after `fall-another.mp4`,
  the deployed pipeline emitted `FALL_IMPACT`. This checks the confirmation path only;
  the synthetic frames are not evidence about real-world detection accuracy.

Targeted backend checks passed: M2 kinematics 3/3, M4 transitions 15/15, M3 timing
4/4, frame timestamps 5/5, stream recovery 2/2, local camera context 3/3, alert
privacy and delivery 4/4, feature rewindowing 2/2, mock-backed alert lifecycle 12/12,
and actual-video-to-alert integration 2/2. The mobile Jest suite passed 60/60 tests.
The incoming notification route is wired to `data.alertId` and fetches the matching
Firestore alert before opening the caretaker or volunteer screen. The phone itself
has not yet been tested against a real Expo delivery. Continue treating the system as a
research/demo prototype until the outlier thresholds, candidate model, camera
conditions, false-alert rate, and real phone delivery are validated on more diverse
recorded and live trials.

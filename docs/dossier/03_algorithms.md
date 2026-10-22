# 03 Algorithms

## M1
src/m1_perception.py initializes MediaPipe Tasks PoseLandmarker VIDEO mode, num_poses=1, confidence default .5. Model models/pose_landmarker_lite.task downloads if absent. YOLO root yolov8n.pt. Furniture confidence .4, max box area .6, IoU .3, TTL 120, interval 15. Bed/couch map rest_surface, chair to seat. M1 pose hold=2; tracker direct default=5.

## M2 feature layout
In src/m2_kinematics.py H is midpoint hips 23/24, S midpoint shoulders 11/12, L=norm(S-H), P_i are x/y:
- 0–65: 33 x/y points each (P_i-H)/L, interleaved.
- 66 tilt radians atan2(abs(Sx-Hx),abs(Sy-Hy)); upright 0, horizontal near pi/2.
- Motion centers H/L, S/L and COM/L preserve image origin.
- COM average indices [11,12,23,24,25,26,27,28].
- 67 hip vertical/downward velocity; 68 hip horizontal; 69 shoulder vertical; 70 COM vertical. Current normalized center minus prior divided by measured dt.
- Acceleration = norm(delta hip velocity)/dt.
- 71 jerk = abs(delta acceleration)/dt.
- Units normalized image coordinates/s, /s², /s³; positive y points down.
- Motion channels zeroed for held, nonfinite, speed >12, jerk >20000. Missing pose or torso length <1e-6 yields invalid zeros; history maxlen 3.

## M3
src/m3_temporal_model.py input (N,15,72); two Conv1d layers 64 channels, kernel 3, padding 1; two-layer GRU hidden 64, dropout .3; last step to dense 64→32, ReLU, 32→1. Sigmoid is score. TemporalBufferManager target 25Hz, length 15, max gap .5; interpolates only full bracketed grid; no padding/extrapolation. Invalid/nonfinite/out-of-order/gap resets.

## M4 thresholds
src/m4_state_machine.py defaults: pre-fall p .40; vy 1.2; tilt 35°; latch 1.5s; impact p .70; impact tilt 60°; jerk 1500; lost_recent_tilt 45° (unused); recovery tilt 30°; recovery hold 1s; long lie 180s; normal confirm 2.5s; fast confirm 1.3s; hard vy 2.0; upright tilt 35°; down tilt 45°; recovery abs vy 12; jerk 20000; warning cooldown 2s; furniture margin .2.
Pre-fall p>.40 OR vy>1.2 and tilt>35, valid and not suppressed. Impact p>.70 OR tilt>60 and jerk>1500 and vy>1.2. Bed/couch suppresses except strong score and descent. CONFIRMING accrues only pose LOST or tilt>=45°. Plausible upright (<35°, abs vy<=12, jerk<=20000) for 1s or rest surface cancels. Confirm after 1.3s when vy>2, else 2.5s. Post-fall upright <30° for 1s resets; 180s down emits long lie. Recent tilt history is not used by transitions.

~~~text
M1 pose/context -> M2 features -> M3 full window -> sigmoid score
rest = hip inside expanded bed/couch
STAND: qualifying signal -> PRE_FALL warning
PRE_FALL: recover/latch -> cancel; impact/lost pose -> CONFIRMING
CONFIRMING: accrue down evidence only; recovery/rest -> cancel
 duration met -> emergency, POST_FALL_MONITOR
post-fall: recovery -> normal; down 180s -> LONG_LIE_ALERT
~~~
## Primary code references
- M1 thresholds/classes/process: src/m1_perception.py:39–393.
- M2 constants/formulas: src/m2_kinematics.py:38–227.
- M3 architecture/window: src/m3_temporal_model.py:42–201.
- M4 constants/transition branches: src/m4_state_machine.py:56–340.

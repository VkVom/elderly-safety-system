# 02 End-to-end modules and data flow

run_live.py run() opens OpenCV VideoCapture for webcam, file, or URL. src/frame_timing.py normalizes FPS and flags elapsed-time gaps; src/stream_recovery.py reopens streams and resets M1/M2/M3. src/m1_perception.py SingleAuthorityPerception.process_frame converts BGR to RGB, calls MediaPipe VIDEO PoseLandmarker and returns pose shape (33,4), furniture boxes and quality. YOLO classes chair 56, couch 59, bed 60; class 0 person omitted; furniture interval 15 frames. src/m2_kinematics.py KinematicExtractor.process returns 72-D vector/valid/info. src/m3_temporal_model.py TemporalBufferManager resamples to 25Hz and waits for 15 samples; ONNX returns logit then sigmoid. src/m4_state_machine.py FallDecisionEngine.update decides warning/fall/long-lie. src/escalation.py AlertGateway writes local JSON and optional Firestore/Expo. Mobile listens to Firestore and writes responses.

Python is sequential; no worker queue/thread found. Dashboard is separate Streamlit process reusing M1–M4. Mobile is another process; Firestore shared state and Expo push separate transport. No phone-to-Python video transport.

FPS fallback 30, accepts metadata 1–120. Resolution/FPS cap NOT IMPLEMENTED. Pose every frame; YOLO every 15. Furniture TTL 120 frames. M1 passes hold=2; tracker default=5. M3 window 15 at 25Hz; max gap .5 sec. Stream gap max(.5,3/fps); reconnect 1,2,4... capped at 30 sec. Dashboard processes every frame but renders every N (default 2), uses clip time rather than measured capture time.

M1 deletes its local frame reference; caller retains frame for display. No detector video upload sink found. Alert records/push carry metadata, not frame bytes. test_m1_visual.py can save annotated stills. Search: rg -n "imwrite|VideoWriter|upload|requests|open\(.*wb" src dashboard run_live.py test_*.py. This is source search, not packet capture. Dashboard cannot select live camera URL; run_live supports URL/reconnect.
## Primary code references
- Capture and orchestration: run_live.py:155–338; stream timing: src/frame_timing.py:8–48; reconnect/reset: src/stream_recovery.py:8–43.
- Perception: src/m1_perception.py:232–393; pose model constants: lines 39–51.
- Feature vector: src/m2_kinematics.py:38–227.
- M3 window/model: src/m3_temporal_model.py:42–201.
- M4 decision: src/m4_state_machine.py:58–340.
- Alert gateway/sinks/push: src/escalation.py:91–184 and 221–574.
- Dashboard: dashboard/app.py:38–270; dashboard/pipeline.py:50–160.

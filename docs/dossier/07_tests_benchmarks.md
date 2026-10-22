# 07 Tests and benchmarks

Python tests: test_alert_gateway_channels.py, test_escalation.py, test_escalation_tiers.py, test_feature_rewindow.py, test_firebase_sync.py, test_frame_timestamps.py, test_local_camera_context.py, test_m1_video_runner.py, test_m1_visual.py, test_m2_kinematics.py, test_m2_pipeline.py, test_m2_visual.py, test_m3_runner.py, test_m3_time_buffer.py, test_m4_runner.py, test_m4_tiers.py, test_push_delivery_receipts.py, test_push_live.py, test_stream_recovery.py, test_tier_flow.py, test_video_to_alert.py. Mobile Jest: authFlow, emailActionLinks, alertResponses, alertPush. They cover auth, response/push, buffers, timestamps, M1/M2 visual/pipeline, M3, M4, gateway and mocked video alert. test_push_live can send actual push; not run.

npm test -- --runInBand output: 4 suites passed, 60 tests passed, 0 snapshots, 1.317 sec.
Python venv python -m pytest -q: No module named pytest. pip install pytest: no matching distribution. Fallback imported 21 root test modules and called zero-argument test_* functions:
~~~text
FILES 21 PASSED 54 FAILED 0 SKIPPED_FIXTURES 0
~~~
Not equivalent to formal pytest/plugin execution.

OpenCV clip metadata measured this session:
~~~text
fall-another.mp4 1472043 bytes 464x832 30fps 246 frames 8.2s
fall1.mp4 725086 bytes 1920x1080 30fps 56 frames 1.867s
fall2.mp4 559811 bytes 1920x1080 30fps 57 frames 1.9s
fall3.mp4 482250 bytes 1920x1080 30fps 57 frames 1.9s
fall4.mp4 1131921 bytes 1920x1080 30fps 57 frames 1.9s
gmdcsa24_s1_adl_bed_to_sleep_original.mp4 4639810 bytes 1280x720 29.612fps 245 frames 8.274s
gmdcsa24_s1_fall_chair_partial_original.mp4 3740352 bytes 1280x720 29.568fps 203 frames 6.866s
gmdcsa24_s4_fall_low_light_original.mp4 950773 bytes 640x480 29.826fps 200 frames 6.706s
walk1.mp4 34324614 bytes 2560x1440 29.97fps 670 frames 22.356s
walk2.mp4 27878438 bytes 2160x3840 23.976fps 240 frames 10.01s
~~~
Labels inferred from names only. M1+M2 all-frame runs: walk1 670/670 valid, 23.74s; fall-another 246/246, 3.78s. ONNX-only 1000 runs mean .0952ms, median .0943, p95 .1104, max .2552. No full pipeline FPS, battery, memory, push latency, false alarms/hour or uptime measured. Live Firebase/device checks not run.
## Test source references and exact commands
Python test functions are in the listed root test_*.py files. This-session fallback command imported those modules and invoked zero-argument functions named test_*; result above. Pytest unavailable result from .\venv\Scripts\python.exe -m pytest -q; install attempt .\venv\Scripts\python.exe -m pip install pytest. Mobile test script is mobile_app/package.json scripts.test; exact command/output above.
Video metadata command used OpenCV VideoCapture CAP_PROP_FPS, CAP_PROP_FRAME_COUNT, CAP_PROP_FRAME_WIDTH/HEIGHT and os.path.getsize. Benchmark command used ONNX Runtime CPUExecutionProvider and perf_counter.

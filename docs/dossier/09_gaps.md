# 09 Gaps and open questions

PARTIAL: GMDCSA Subject4 precision .1843/F1 .2871 at .50; Expo ticket not phone receipt; IP camera depends on compatible OpenCV URL/codec; dashboard fixed clips; Python/mobile alert writers separate; client timers; Python runtime/dependencies unpinned; local ignored model/data; Firebase deployment and device behavior unverified.

NOT BUILT: mobile vision/capture; hosted always-on inference; camera registry/admin; GPS; real SMS; iOS automatic call; multi-person identity; ESP32/Arduino/Raspberry Pi/wearable; detector video cloud storage; log rotation/alert TTL; sensitivity settings; camera-offline caretaker alert.

Code mismatches: M4 lost_recent_tilt defined but unused; dashboard comment describes absent probability bar; 720p/30 comments not enforced; tracker default hold 5 differs from M1 override 2; FALL_IMPACT event typically transitions to POST_FALL_MONITOR; test_push_live can send real push; test_m1_visual can save stills; emergency URI hardcoded tel:911.

## Fifteen facts report writer must get right
1. Vision runs Python-side, not in mobile app.
2. M1 detects one person.
3. M2 emits 72 features.
4. M3 window 15 samples at target 25Hz.
5. M3 waits for a full valid window.
6. M4 combines model score and hand-coded rules/context.
7. Confirmation is 2.5s normal or 1.3s hard.
8. Bed/couch suppress ordinary lying signals.
9. Long lie is 180s.
10. Tier 1 warning differs from Tier 2 and Tier 3.
11. Detector sends alert metadata, not raw video frames.
12. Expo ticket is not proof of device delivery.
13. Streamlit is local clip replay, not cloud camera service.
14. Le2i metrics exceed GMDCSA holdout metrics.
15. Metrics are window-level, not field event accuracy.

## Ten questions code cannot answer
1. Is Firebase deployment current?
2. Do target phones receive current-build pushes?
3. Which host runs vision continuously?
4. Which CCTV vendors/auth schemes are required?
5. Can camera stream reach the host?
6. What annotation protocol was used?
7. Are clips representative?
8. What false alarm/missed fall rate is acceptable?
9. What consent/retention policy applies?
10. Which emergency number is correct for deployment?

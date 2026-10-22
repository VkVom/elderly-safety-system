# 05 State logic, alerts, backend and data

| From → To | Condition | Hold |
|---|---|---|
| STAND_WALK → PRE_FALL | p>.40 OR vy>1.2 and tilt>35, valid, not suppressed, cooldown elapsed | one frame |
| PRE_FALL → CONFIRMING | impact or pose LOST | one frame |
| PRE_FALL → STAND_WALK | tilt<30 for 1s or latch expires at 1.5s | 1s/latch |
| CONFIRMING → POST_FALL_MONITOR | down evidence 1.3s hard / 2.5s normal | cumulative |
| CONFIRMING → STAND_WALK | plausible upright 1s or rest surface | 1s/immediate |
| POST_FALL_MONITOR → LONG_LIE_ALERT | down 180s | 180s |
| post-fall → STAND_WALK | upright <30° for 1s | 1s |

src/m4_state_machine.py defines state logic. lost_recent_tilt is configured but unused. Tier 0 SELF_RECOVERY_CANCELLED -> AUTO_CANCELLED; Tier 1 PRE_FALL_WARNING -> WARNING; Tier 2 FALL_IMPACT, POSE_LOST_WHILE_FALLEN, MANUAL_SOS; Tier 3 LONG_LIE_ALERT after 180s enables volunteer escalation. AlertGateway updates same episode. Standalone cooldown 5s default; live run passes 10s. Manual SOS bypasses M4. Mobile SOS countdown 5s; elder call fallback 20s; volunteer timer 45s after call; caretaker modal independent 20s; auto-answer 180000ms. Timers are client-side.

Firestore collections: users/{uid}, alerts/{alertId}, volunteer_directory/{uid}, pairingAttempts/{key}. User docs profile/pairing/push/duty; alerts resident/room/event/status/tier/probability/context/caretaker/timestamps/responses; volunteer_directory mirrors duty/token; pairingAttempts rate-limit data. Fields vary by writer; no universal schema validator.
Redacted example:
~~~json
{"alertId":"ALERT_<redacted>","elderId":"<uid>","elderName":"<name>","roomLocation":"<room>","eventType":"FALL_IMPACT","status":"CREATED","tier":2,"fallProbability":0.82,"postureState":"FALLEN","furnitureContext":"open_floor","assignedCaretakerId":"<uid>","timestamp":"<ISO>"}
~~~
Mobile Firebase Auth; role in profile. Pairing callable checks auth/caretaker role/rate limit. Firestore rules govern client; Admin SDK privileged. Functions source exists; deployment NOT VERIFIED. Expo push exists; real SMS NOT BUILT. Android custom call partial; iOS auto-call NOT BUILT.
Local logs logs/alerts.json and logs/dashboard_alerts.json. No retention/rotation or Firestore TTL. No detector video upload. Frames transient in RAM/display; alert metadata only. Visual tests can save still images.
## Primary references
- M4 transitions/config: src/m4_state_machine.py:56–340.
- Gateway/event schema/push: src/escalation.py:221–574.
- Firestore client rules: firestore.rules; function pairing: functions/index.js:180–280.
- Mobile timing/actions: mobile_app/src/screens/elder/ElderHomeScreen.js:16–180; mobile_app/src/screens/elder/SOSModal.js; mobile_app/src/services/alertResponses.js.

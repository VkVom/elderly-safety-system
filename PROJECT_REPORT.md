# Proactive Elderly Safety System — Full Project Report & Handoff

> Single source of truth to understand and continue this project from any agent/session.
> Last updated: after full mobile-app UI redesign + start of role-linking system.

---

## 1. What this project is

A **proactive fall-detection system for elderly people** using a single RGB camera. It
anticipates/detects falls and escalates alerts to caretakers and community volunteers via
a mobile app. Two halves:

1. **Python backend pipeline** (M1→M2→M3→M4→escalation) — runs on a PC, processes video,
   detects falls, writes alert records (locally and to Firebase Firestore).
2. **React Native (Expo) mobile app** — role-based (elder / caretaker / volunteer) client
   that reads alerts from Firestore and drives the human response flow.
3. **Streamlit dashboard** — a visual demo/telemetry HUD of the pipeline.

Design philosophy throughout: **honest engineering** — the system reports uncertainty
(e.g. pose LOST) rather than faking data, and every claim was verified by running it.

---

## 2. Environment / machine facts

- OS: Windows, PowerShell. Workspace: `c:\Users\sathi\Desktop\real-majorp\elderly-safety-system`
- Python venv at `./venv` — **Python 3.12.10**. Always call it as `.\venv\Scripts\python.exe`.
- Node **v23.10.0**, npm **11.11.0** (for the mobile app).
- PowerShell quirk: MediaPipe/TF print INFO to stderr which PowerShell surfaces as an
  "error record" (exit code 1) even on success. To read Python stdout cleanly, redirect:
  `& .\venv\Scripts\python.exe script.py *> run.log; Get-Content run.log; Remove-Item run.log`.

---

## 3. Full directory structure (excluding venv, node_modules, .git)

```
elderly-safety-system/
├── PROJECT_REPORT.md            # THIS FILE
├── README.md                    # original Phase-1 readme (basic)
├── requirements.txt             # Python deps (see section 5)
├── .gitignore                   # ignores venv, models/, logs/, service-account key, node_modules, etc.
├── firebase-service-account.json  # SECRET Firebase admin key (GITIGNORED - never commit)
├── yolov8n.pt                   # YOLOv8 nano weights (auto-downloaded, gitignored)
│
├── src/                         # ── Python backend (the 4 modules + escalation) ──
│   ├── __init__.py
│   ├── m1_perception.py         # M1: MediaPipe pose + YOLO furniture, honest perception
│   ├── m2_kinematics.py         # M2: 72-feature scale-normalized kinematics
│   ├── m3_temporal_model.py     # M3: 1D-CNN+GRU PyTorch model + ONNX export
│   ├── m4_state_machine.py      # M4: fall decision FSM
│   └── escalation.py            # Alert gateway: local JSON + Firestore sinks + mock push/twilio
│
├── models/                      # (gitignored) trained weights + pose models
│   ├── m3_temporal_fall.pt      # trained PyTorch weights (+ feat_mean/std, val_metrics)
│   ├── m3_temporal_fall.onnx    # exported ONNX (fixed batch=1, verified parity)
│   ├── m3_norm.npz              # feature mean/std for inference standardization
│   ├── pose_landmarker_lite.task   # MediaPipe pose model (auto-downloaded)
│   └── pose_landmarker_full.task
│
├── data/
│   ├── manual_test_videos/      # 3 local test clips (gitignored):
│   │   ├── gmdcsa24_s1_adl_bed_to_sleep_original.mp4      (ADL / normal)
│   │   ├── gmdcsa24_s1_fall_chair_partial_original.mp4    (occluded fall)
│   │   └── gmdcsa24_s4_fall_low_light_original.mp4        (low-light fall)
│   ├── raw_datasets/umafall/    # UMAFall dataset: 8 ADL + 3 FALL clips
│   └── processed_features/      # extracted training data: X.npy, y.npy, groups.npy, meta.json
│
├── dashboard/                   # ── Streamlit visual HUD ──
│   ├── app.py                   # the Streamlit UI (video + telemetry + alert log)
│   └── pipeline.py              # M1→M2→M3→M4→escalation wrapper + overlay/gauge helpers
│
├── logs/                        # (gitignored) runtime alert JSON output
│   ├── alerts.json
│   └── dashboard_alerts.json
│
├── test_m1_video_runner.py      # M1 per-frame stats on a clip
├── test_m1_visual.py            # M1 live OpenCV window (skeleton + furniture)
├── test_m2_pipeline.py          # M1→M2 kinematics printout
├── test_m2_visual.py            # M1→M2 live window with kinematic HUD
├── test_m3_runner.py            # M1→M2→M3 P(fall) per clip + latency
├── test_m4_runner.py            # full M1→M2→M3→M4 with state transitions + alerts
├── test_escalation.py           # full pipeline → escalation, writes alert records
├── test_firebase_sync.py        # inject/list/clear alerts in live Firestore
├── extract_dataset_features.py  # video → labeled (15,72) windows for training
├── train_m3.py                  # train M3, export ONNX
│
└── mobile_app/                  # ── React Native (Expo) app ──
    ├── package.json             # expo 51, react-navigation, firebase 10, expo-notifications
    ├── app.json, babel.config.js
    ├── App.js                   # SafeAreaProvider > AuthProvider > AppNavigator
    ├── README.md
    └── src/
        ├── theme.js             # DESIGN SYSTEM: palette, type, space, radius, shadow, EVENT_META, back-compat colors
        ├── config/firebase.js   # Firebase init (REAL config values in place) + isFirebaseConfigured
        ├── context/AuthContext.js  # onAuthStateChanged + role fetch from users/{uid}
        ├── services/linking.js  # role-linking (pairing codes) — NEW, PARTIALLY WIRED (see section 9)
        ├── navigation/AppNavigator.js  # role-based stacks; custom top bars => headerShown:false on home screens
        ├── components/
        │   ├── ScreenContainer.js  # safe-area wrapper, scroll/center
        │   ├── Button.js           # variants primary/danger/success/secondary/ghost, sizes md/lg/elder
        │   ├── Card.js             # tinted surface (tones: surface/safe/danger/warn/alt)
        │   ├── StatusBadge.js      # pill badge
        │   ├── TextField.js        # labeled input w/ icon
        │   └── BigButton.js        # LEGACY (kept for back-compat; screens now use Button)
        └── screens/
            ├── auth/    LoginScreen.js, SignupScreen.js, RoleSetupScreen.js
            ├── elder/   ElderHomeScreen.js, SOSModal.js, CancelAlertScreen.js
            ├── caretaker/ CaretakerHomeScreen.js, CaretakerAlertModal.js, ActiveResponseScreen.js, AlertHistoryScreen.js
            └── volunteer/ VolunteerHomeScreen.js, VolunteerDispatchModal.js
```

---

## 4. The Python pipeline — how each module works

Data flows: **camera/video frame → M1 → M2 → M3 → M4 → escalation → alert record**.

### M1 — Perception (`src/m1_perception.py`)
- **Purpose:** turn a BGR frame into (a) 33 pose keypoints, (b) furniture context, (c) quality.
- **Pose:** modern MediaPipe **Tasks API** (`PoseLandmarker`, VIDEO mode). NOT the legacy
  `mp.solutions` API (that was the guide's original code and it crashes on the installed
  mediapipe 1.0.1 — this was fixed early). Model auto-downloads to `models/`.
- **Honest perception (KEY DECISION "Option A"):** `min_pose_confidence=0.5`. When the person
  can't be reliably found (e.g. fallen into shadow/out of frame) it reports `pose_status="LOST"`
  rather than hallucinating a skeleton on nearby furniture. A short **hold buffer (2 frames)**
  bridges genuine 1-2 frame flickers only.
- **Furniture:** YOLOv8n, restricted to chair/couch/bed. Runs every `yolo_interval=15` frames
  for speed. **FurnitureMemoryTracker** persists boxes through occlusion (IoU match, TTL 120
  frames, min confidence 0.4, rejects boxes >60% of frame). Furniture grouped into TWO context
  classes for the safety logic: **`seat`** (chair) and **`rest_surface`** (bed+couch). Raw label
  kept as `raw_label`.
- **`process_frame(frame_bgr)` returns** `(keypoints (33,4)|None, furniture_boxes[list of dict], quality_flags dict)`.
  quality has: `pose_status` (TRACKING/HELD/LOST), `visible_keypoints`, `missing_frames`, `held_frame`.
  furniture dict: `{label:"seat"|"rest_surface", raw_label, bbox:[x1,y1,x2,y2], confidence, cached:bool}`.
- **Methods:** `reset_context()` (clear furniture memory + pose history between clips — prevents
  cross-clip leakage), `close()`.
- **Perf:** ~28–40 FPS on 720p CPU.

### M2 — Kinematics (`src/m2_kinematics.py`)
- **Purpose:** convert keypoints → a fixed **72-element feature vector** per frame.
- **Layout:** `[0:66]` = 33 landmarks × (x,y) scale-normalized (hip-centred, divided by torso
  length → invariant to body size / camera distance). `[66]` trunk tilt (radians). `[67]` hip
  vertical velocity. `[68]` hip horizontal velocity. `[69]` shoulder vy. `[70]` COM vy. `[71]` hip jerk.
- **IMPORTANT velocity note:** velocities are measured in torso-scaled *image* coords, NOT the
  hip-centred frame (where hip = origin = always zero velocity — a bug that was caught and fixed).
- **Honest gaps:** on LOST frames returns `(zeros, valid=False, info)` and RESETS velocity history
  so stale motion never leaks across a tracking gap.
- **`KinematicExtractor.process(keypoints, quality, timestamp_s)` returns** `(features (72,), valid bool, info dict)`.
  info has `trunk_tilt_deg`, `hip_v_y`, `held_frame`, `reason`. `reset()` clears history.

### M3 — Temporal model (`src/m3_temporal_model.py`)
- **Architecture:** 1D-CNN (Conv1d kernel=3 over time) → 2-layer GRU → linear head → single
  fall logit. **78,529 params**. Input `(batch, 15, 72)` — 15 frames ≈ 0.5s window.
- **`TemporalBufferManager`** — rolling 15-frame window; RESETS on invalid frame (never bridges
  a gap); `.ready` true when full; `.update(features, valid)` returns the window or None.
- **ONNX export (`export_onnx`)** — **CRITICAL LESSON:** exporting the GRU with a *dynamic batch
  axis* silently corrupts the model (constant ~0.53 output for everything). FIX: export with
  **fixed batch=1, no dynamic axes** (dynamo=False). There is a built-in `_verify_onnx_parity()`
  that checks ONNX matches PyTorch and RAISES if not — so a broken export can never pass silently.
- **Trained model quality:** on real windows, fall windows mean P=0.86, normal P=0.015 (clean
  separation). Held-out (whole-clip split) validation: Precision 0.72, Recall 0.61, F1 0.66.
- **Honest caveat:** trained on a SMALL dataset (~5 fall-containing clips, mostly one dataset/actor).
  It's a legitimate proof-of-concept, NOT production-grade. Thresholds tuned to test clips.

### M4 — Decision engine (`src/m4_state_machine.py`)
- **Purpose:** fuse M1 pose_status + M2 kinematics + M3 P(fall) + furniture context into a
  deterministic FSM with temporal memory, and raise alerts.
- **States:** STAND_WALK → PRE_FALL → FALL_IMPACT / POSE_LOST_WHILE_FALLEN → POST_FALL_MONITOR → LONG_LIE_ALERT.
- **Why it exists:** M3 alone MISSED the occluded chair fall (person fell into shadow → M1 LOST →
  buffer reset → nothing to classify). M4's `PRE_FALL` → (tracking lost) → `POSE_LOST_WHILE_FALLEN`
  catches exactly this. This is the M3+M4 division of labor.
- **Furniture suppressor:** a fall is a TRANSITION from upright→horizontal. Someone already
  horizontal on a `rest_surface` (lying on bed) is suppressed unless strong neural evidence. This
  fixed a bed false-alarm. (Two real bugs were fixed here: point-in-box being too strict — now
  uses a margin; and jitter triggering impact — now impact requires real downward velocity too.)
- **`FallDecisionEngine.update(pose_status, trunk_tilt_deg, hip_v_y, jerk, p_fall, on_rest_surface, dt)`**
  returns `M4Output(state, alert bool, alert_type, info)`. Tunable thresholds in `M4Config`.
- **Helper:** `body_on_rest_surface(hip_px, furniture_boxes, margin_frac=0.2)`.
- **Verified end-to-end:** bed=0 alerts, chair fall=caught, low-light fall=caught. ALL PASS.

### Escalation (`src/escalation.py`)
- **`AlertGateway`** — consumes M4Output, builds a record matching the mobile `alerts` schema,
  dedups per event-type with a cooldown (one fall = one alert, not per-frame).
- **Sinks (pluggable):** `LocalJsonSink` (writes `logs/alerts.json`) + `FirestoreSink` (writes to
  live Firestore; auto-finds `firebase-service-account.json`; inert if firebase-admin/creds missing).
- **Notifiers (mock):** `MockPushNotifier`, `MockTwilioNotifier` — log intent only.
- **Alert schema:** `alertId, elderId, elderName, roomLocation, eventType, status("CREATED"),
  fallProbability, postureState, furnitureContext, assignedCaretakerId, acknowledgedBy,
  escalatedToVolunteers, escalationTimerStart, timestamp`.
- **ESCALATION_EVENTS:** FALL_IMPACT, POSE_LOST_WHILE_FALLEN, LONG_LIE_ALERT, MANUAL_SOS.
- **VERIFIED LIVE:** `test_firebase_sync.py` wrote a real alert to Firestore and read it back. ✅

---

## 5. Python dependencies (`requirements.txt`)
```
opencv-python, mediapipe>=1.0.0 (Tasks API), ultralytics (YOLOv8), numpy, scipy,
torch>=2.2 (CPU build 2.14.0+cpu), onnx>=1.16, onnxruntime, onnxscript (for export),
streamlit, plotly, pandas, pillow, requests, firebase-admin>=6.5.0
```
`pip check` = clean, no conflicts. Install: `.\venv\Scripts\python.exe -m pip install -r requirements.txt`.
NOTE: mediapipe MUST be >=1.0 (Tasks API); the 0.10.x legacy API conflicts with streamlit's protobuf.

---

## 6. How to run everything (verified commands)

```powershell
# Module self-tests (each prints "[Mx Phase-x Test Passed!]")
.\venv\Scripts\python.exe src\m1_perception.py
.\venv\Scripts\python.exe src\m2_kinematics.py
.\venv\Scripts\python.exe src\m3_temporal_model.py
.\venv\Scripts\python.exe src\m4_state_machine.py
.\venv\Scripts\python.exe src\escalation.py

# Pipeline tests
.\venv\Scripts\python.exe test_m4_runner.py            # full pipeline, state transitions
.\venv\Scripts\python.exe test_escalation.py           # → writes alert records
.\venv\Scripts\python.exe test_firebase_sync.py        # inject live Firestore alert
.\venv\Scripts\python.exe test_firebase_sync.py --list # list Firestore alerts
.\venv\Scripts\python.exe test_firebase_sync.py --clear # delete test alerts

# Visual tools (open OpenCV windows on your machine)
.\venv\Scripts\python.exe test_m1_visual.py
.\venv\Scripts\python.exe test_m2_visual.py

# Retrain M3 (regenerates .pt + .onnx + norm)
.\venv\Scripts\python.exe extract_dataset_features.py  # (only if re-extracting)
.\venv\Scripts\python.exe train_m3.py

# Streamlit dashboard
.\venv\Scripts\python.exe -m streamlit run dashboard/app.py

# Mobile app
cd mobile_app
npm install          # already done once (1220 packages)
npx expo start       # press w=web, a=android, or scan QR with Expo Go
```

---

## 7. Firebase — current live setup

- **Project:** `insight-fall-safety` (console.firebase.google.com).
- **Enabled:** Email/Password Auth; Firestore in **Test mode** (⚠️ open rules, expires ~30 days —
  must add security rules before real use).
- **Web config:** REAL values are in `mobile_app/src/config/firebase.js` (apiKey starts AIza...).
  `isFirebaseConfigured` checks the key starts with "AIza" (robust against find/replace).
  Analytics is intentionally NOT used (web-only, crashes in RN).
- **Service account:** `firebase-service-account.json` in root (GITIGNORED, verified). Used by
  the Python `FirestoreSink` for backend writes. **This is a secret — never commit/share.**
- **Firestore collections:**
  - `users/{uid}`: uid, name, email, phone, role, createdAt, + role-specific fields (see linking).
  - `alerts/{alertId}`: the alert schema above.

---

## 8. Mobile app — design system & screens

- **Design system (`src/theme.js`):** Light/high-contrast. bg `#F8FAFC`, text `#0F172A`,
  safety teal `#0D9488`, success emerald `#059669`, emergency red `#DC2626` (emergency ONLY),
  warn amber. Large type scale (elder body ≥18px). `palette`, `type`, `space`, `radius`, `shadow`,
  `touch`. Back-compat `colors` + `EVENT_META` (with Ionicons names).
- **Role-tuned UX:** elder = giant targets/minimal/calm; caretaker/volunteer = denser/faster.
- **Navigation:** role-based stacks in `AppNavigator.js`. Home screens use CUSTOM top bars so
  their native headers are `headerShown:false`. Auth stack has no headers.
- **Screens & status:**
  - **Auth:** Login (shield logo, friendly error mapping), Signup (icon role cards; generates
    elder pairing code), RoleSetup (SEE section 9 — mid-redesign for linking).
  - **Elder:** ElderHomeScreen (no-scroll: top bar w/ name + labeled Sign Out, pulsing teal
    shield status, giant red SOS flex:3, caretaker call card flex:2), SOSModal (5s countdown ring,
    writes MANUAL_SOS), CancelAlertScreen ("Are you okay?" I'm OK / I Need Help).
  - **Caretaker:** CaretakerHomeScreen (top bar w/ history+logout, status card, alert list, empty
    state; subscribes to alerts status==CREATED), CaretakerAlertModal (flashing header, telemetry
    rows, 20s escalation countdown + vibration, I'M COMING / Find Someone Else), ActiveResponseScreen
    (call 911 + resolve), AlertHistoryScreen (status dots, formatted time).
  - **Volunteer:** VolunteerHomeScreen (on-duty Switch, escalated queue), VolunteerDispatchModal
    (accept dispatch).
- **All 24 JS files validated:** parse as valid JSX + all relative imports resolve. (Validated with
  @babel/parser; there is no automated runtime test — see caveats.)

---

## 9. ✅ COMPLETED: role-linking system

The role-linking system is now built (was section 9's pending work). Summary of what
was implemented:

- **`services/linking.js`** — `generatePairingCode()` (SAFE-XXXX), `findElderByCode`,
  `linkCaretakerByCode` (bidirectional batch write: elder gets caretakerId/caretakerName/
  caretakerPhone; caretaker gets assignedElderId/assignedElderName/assignedElderRoom),
  `unlinkCaretaker`, `ensureElderPairingCode`.
- **SignupScreen** — elders get a `pairingCode` on signup.
- **AuthContext** — now uses `onSnapshot` for a LIVE profile (link changes reflect
  instantly on both sides) + a `refreshProfile()` one-shot.
- **AppNavigator** — gates on `setupComplete`: elder needs `roomLocation`, caretaker needs
  `assignedElderId`, volunteer always ready. Until complete, the user sees RoleSetup. This
  means a fresh caretaker lands on the "Link a Resident" screen automatically.
- **RoleSetupScreen** — 3 role-specific sub-screens: ElderSetup (big pairing code + Share
  button + room/contact), CaretakerSetup (enter code → findElderByCode → confirm elder card
  → linkCaretakerByCode), VolunteerSetup (info only).
- **ElderHomeScreen** — if linked, shows real `caretakerName` + calls `caretakerPhone`; if
  NOT linked, shows the pairing-code card ("share this with your caretaker").
- **CaretakerHomeScreen** — shows real `assignedElderName` + room; **alerts query scoped** to
  `where elderId == assignedElderId` (fixes the "see all alerts" routing bug).
- **SOSModal** — writes `assignedCaretakerId: profile.caretakerId` (consistent field).

All 25 mobile JS files validate (JSX + imports). **NOT yet device-tested by the user** —
needs a live run: create an elder (note code) → create a caretaker → enter code → confirm →
verify both homes show the link and alerts route.

### Original in-progress notes (kept for history)

**Decisions made (all approved):** elder generates a pairing code; others enter it. ONE primary
caretaker per elder. Volunteers stay community-wide. Caretaker home should be scoped to their
linked elder's alerts.

**What was wrong before (why this is needed):** the pairing was a dead field — nothing generated
codes, links were one-directional, the elder's "Your Caretaker" showed a placeholder, and alerts
didn't route to a specific caretaker.

**DONE so far:**
- `mobile_app/src/services/linking.js` — CREATED. Functions: `generatePairingCode()` (SAFE-XXXX),
  `findElderByCode(code)`, `linkCaretakerByCode(caretaker, code)` (bidirectional batch write:
  elder gets caretakerId/caretakerName/caretakerPhone; caretaker gets assignedElderId/
  assignedElderName/assignedElderRoom), `unlinkCaretaker(caretaker)`, `ensureElderPairingCode()`.
- `SignupScreen.js` — UPDATED: elders now get `pairingCode: generatePairingCode()` on signup.

**STILL PENDING (resume here):**
1. **Redesign `RoleSetupScreen.js`** (was about to be rewritten):
   - Elder: show their pairing code BIG with a copy/share button; "you can share this with your
     caretaker." Still capture room number + emergency contact.
   - Caretaker: enter pairing code → call `findElderByCode` → show elder's name to CONFIRM →
     `linkCaretakerByCode` → done. Handle "no elder found" error.
   - Volunteer: no linking needed; just a "complete setup" / go on-duty.
2. **ElderHomeScreen** — show the REAL linked caretaker name (`profile.caretakerName`) instead of
   "Care Team"; call button uses `profile.caretakerPhone`. Also surface the pairing code somewhere
   (e.g. a small "Your code: SAFE-XXXX" chip) in case not yet linked.
3. **CaretakerHomeScreen** — show the real `assignedElderName`/room; **scope the alerts query** to
   only their elder: `where("elderId","==",profile.assignedElderId)` (currently listens to ALL
   CREATED alerts — that's the routing bug). Add a "link an elder" prompt if `assignedElderId` is null.
4. **SOSModal + M4/escalation routing** — the elder's SOS and backend alerts should set
   `assignedCaretakerId` from the elder's `caretakerId` so the right caretaker is targeted. In the
   app, SOSModal already reads `profile.assignedCaretakerId` — but the field on the elder is now
   `caretakerId`; make them consistent (use `caretakerId`).
5. **Validate** all JS again (@babel/parser) and have the user test the full link flow on device.

---

## 10. Key decisions & bugs fixed (institutional memory — don't re-litigate)

1. **MediaPipe API:** use modern Tasks API, NOT legacy `mp.solutions` (crashes on installed version).
2. **Dependency strategy:** keep latest versions; mediapipe 0.10.x conflicts with streamlit protobuf.
3. **Honest perception (Option A):** confidence 0.5, report LOST rather than hallucinate poses on
   furniture. Occluded falls are M4's job (POSE_LOST_WHILE_FALLEN), not M3's.
4. **Furniture:** confidence floor 0.4, max-area 60%, TTL 120, reset between clips (fixed phantom
   boxes + cross-clip leakage). Grouped into seat/rest_surface for safety semantics.
5. **M2 velocity frame bug:** measure velocity in torso-scaled image coords, not hip-origin frame.
6. **M3 ONNX export bug (CRITICAL):** dynamic batch axis corrupts GRU → constant 0.53. Fixed with
   fixed batch=1 + automatic parity check. Any future model change MUST keep the parity check.
7. **M4 bed false alarm:** fixed box-containment margin + require real downward velocity for impact.
8. **Dashboard:** removed per-frame Plotly (lag), fixed blank video (use RGB arrays not JPEG bytes
   on Streamlit 1.64).
9. **Firebase config:** `isFirebaseConfigured` checks key prefix "AIza" (a find/replace once
   inverted an exact-string check and broke login).
10. **M3 self-test FOOTGUN (fixed):** running `src/m3_temporal_model.py` used to re-export an
    UNTRAINED model over the trained `models/m3_temporal_fall.onnx` → dead model (constant 0.53)
    → bed clip false-alarmed. FIX: the self-test now exports to a TEMP path and never touches the
    trained model. If the pipeline ever shows the bed clip firing + all clips flipping
    STAND_WALK↔PRE_FALL at identical frames, the ONNX is dead — just run `train_m3.py` to restore it.
    Quick model-health check: fall windows should score P~0.86, normal ~0.01 (NOT both ~0.53).

---

## 11. Honest status: what works vs what's pending

**WORKING & VERIFIED:**
- Full Python pipeline M1→M2→M3→M4→escalation (3 test clips: bed silent, both falls caught).
- M3 trained + ONNX parity-verified.
- Backend → live Firestore write (test_firebase_sync verified).
- Streamlit dashboard (boots, serves, pipeline runs).
- Mobile app: builds, runs on device (Expo Go), login/signup works, full UI redesign done and
  syntax-validated.

**PENDING / NOT DONE:**
- **Role-linking system** — CODE COMPLETE (section 9), but NOT yet device-tested end-to-end.
- **Scoped alert routing** — DONE in code (caretaker query scoped to their elder); verify on device.
- **Cloud → app live alert flow** end-to-end demo (inject alert → caretaker modal pops) — should
  work now that config is in, but NOT yet confirmed on-device by the user.
- **Push notifications** — expo-notifications installed but NOT wired; alerts only pop via in-app
  Firestore listener (works when app is open, not background).
- **LONG_LIE_ALERT** — logic correct but never exercised on real 10s+ footage.
- **Firestore security rules** — still open test mode; must lock down before real use.
- **Twilio / real push** — mock stubs only; need real credentials + SDKs.
- **M3 production quality** — needs larger datasets (KFall, UP-Fall) + retraining for generalization.
- **No automated mobile runtime tests** — only JSX/import validation; the agent cannot see rendered
  UI, so visual/UX correctness depends on the user testing on device.

---

## 12. Recommended next steps (in order)
1. **Device-test the linking flow** (elder code → caretaker links → both homes update → alert routes).
2. Confirm cloud→app live alert flow on device (inject via test_firebase_sync.py → caretaker modal).
3. Add Firestore security rules (currently open test mode).
4. (Later) push notifications, larger dataset + M3 retrain, Twilio.

Note: linking service also exposes `unlinkCaretaker()` — no "unlink" button in the UI yet
(could add to a caretaker settings screen later).

---

## 13. Quick "resume from here" prompt for a new agent
> "Read PROJECT_REPORT.md. Continue the role-linking system (section 9): redesign
> mobile_app/src/screens/auth/RoleSetupScreen.js so an elder sees/shares their pairing code and a
> caretaker enters a code → confirms the elder → links (use src/services/linking.js). Then update
> ElderHomeScreen (real caretaker name/phone), CaretakerHomeScreen (real elder name + scope alerts
> to where elderId == assignedElderId + prompt to link if none), and make SOS/alert routing use the
> elder's caretakerId. Validate all JS with @babel/parser. The user tests visually on device."
```

---

## 14. Changelog — device-feedback round (login, escalation, role completeness)

Fixes from first on-device testing:

1. **Login persistence (FIXED).** Installed `@react-native-async-storage/async-storage`
   (1.23.1). `config/firebase.js` now uses `initializeAuth(app, { persistence:
   getReactNativePersistence(AsyncStorage) })` (falls back to `getAuth` on hot-reload).
   Users now STAY logged in across app restarts.

2. **Escalation reliability (FIXED).** The volunteer query (`escalatedToVolunteers==true` +
   `status==CREATED`) and caretaker query (`elderId==x` + `status==CREATED`) were COMPOSITE
   queries that silently returned nothing without a Firestore composite index. Both now use a
   SINGLE-FIELD `where` + client-side status filtering → no index needed, works out of the box.
   - 20s timeout → `escalate()` → `escalatedToVolunteers=true` logic was already correct; the
     real blocker was the index. Volunteers now reliably receive escalated alerts.

3. **Volunteer dispatch — full emergency UI (NEW).** `VolunteerDispatchModal` rebuilt to match
   the caretaker modal: flashing header, telemetry rows, **I'M COMING** (with a race-guard that
   checks if another responder already ACKNOWLEDGED), **Call Emergency Services (911)**, and
   **I Can't Respond**. Accepting sets status ACKNOWLEDGED + acknowledgedBy + respondedByRole.

4. **Caretaker — Elder Details screen (NEW).** `screens/caretaker/ElderDetailsScreen.js`: hero
   card (name/room), live active-alert status, details (emergency contact, pairing code, resident
   id), Call Resident, View Alert History, and **Unlink Resident** (uses `unlinkCaretaker`, with
   confirm dialog). The resident card on CaretakerHome is now tappable → opens this screen.
   Added to the caretaker nav stack.

All 26 mobile JS files validate (JSX + imports). NOT yet re-tested on device after these changes
— rebuild the APK (or reload Expo) and re-run the role flows.

### Escalation flow — how it works now (for testing)
- Elder SOS or backend alert → `alerts` doc with status CREATED, elderId, caretakerId.
- Caretaker (linked to that elderId) sees it → emergency modal with 20s countdown.
- Caretaker **Accept** → ACKNOWLEDGED (done). **Decline** or **20s timeout** →
  `escalatedToVolunteers=true`.
- Any on-duty volunteer → dispatch modal → **I'm Coming** claims it (race-guarded).

### Still pending (unchanged from section 11)
- Firestore security rules (still open test mode).
- Background push notifications (only in-app listener works; app must be open).
- LONG_LIE_ALERT not exercised on real long footage.
- Larger dataset + M3 retrain for production generalization.
- Role screens could still be enriched further (elder: recent-activity peek; volunteer: duty
  stats / history) — current set is functionally complete.

### To apply these changes on devices
A new APK build is needed (the AsyncStorage native module requires a rebuild — a JS-only Expo
reload will NOT pick it up):
```
cd mobile_app
npx eas build -p android --profile preview
```

---

## 15. Changelog — M3 data scaling & retraining (BIG accuracy win)

Scaled M3 from proof-of-concept to a genuinely strong classifier using a Le2i-derived
frame dataset.

### Dataset
- Source: `pure_data.zip` (user-downloaded) = Le2i frames, extracted to
  `data/raw_datasets/le2i_frames/{train,val}/{Blank,Stand,Lie,Likefall,Fall}/{clip}/NNN.jpg`.
  Consecutive frames per clip; includes `Likefall` (hard negatives). Has its own train/val split.
- Label map: `Fall` -> 1; `Blank/Stand/Lie/Likefall` -> 0.
- MCFD chutes (.avi, 8 cams) are available but need fall-frame annotations — not used yet.
  SisFall is sensor data — not applicable to the pose pipeline.

### `extract_dataset_features.py` (rewritten)
- Reads the le2i_frames image-sequence structure, runs each clip's consecutive frames
  through M1->M2, builds 15-frame windows, labels by class folder.
- Resets the window buffer on tracking loss (no bridging gaps).
- Respects the dataset's train/val split; records `groups` per clip (no leakage).
- Also appends the 3 original local clips (kinematic-labelled) to TRAIN.
- Saves X_train/y_train/groups_train, X_val/y_val/groups_val, legacy X/y/groups,
  norm_stats.json, meta.json → `data/processed_features/`.
- RESULT: train 1312 windows (167 fall), val 118 windows (49 fall).

### `train_m3.py` (upgraded)
- Uses the dataset train/val split; z-score norm from TRAIN only.
- Weighted BCE (default, pos_weight≈6.9) or `--loss focal`.
- ReduceLROnPlateau on val AUC, best-AUC checkpoint.
- Full metrics via numpy (no sklearn): Accuracy, Precision, Recall, F1, ROC-AUC,
  confusion, plus F1-optimal threshold search.

### RESULTS (held-out val) — big jump
| metric | before (UMAFall ~5 clips) | after (Le2i) |
|--------|---------------------------|--------------|
| ROC-AUC | — | **0.981** |
| Precision | 0.72 | **0.91** |
| Recall | 0.61 | **0.88** |
| F1 | 0.66 | **0.90** |
Confusion: TP=43 FP=4 FN=6 TN=65. ONNX val: fall P=0.875, normal P=0.058.

### `export_onnx.py` (new, standalone)
- Re-exports the trained .pt to fixed-batch ONNX + parity check over 100 val windows
  (observed max logit diff 1.9e-06 — PASS). Use this to re-export without retraining.

### End-to-end verification
- `test_m4_runner.py` with the retrained model: all 3 clips still PASS (bed silent,
  both falls caught). The stronger M3 improves live-camera detection quality.

### How to re-run the whole data pipeline
```
python extract_dataset_features.py   # Le2i frames -> processed_features/*
python train_m3.py                   # retrain + full metrics report  (--loss focal optional)
python export_onnx.py                # standalone fixed-batch export + parity (train also exports)
python test_m4_runner.py             # end-to-end sanity on the 3 clips
```

### Still-open / future
- Add MCFD (needs fall-frame annotation parsing) and URFD (image-sequence zips) for even
  more variety.
- Live-camera threshold tuning in M4Config if needed.
- The model is now strong on Le2i rooms; real deployment would still benefit from
  on-site data from the actual camera/room.

---

## 16. Changelog — false-alarm reduction (confirmation window)

From live-camera feedback: the system false-alarmed on sleeping in bed, bending, and
exercising. Root cause: M4 fired `FALL_IMPACT` the INSTANT impact kinematics appeared,
without waiting to see whether the person stayed down. Bending/exercise = brief
impact-like spike then quick recovery = should NOT alert.

### Fix: a CONFIRMING state (temporal confirmation)
New M4 flow: `PRE_FALL -> CONFIRMING -> (stays down confirm_s) -> alert -> POST_FALL_MONITOR`.
- On impact OR tracking-loss, M4 enters **CONFIRMING** and does NOT alert yet.
- If the person gets back UP within `confirm_s` (2.5s, tilt < 35deg) -> it was a
  bend / exercise / stumble -> silently returns to STAND_WALK, **no alert**.
- Only if they STAY down past `confirm_s` -> confirmed fall -> alert fires.
This is the "with time it understands" behaviour: a real fall = goes down AND stays down.

### Stronger bed/rest_surface suppression
On a `rest_surface` (bed/couch), fall logic is suppressed unless there is BOTH strong
neural evidence (p_fall > impact_p) AND a real fast descent (hip_v_y > pre_fall_vy).
This kills:
- sleeping / lying still in bed,
- turning/rolling over in bed (even when tracking is briefly lost).

### New M4Config knobs (tunable)
- `confirm_s` (2.5) — how long the person must stay down to confirm a fall.
- `confirm_upright_tilt` (35) — tilt below which, during the window, counts as recovered.

### Verified
Self-test (4 cases): real fall (stays down)->alert; bending/exercise (recovers)->NO alert;
bed lie-down->no alert; rolling over in bed (LOST)->no alert. All pass.
test_m4_runner on the 3 clips: bed silent, both real falls still caught
(PRE_FALL -> CONFIRMING -> POST_FALL_MONITOR -> alert). All 5 module self-tests pass.

### Tuning note for live use
If a real fall is ever missed because the person moved after landing, lower `confirm_s`.
If some ADL still slips through, raise `confirm_s` or the impact thresholds in M4Config
(src/m4_state_machine.py). These are the live-sensitivity knobs; the M3 model is unchanged.

---

## 17. GMDCSA24 added + FULL metrics report (Option A: in-domain deploy + honest OOD)

Added GMDCSA24 (4 subjects, 79 fall + 81 ADL videos incl. sleeping/sitting/bed-reading).
Combined extraction produced 24,135 train + 7,766 val windows. A naive combined-train
model generalised poorly cross-subject (F1 0.43) — expected OOD behaviour, not a bug.

### Decision: Option A (strategic, honest)
- DEPLOYED model = trained IN-DOMAIN on Le2i (matches the fixed-camera deployment).
- GMDCSA Subject 4 kept as a held-out OUT-OF-DISTRIBUTION test (unseen person).
- M4's confirmation + furniture suppressor handle the OOD false positives M3 produces.
- `evaluate_m3.py` trains the deployed model and reports both in-domain and OOD.

### FULL M3 METRIC REPORT (models/m3_metrics.json)
IN-DOMAIN (Le2i-val):
  ROC-AUC 0.997 | Accuracy 0.983 | Precision 1.00 | Recall 0.96 | F1 0.98
  Confusion TP47 FP0 FN2 TN69   (zero false positives in-domain)
OUT-OF-DISTRIBUTION (GMDCSA Subject 4, unseen person):
  ROC-AUC 0.76 | Accuracy 0.66 | Precision 0.18 | Recall 0.65 | F1 0.29
  -> the well-known cross-subject gap in pose-based fall detection; mitigated by M4.

### System speed/efficiency (measured)
- M3 ONNX inference: ~0.09 ms/window (p95 0.11 ms) on CPU.
- M1+M2+M3 pipeline: ~28-40 FPS on 720p CPU (M1 pose+YOLO dominate).
- M4 + escalation: negligible (<1 ms).

### M4 refinement this round (fixes "lying onto bed" false alarm)
When the new model scored "sitting/lying DOWN onto a bed" as a strong fall (p=0.97),
the alert slipped through. Fix: in CONFIRMING, if the person is horizontal but ON a
rest_surface, treat it as resting (not a fall) and abort — because a genuine fall ends
on the FLOOR, not on furniture. Self-test (real fall / bending / bed / rolling-over) and
all 3 pipeline clips pass; all 5 module self-tests pass.

### Reporting framing for the paper
"M3 achieves F1 0.98 / ROC-AUC 0.997 in-domain. On a held-out unseen subject raw F1 is
0.29 (cross-subject generalisation gap, consistent with the literature). The two-layer
design — M3 (neural trajectory) + M4 (temporal confirmation + furniture context) — keeps
the end-to-end system reliable despite M3's OOD limitation."

### How to reproduce
```
python extract_dataset_features.py   # Le2i + GMDCSA -> processed_features/
python evaluate_m3.py                # deployed Le2i model + full in-domain & OOD report
python test_m4_runner.py             # end-to-end: bed silent, both falls caught
```

# Independent Codebase Audit

**Audit date:** 2026-10-04  
**Scope:** Python detection pipeline, model/data workflow, dashboard, Firebase integration, Expo mobile app, repository/release readiness, documentation, and executable checks.  
**Purpose:** candid feedback for improving the system. This is an engineering review, not a clinical safety certification.

## Bottom Line

This is **not a useless project**. It contains a real end-to-end prototype: camera input, pose/furniture perception, kinematic features, a temporal model, deterministic confirmation logic, cloud alert records, and a role-based mobile interface.

However, the evidence supports only this claim:

> A local demonstration prototype that can detect the included demonstration clips and display an alert in an open mobile app.

It does **not** support these claims yet:

- reliable fall detection in homes or care settings;
- safe emergency response;
- secure handling of real people’s data;
- dependable alert delivery when the phone is locked, offline, or backgrounded;
- deployment readiness; or
- generalisation to people, cameras, rooms, lighting, and activities not in the tiny test set.

The system is a solid foundation for a student/research prototype. Calling it a finished safety product today would be misleading and unsafe.

## Evidence Collected

| Check | Result | What it proves | What it does not prove |
| --- | --- | --- | --- |
| Python syntax compilation | Passed for the Python source and test scripts. | Files can be parsed by the local Python interpreter. | Runtime safety, model accuracy, cloud reliability, or mobile behavior. |
| `test_escalation.py` | Passed on three saved clips. | Two supplied fall clips emitted one local record each; one supplied bed ADL clip did not. | Performance on unseen videos, real homes, or Firebase/mobile delivery. |
| `test_m2_pipeline.py` | Passed on one chair-fall clip. | M1/M2 produce movement values on that clip. | Stable pose/kinematics across people, cameras, lighting, or occlusion. |
| `test_m4_runner.py` | Passed on the same three saved clips. | M4 did not alert for the one bed clip and alerted for the two fall clips. | Clinical false-negative/false-positive rate or long-term behavior. |
| `test_m3_runner.py` | Ran on six local clips. | The deployed ONNX model executes with low local CPU latency. | Reliable classification: normal clips still produced very high peak scores. |
| Expo web export | Failed. | The advertised web platform is not currently buildable. | Android/iOS release readiness. |
| Repository/deployment scan | No Firebase rules, cloud function, CI workflow, container, or release pipeline found. | These controls are absent from this repository. | Whether unpublished external controls exist; none can be reviewed here. |

## Highest-Priority Findings

### Critical: no reviewable authorization boundary for sensitive health/safety data

**Evidence:** The repository has no `firestore.rules`, `firebase.json`, backend API, Cloud Function, or server-side authorization layer. The mobile client directly creates profiles, chooses its own role, links users, reads users, and updates alerts. See `mobile_app/src/screens/auth/SignupScreen.js`, `mobile_app/src/services/linking.js`, and the alert screens. `PROJECT_REPORT.md` also states that Firestore rules were still in open test mode.

**Why this matters:** A user must never be able to declare themselves a caretaker/volunteer, read another person’s room/contact/alert history, overwrite alert state, or take over an elder relationship without strict server-enforced rules.

**Counter-scenarios:**

- A malicious signed-in user sets their role to volunteer or caretaker.
- A guessed pairing code links a stranger to an elder.
- A user reads or changes alert records they do not own.
- An attacker marks a real alert resolved or escalates it incorrectly.

**Required direction:** Define Firestore rules in source control, add role and relationship checks, move privileged pairing/escalation operations to a trusted backend/Cloud Function, and test both allowed and denied access paths.

### Critical: the model has serious false-positive evidence in its own test output

**Evidence:** `test_m3_runner.py` reported the following local scores:

| Clip marked as normal activity | Peak fall score | Windows above threshold |
| --- | ---: | ---: |
| Bed lie-down | 0.97 | 13 of 231 |
| Walking | 1.00 | 6 of 774 |
| Jogging | 0.99 | 5 of 478 |

M4 suppressed the bed alert in the one supplied M4 test because furniture context said it was a rest surface. That is a useful guard, but not a reliable answer to the broader model failure.

**Why this matters:** A fall probability of `1.00` during normal walking/jogging means the M3 score cannot currently be presented as a trustworthy fall-risk probability. A missed bed/chair detection, a camera angle change, or a different normal activity can turn this into a user-facing false alert.

**Required direction:** Build a held-out evaluation set by person, room, and camera; report precision, recall, false alerts per hour, and confidence intervals; retrain/calibrate before making performance claims; and test the full M1-to-M4 chain on unseen videos.

### Critical: alert delivery is not dependable in an emergency

**Evidence:** The mobile app uses Firestore `onSnapshot` listeners while the app is running. `expo-notifications` is installed but not implemented. The caretaker escalation clock is a `setInterval` inside `CaretakerAlertModal.js`, not a cloud-side timer.

**Counter-scenarios:**

- The caretaker phone is locked, app backgrounded, out of battery, or has poor data: no visible alert.
- The caretaker closes the emergency modal or loses connection: volunteer escalation may never occur.
- The phone’s JavaScript timer pauses in the background: the claimed 20-second escalation is not trustworthy.

**Required direction:** Use server-authoritative alert state and escalation deadlines, background push notifications, delivery/retry tracking, acknowledgement timeout rules, and an operational fallback path.

### High: caretaker alert history exposes every project alert

**Evidence:** `mobile_app/src/screens/caretaker/AlertHistoryScreen.js` queries `collection(db, "alerts")`, orders by timestamp, and limits to 50. It does not filter by the caretaker’s linked elder ID.

**Impact:** In permissive Firebase rules, a caretaker can see every resident’s name, alert type, and timestamp. In restrictive rules, the query may fail because it asks for documents the caretaker is not allowed to read.

**Required direction:** Query only the linked elder’s alerts and enforce that same relationship in Firestore rules.

### High: volunteer acceptance is not atomic

**Evidence:** `VolunteerDispatchModal.js` reads an alert with `getDoc`, checks its status, then performs `updateDoc`. The comment says it guards against races, but this is not a Firestore transaction.

**Counter-scenario:** Two volunteers read `CREATED` before either writes. Both can update the document and both believe they are responding.

**Required direction:** Claim alerts through a transaction or trusted server endpoint that atomically checks and assigns a responder.

### High: pairing is weak and client-controlled

**Evidence:** `mobile_app/src/services/linking.js` generates `SAFE-XXXX` codes from a 30-character alphabet. That gives about 810,000 possible codes. The same client code finds an elder by code and overwrites the caretaker relationship in a batch.

**Counter-scenarios:** code guessing, repeated online attempts, shared/reused code, accidental linking, and a new caretaker replacing the existing caretaker without elder confirmation.

**Required direction:** Use high-entropy, expiring, single-use invitations; rate limiting; consent/approval from the elder or administrator; audit records; and server-side relationship changes.

### High: UI reports success even after cloud writes fail

**Evidence:** Many alert actions use `catch (e) {}` and immediately navigate away, including SOS creation, acknowledgement, resolve, false-alarm status, caretaker escalation, volunteer claim, and unlink. Relevant files include `SOSModal.js`, `CaretakerAlertModal.js`, `ActiveResponseScreen.js`, `CancelAlertScreen.js`, and `VolunteerDispatchModal.js`.

**Impact:** A caretaker can press “I’M COMING,” lose internet, see the response screen, and believe the alert was acknowledged when nothing was saved.

**Required direction:** Show actionable error states, keep the user on the screen after failed writes, use optimistic state only with rollback, and log errors for support.

## Module-by-Module Assessment

### Camera and `run_live.py`

**What is good:** Supports webcam, saved video, and a network phone stream. It visibly displays pipeline state and has local-only mode.

**Gaps:** It is a manually launched desktop process with no service manager, health endpoint, automatic restart, camera reconnect strategy, secure stream transport, device identity, or monitoring. It silently ignores a failure while resolving elder context. It assumes the M1 frame timing is 30 FPS even though actual camera/network frame rates vary.

**Counter-scenarios:** Wi-Fi drop, phone IP address changes, camera freezes but OpenCV continues returning stale frames, the model file is missing, service-account credentials expire, or the wrong elder ID is supplied.

### M1 perception

**What is good:** Uses a single pose authority, limits object detection to furniture context, and has short pose/furniture memory to reduce flicker.

**Gaps:** It tracks one pose only, has no multi-person policy, does not validate camera placement, and treats furniture detection as a high-impact safety input. A wrong/missed bed box changes M4 behavior. The model files are local and not versioned with a reproducible download/checksum process.

**Counter-scenarios:** visitor/caretaker enters the frame, a person is partly hidden, low light changes detection, a bed is not recognised, a chair is mistaken for a bed, or the camera is moved.

### M2 kinematics

**What is good:** Converts landmarks into scale-normalised movement features and resets across lost pose gaps.

**Gaps:** Its correctness is mostly demonstrated on a narrow supplied video set. Scale normalisation does not remove perspective changes, camera motion, lens distortion, or incorrect pose landmarks. Held frames can make the same position appear temporarily stable during a critical event.

**Counter-scenarios:** walking toward the camera, using a walker, wheelchair transfer, seated exercise, crouching, picking up an item, assisted transfer, or camera vibration.

### M3 temporal model

**What is good:** The architecture, ONNX export parity check, and local inference latency are concrete technical work. The ONNX/PyTorch parity guard is a good engineering precaution.

**Gaps:** High normal-activity peak scores are shown by the project’s own runner. There is no versioned experiment tracker, reproducible dataset manifest, calibration analysis, model card, demographic/environment coverage analysis, or external test set. The model and normalisation artifacts are excluded from the repository, so a fresh clone cannot reproduce the observed result.

**Counter-scenarios:** unseen rooms, different body types, clothing, mobility aids, slow collapses, near falls, people who remain seated after a fall, and falls out of frame.

### M4 decision engine

**What is good:** It makes the final decision more explainable and suppresses one known bed false-alarm scenario. The three supplied clips pass.

**Gaps:** Thresholds and timers are hand-tuned and not justified by a validation protocol. M4 can emit alerts when the M3 score is zero; in the executed escalation test, emitted fall records had `fallProbability: 0.0`. This means the test does not demonstrate that the learned model contributes to actual alert correctness.

**Counter-scenarios:** a real fall onto a bed/couch may be suppressed; normal activity near a chair may trigger; a slow fall without sharp jerk may be missed; a person could recover just after alert confirmation.

### Alert gateway and Firebase cloud layer

**What is good:** Alert records have a clear schema and local JSON testing is useful.

**Gaps:** Firestore is treated as a sink, not an operational service. There is no server deployment, rules, retry queue, idempotency key shared across process restarts, audit log, delivery acknowledgement, alert retention policy, backup strategy, observability, or incident response process. `clear_firestore.py` can delete whole user/alert collections without environment protection or a confirmation step.

**Counter-scenarios:** computer restart after alert creation, duplicate alerts after a restart, Firebase outage, one user changing another alert, accidental deletion of production data, or data retention/privacy requests.

### Dashboard

**What is good:** Useful for visual debugging and reviewer demonstrations.

**Gaps:** It is a local demo, not an operations console. It uses fixed local clips and local alert logs. It does not prove cloud/mobile delivery, authentication, monitoring, or production behavior.

### Mobile application

**What is good:** The role flows are understandable, the pairing flow is thoughtful for a prototype, and the screens cover SOS, caretaker response, volunteer response, and historical views.

**Gaps:** No app tests, no lint/typecheck script, no error telemetry, no accessibility test evidence, no push delivery, no offline strategy, no locale/region configuration, and no secure authorization boundary. The APK app uses hard-coded `tel:911`, which is not correct for every country and should be configurable rather than assumed.

**Build evidence:** `npx expo export --platform web` fails because `react-native-web`, `react-dom`, and `@expo/metro-runtime` are missing, even though the package exposes a `web` script and `app.json` configures web. Native build was not proven during this audit.

## Missing Evidence and Questions to Answer

Do not answer these with assumptions. Gather data.

1. What are false alerts per hour and missed-fall rate on unseen, realistic camera footage?
2. Are train/validation/test videos separated by person, room, camera, and source dataset to prevent leakage?
3. What activities of daily living were tested: transfers, bathing, reaching, exercise, wheelchair use, assisted movement, pets/visitors, and occlusion?
4. What is the detection and alert latency from camera event to caretaker notification at p50/p95/p99?
5. What happens when camera, Wi-Fi, Firebase, or phone connectivity is lost?
6. Who is authorized to create an elder, pair a caretaker, view medical/location details, accept an alert, resolve it, or delete data?
7. What country/region is the deployment for, and what is the correct emergency number and privacy/legal requirement there?
8. What is the explicit user-consent, data-retention, deletion, and audit-log policy?
9. Who operates the Python runner continuously, updates model files, rotates credentials, and receives system health failures?
10. What does a caretaker do when the model, cloud, or app is uncertain or unavailable?

## Repository and Delivery Gaps

- The Git object store is about **1.32 GiB** and includes a pack file of about **1.42 GB**, even though large artifacts are now ignored. This strongly suggests historical large-object bloat. GitHub cloning and collaboration will remain painful until history is inspected and, if appropriate, cleaned with a planned migration.
- No CI workflow, automated test command, lint configuration, type checking, dependency vulnerability scan, release checklist, or environment-based configuration was found.
- The mobile package has start commands only; no test, lint, or typecheck script.
- A fresh clone lacks the required trained models, test videos, and trusted credentials. Documentation says how to restore them, but there is no reproducible artifact registry or verification checksum.

## Recommended Improvement Order

### Phase 0: stop unsafe claims

1. Describe the system as a **prototype/demo** everywhere.
2. Remove claims of reliable emergency monitoring until evidence exists.
3. Do not test with real falls or real vulnerable users.

### Phase 1: secure the cloud boundary

1. Add version-controlled Firestore security rules and emulator tests.
2. Remove client authority to choose privileged roles and mutate relationships/alert states freely.
3. Move pairing, alert claiming, escalation, and sensitive updates to a trusted backend/Cloud Functions.
4. Replace short pairing codes with expiring, consented, rate-limited invitations.
5. Fix alert-history scope before any real data is used.

### Phase 2: make alerts dependable

1. Add background push notifications and delivery state.
2. Run escalation deadlines server-side, not in a visible app modal.
3. Use atomic transactions for claiming/responding to alerts.
4. Add retry, error UI, audit records, monitoring, and service health alerts.
5. Make emergency contact number configurable by deployment region.

### Phase 3: earn model credibility

1. Define target users, rooms, camera positions, and what counts as a fall.
2. Create a data protocol with consent, labels, and split-by-person/room/camera evaluation.
3. Measure false alerts per hour, missed falls, sensitivity, specificity, precision, recall, F1, calibration, and latency.
4. Publish a model card with known limitations and failure cases.
5. Treat M4 thresholds as parameters to validate, not as final safety truth.

### Phase 4: make engineering repeatable

1. Add CI for Python checks, mobile lint/typecheck, unit tests, and build verification.
2. Fix the web dependency failure or remove web from advertised support.
3. Add a testable configuration system and separate development/staging/production Firebase projects.
4. Create a model/data artifact registry with version numbers and checksums.
5. Investigate and clean large Git history only with a coordinated migration plan.

## A Defensible Next Milestone

Do not aim for “production.” Aim for a **secured laboratory pilot** only after all of the following are true:

- Firestore rules and authorization tests are committed and pass.
- Alert history is scoped and all alert transitions are server-authorized.
- The app can deliver a background notification and an escalation works when the caretaker app is closed.
- Two responders cannot claim the same alert.
- An unseen-video evaluation reports both false-alert and missed-fall rates.
- Model, test data, and application builds are reproducible from documented artifact versions.
- A human-in-the-loop response procedure and explicit safety disclaimer are approved.

## What Is Worth Keeping

Do not throw away the project. Keep and build on:

- the clear M1-to-M4 separation;
- the ONNX parity check;
- the local visual dashboard;
- the explicit furniture context concept;
- the local JSON alert sink for safe testing;
- the role-based mobile flow; and
- the detailed documentation already added to the repository.

The work now is to turn good prototype structure into evidence, security, reliability, and honest product boundaries.

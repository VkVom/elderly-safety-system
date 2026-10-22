# INSIGHT-Fall — WORKLOG (running session log & context)

> Standing rule: this file is updated after **every** work session. Any agent
> starting fresh must read this first. Newest entries on top.

---

## [2026-10-15] Session 1 — Tiered pre-impact alerts + dynamic elder picker + push fix

### Goal (user request)
1. Fix push notifications not arriving on caretaker phones.
2. Make the alert flow genuinely **pre-impact** (project title promise): detect
   balance loss immediately, tiered alerts, auto-cancel when balance is regained,
   elder "Are you OK?" confirmation, caretaker "Call Elder" option.
3. One **dynamic elder/caretaker picker** shared by every test path (direct
   injection, webcam, phone IP-camera) — pick an elder from a list, everything
   routes to their linked caretaker automatically.
4. WORKLOG.md (this file) in project root, updated every session.

### Root causes found (push notifications)
- `run_live.py` routes via `elder.caretakerId`; user's elder pointed at a stale
  caretaker account ("Var Studio"), not the account on the phone.
- `test_escalation.py` used a **fake transport** (`{'status':'ok'}` fabricated) and
  `test_firebase_sync.py` used `MockPushNotifier` (`[PUSH mock]`). No real push had
  ever been delivered/tested.
- No notification-tap deep link in `App.js`/`AppNavigator.js`.

### Plan locked (phases)
- P0: `src/elder_picker.py`, `test_push_live.py` (real send + receipts), wizard in
  `run_live.py`, `--elder` support in `test_firebase_sync.py`, mobile deep link.
- P1: M4 tier events TDD — `PRE_FALL_WARNING` at balance loss, `SELF_RECOVERY_CANCELLED`
  on recovery (same episodeId), adaptive confirm (hard fall ~1.3s / normal 2.5s),
  `long_lie_s` configurable (180s default, `--demo` mode 10s).
- P2: episode-aware gateway — one alert doc per episode, tiered pushes,
  `FirestoreSink.update()`, `elderPhone` in payloads.
- P3: mobile — amber "CHECKING" modal upgrading to red siren, auto-cancel
  "stable" state, Call Elder, elder "Are you OK?" wiring, EVENT_META, rules parity.
- P4: `test_tier_flow.py` + full regression.

### Decisions (defaults approved)
- Tier-1 = amber modal, no siren.
- Long-lie = configurable; 180s default, `--demo` uses 10s.
- Adaptive confirm = enabled.
- RelateAnything stays out of the live loop (offline labeling only, if ever).

### Progress
- [x] P0 picker + push test
- [x] P0 wizard wiring + deep link
- [x] P1 M4 tiers (`test_m4_tiers.py` 9/9)
- [x] P2 gateway (`test_escalation_tiers.py` 8/8)
- [x] P3 mobile (3a multi-elder linking, 3b tier UI)
- [x] P4 tier flow (`test_tier_flow.py` 4/4) + full regression green

### Session 1 continued (same day) — reconciliation + multi-elder decision
- **New user requirement:** one caretaker must link to **multiple elders**.
  Decision: stay **Spark** (no Blaze). Elder side keeps a single `caretakerId`
  (re-link replaces); caretaker side gains `assignedElderIds: string[]`
  (truth) + singular `assignedElderId/Name/Room` kept = first linked (back-compat).
  Python needs no change (it reads the elder's `caretakerId` only). → slot as P3a.
- **Deep-link was dead code:** `useNotificationDeepLink` was defined but never
  called, and `<NavigationContainer>` had no `ref`. Now wired + retries until
  nav is ready (cold start safe). File: `mobile_app/src/navigation/AppNavigator.js`.
- **`linking.js` verified still client-side** (`limit(1)` lookup + `writeBatch`) —
  matches current rules (`users` list allowed with `limit <= 1`). No callable in use.
- **Rules gap for tiers:** `validAlertCreate` whitelist lacks `PRE_FALL_WARNING` /
  `SELF_RECOVERY_CANCELLED`; `validAlertUpdate` lacks `eventType` update key.
  Fix in P3, deploy once (P4). Compile warning "unused variable: uid" (lines 57/67)
  is harmless; optionally clean.
- **Rules deploy path (user-confirmed):** project-local token via `firebase login:ci`
  keeps the global client-project CLI account untouched. `firestore:rules` compiled
  OK with the token; `functions` deploy fails on Spark (artifactregistry requires
  Blaze) — accepted, staying Spark.
- Caretaker alert queries use single-field equality + client-side sort/filter
  (no composite indexes) → multi-elder switches to `where("elderId","in",ids)`
  (still single-field, client-side sort kept).

### Session 1 continued — P1..P4 implementation completed (all local work DONE)
- **P3a multi-elder linking (code complete, needs on-device check):** `linking.js`
  `linkedElderIds()` + `arrayUnion` link (first elder also fills singular mirrors) +
  per-elder `unlinkCaretaker`; new `ManageResidentsScreen`; `AppNavigator` route +
  setup gate; caretaker Home/History/ElderDetails use `in` queries; `authProfiles`
  seeds `assignedElderIds: []`; `firestore.rules` updated (whitelist, membership
  read check, tier event types + `WARNING`/`AUTO_CANCELLED` statuses, `eventType`/
  `tier` update keys). **Rules NOT yet deployed — run the token deploy below once.**
- **P3b tier UI:** `CaretakerAlertModal` rewritten tier-driven — amber "CHECKING"
  (no siren, Call Elder button) that LIVE-upgrades in place via `onSnapshot` to red
  + siren + 20s volunteer countdown when the same episode hits `FALL_IMPACT`;
  auto-dismiss green "RECOVERED" on `AUTO_CANCELLED`. `EVENT_META` gained
  `PRE_FALL_WARNING` (amber) + `SELF_RECOVERY_CANCELLED` (green). Elder side:
  `CancelAlertScreen` "I'M OK" writes `AUTO_CANCELLED`+`resolvedAt` and self-closes
  if the episode resolves remotely; `ElderHomeScreen` live-watches the elder's own
  open alert and auto-prompts the "Are you OK?" screen. Android `warnings` channel
  registered (DEFAULT importance, no sound/vibrate). Caretaker alert card is amber
  while `WARNING`.
- **P4:** `test_tier_flow.py` (real M4 engine → real gateway): 4/4 — recovery flow
  (2 gentle pushes, 0 emergency), hard-fall flow, long-lie escalation (tiers 1→2→3,
  ONE doc), standstill-impact flow. Full regression green: m4 tiers 9/9,
  escalation tiers 8/8, `test_escalation.py` (bed 0 emergency / chair 1 / low-light 1),
  `test_m4_runner.py` (ADL no alert / both falls alert), `test_firebase_sync.py
  --elder Rahul` (doc written live; push ticket still `InvalidCredentials` → FCM key
  STILL not uploaded). Test doc `ALERT_8b9c642fe1e5` was resolved afterwards.
- **Remaining (all user/interactive + device verification):**
  1. Upload FCM V1 key to EAS (fix queue #1 above) — nothing can ring until then.
  2. Run the token rules deploy (fix queue #2) — now carries the multi-elder + tier
     rules changes; then caretaker app re-test.
  3. Open app once as "Caret" and "Vivek" to register their push tokens.
  4. On-device demo: warning push → amber modal → stand up → green auto-cancel;
     fall → red upgrade → Call Elder / I'M COMING.

### [2026-10-16] Live push received — tap/UX bugs found & fixed (post-P4 hardening)
- **FCM V1 key CONFIRMED WORKING:** `test_push_live.py --elder Rahul --receipts`
  → ticket `status: ok` → receipt `status: ok` (real delivery, problem #1 closed).
- **Bug: tapping the push landed on the dashboard, no alert.** Root cause: the test
  push carried `alertId=PUSH_TEST_xxx` but NO matching Firestore doc existed — the
  deep link fetches `alerts/<alertId>`, finds nothing, and silently returns.
  Fix: `test_push_live.py` now WRITES a realistic alert doc (`EP_<hex>`, full
  schema) and deep-links to it; new flags `--event` (FALL_IMPACT default /
  PRE_FALL_WARNING / LONG_LIE_ALERT) and `--resolve <alertId>` for cleanup.
- **Bug: caretaker dashboard empty ("clean").** Root cause: Firestore rules are
  not filters — list queries must constrain the SAME field the rule checks. The
  P3a `where("elderId","in",ids)` query can never be authorized. Fix: reverted
  `CaretakerHomeScreen` / `AlertHistoryScreen` / `ElderDetailsScreen` to
  `where("assignedCaretakerId","==",uid)` (provable under old AND new rules) with
  client-side elder filtering. Multi-elder is unaffected: every alert doc carries
  `assignedCaretakerId` of the elder's caretaker.
- **Bug: no tier UI / deep link on the phone.** Latest EAS build `2136ce6d` is
  Oct 14 12:36 AM — BEFORE this session's mobile work. Published OTA instead of a
  rebuild: `eas update --branch preview` → update group `decb12a8-e95c-4ab5-a959-
  c3e42a70344c` (runtime 1.0.0, channel preview). Phone: launch (downloads) →
  fully close → relaunch (applies). Fallback if it never lands (binary without
  expo-updates): `eas build -p android --profile preview`.
- Rules deploy (fix queue #2) still recommended (mobile-side writes: elder
  "I'M OK" → AUTO_CANCELLED, unlink flows) but no longer blocks the tap/dashboard.
- **Call-style emergency notifications (OTA `1f4f84ba-c328-4f34-93d7-b82797b31dfe`):**
  new Android channel `emergency-alerts-v2` created by `notifications.js` — MAX
  importance, long ring-like vibration pattern, `bypassDnd: true`, audioAttributes
  `ALARM` stream (rings on alarm volume even when media/silent). Python gateway
  default `channel_id` → `emergency-alerts-v2`; emergency pushes (tier ≥ 2) add
  iOS `interruptionLevel: "timeSensitive"`. New id was required because Android
  channel settings are immutable once created.
  Boundary: sound plays once per notification — continuous "rings until answered"
  (full-screen call UI) needs `@notifee/react-native` (native dep) → requires a
  fresh EAS build, not OTA. Candidate future milestone.
  Note: `bypassDnd` may need the user to allow "Override Do Not Disturb" in the
  app's Android notification settings on some ROMs.
- **True call-style ringing — native build queued + OTA synced:**
  - Build `6bb8640b-1038-49b1-a0e0-306b8ae763be` (preview APK) **FAILED** at
    `:app:mergeReleaseResources`: `res/raw/emergency-ring.wav` — `'-' is not a
    valid file-based resource name character` (Android res names allow only
    `a-z 0-9 _`). Lesson: asset filenames bundled into `res/raw` must be
    underscore-safe. Everything else in that run compiled (Notifee native,
    bundle, plugin sound staging).
  - **Fix + rebuild:** asset renamed to `emergency_ring.wav`; app.json plugin
    updated; call channel bumped to `emergency-alerts-v4` (v3 was already in a
    published OTA, so the id is treated as burned — channels are immutable);
    `escalation.py` default + 3 test asserts updated to v4; py tests re-run
    green (8/8, 3-clip PASS, 4/4).
  - Replacement build `d28316bb-960e-4913-9718-caac3aad7c62`
    (https://expo.dev/accounts/vkvom/projects/insight-fall-safety/builds/d28316bb-960e-4913-9718-caac3aad7c62);
    OTA `91f213da-3622-4933-bf2a-07045ed34fe6` published.
  - `mobile_app/assets/emergency_ring.wav` — generated 30s dual-tone (440+480 Hz)
    phone-ring cadence (2s ring / 4s gap × 5) via a temp script.
  - `app.json` gains the `expo-notifications` plugin with
    `sounds: [alarm.wav, emergency_ring.wav]` → bundled into Android `res/raw`
    at build time (this is why a native build was required).
  - Android call channel is now `emergency-alerts-v4` (channels are immutable —
    v2 shipped with the system default sound; v3's build failed on the hyphen)
    + alarm stream + bypassDnd; Python gateway default updated.
  - `@notifee/react-native` 9.1.8 added; new `src/services/callAlerts.js`:
    foreground tier≥2 pushes show a call-style notification with
    `loopSound: true` (rings continuously until handled, CALL category); press
    → cancels ring + opens the alert modal (NavigationContainer ref passed in
    from `AppNavigator`); `CaretakerAlertModal` cancels the loop on mount (its
    own siren takes over). Guarded `require()` keeps old binaries safe — the
    feature no-ops there, so publishing OTA JS was safe.
  - Killed/background state: the system notification now plays the full 30s
    ring tone + long vibration (looping there is impossible without a native
    FCM data-message service; tap → modal siren covers the rest).
- **Live ring verified + two payload bugs fixed:**
  - User installed build `d28316bb` and ran the test themselves — ring works.
  - Expo push HTTP 400 root cause: the push HTTP API enum is hyphenated
    `"time-sensitive"`, NOT the SDK-style camelCase `"timeSensitive"`.
    `escalation.py` + test assert fixed (8/8 green). This field was introduced
    after the last successful live test, which is why it only surfaced now.
  - `test_push_live.py` now prints Expo's error body on HTTP failures.
  - All `EP_*` test alert docs resolved.
- **Auto-call prep finding (data blocker):** neither demo side has a real
  number — Rahul's `phone` is empty and Var Studio's `phone` is empty (so
  `caretakerPhone` mirror on Rahul is null too). Eld/Caret pair only has
  placeholder numbers (2582582586). Before the auto-call chain can be tested
  live, both profiles need real phone numbers patched into Firestore.
- **Tier-3 auto-call chain implemented (build `9cb2ee50`, OTA `1b72b1d6`):**
  - New local Expo native module `mobile_app/modules/insight-call/` (Kotlin):
    `placeCall` (ACTION_CALL + CALL_PHONE), `answerCall` / `armAutoAnswer`
    (TelecomManager.acceptRingingCall + ANSWER_PHONE_CALLS, phone-state listener
    + auto-disarm window), permissions CALL_PHONE, ANSWER_PHONE_CALLS,
    READ_PHONE_STATE (declared in module manifest AND `app.json`).
  - `src/services/autoCall.js` (guarded require — old binaries no-op) +
    `ensureCallPermissions()` requested per role from `AppNavigator`
    (elder also gets ANSWER_PHONE_CALLS).
  - Elder chain (`ElderHomeScreen` watcher): tier ≥ 3 pending episode →
    `placeCall(caretakerPhone)` once per episode, writes `callPlacedAt`, arms
    auto-answer for 180 s; disarms + resets when the episode closes.
  - Caretaker chain (`CaretakerAlertModal`): if `callPlacedAt` exists and no
    `acknowledgedBy`/`callBackAt` 40 s later → `placeCall(elderPhone)` once,
    writes `callBackAt`.
  - `firestore.rules` whitelist now includes `callPlacedAt`/`callBackAt`
    (works under current permissive rules too).
  - Honest limits (v1): auto-answer is best-effort per device (deprecated
    API); works while apps are foreground; incoming-number filter needs
    READ_CALL_LOG so auto-answer is armed over a short episode-scoped window.
  - Build `9cb2ee50` FAILED configuring `:insight-call`: local module gradle
    needs `useDefaultAndroidSdkVersions()` (compileSdk 34/min 23) and must NOT
    call `useExpoPublishing()` (its `from components.release` afterEvaluate
    hook breaks in this setup — publishing is only for mavenLocal dev anyway).
    Fixed → build `f0772bf1-339c-4fda-b9b5-8daf6c3cecf9` queued. Autolinking
    auto-discovered `mobile_app/modules/` correctly.

---

## Accounts & Infrastructure (DO NOT LOSE — read before any deploy)

| Thing | Value | Notes |
|---|---|---|
| Expo account | `vkvom` / sathishpoojaryannu1@gmail.com | `eas whoami` confirmed 2026-10-15 |
| Expo project | `insight-fall-safety` | projectId `792ec601-55f0-42ff-9456-1edfa21c2508` |
| Android package | `com.insight.fallsafety` | app.json + google-services.json agree |
| Firebase project | `insight-fall-safety` | same project as google-services.json + service account |
| Firebase service account | `firebase-service-account.json` (repo root, gitignored) | used by Python (`get_firestore_db`) |
| EAS build (done by other agent) | ID `9c9ccecf-27e3-493c-821c-989226ae09b8` | APK published to expo.dev |
| Firebase CLI account | **medmelodev.app@gmail.com — WRONG ACCOUNT** | only has `medmelo-*` projects; IAM deploy to insight-fall-safety blocked |
| Function `pairElderWithCaretaker` | in `functions/index.js` | deploy needs Blaze plan; mobile currently pairs client-side with `limit(1)` |
| FCM push credentials | **MISSING on EAS — root cause of dead pushes** | Expo error: `InvalidCredentials — Unable to retrieve the FCM server key` |

### Fix queue for accounts (exact steps for user)
1. **FCM V1 key upload (push fix):**
   - Expo dashboard → project `insight-fall-safety` → Credentials → Android → FCM V1 service account key → Upload
   - Use the repo's `firebase-service-account.json` (same project, already works for Firestore).
   - Or terminal: `eas credentials` (interactive) → Android → preview → Google Service Account → upload.
   - Then verify: `.\venv\Scripts\python.exe test_push_live.py --elder <name> --receipts`
2. **Firebase rules deploy — project-local token (confirmed working, keeps global CLI account untouched):**
   - One-time: `firebase login:ci` → choose the account that owns `insight-fall-safety` → copy token.
   - PowerShell: `$env:FIREBASE_TOKEN="<token>"`,
     then `firebase deploy --only firestore:rules --project insight-fall-safety --token $env:FIREBASE_TOKEN`
   - Never commit the token; `Remove-Item Env:FIREBASE_TOKEN` after.
   - `functions` deploy is blocked on the Spark plan (artifactregistry). User decision: **stay Spark**,
     client-side pairing retained; `functions/index.js` stays as future production work.
   - Note: token auth prints a deprecation warning (future: `GOOGLE_APPLICATION_CREDENTIALS`).
3. **Phone-side:** caretaker accounts "Caret" and "Vivek" have **no push token** in Firestore.
   Open the app logged in as that caretaker once (token registers on profile load).

### Repo audit notes (state inherited from earlier agent sessions)
- `mobile_app/src/services/{notifications,authProfiles}.js`, `functions/`, `firebase.json`,
  `firestore.rules`, `mobile_app/assets/alarm.wav` — NEW files already in working tree.
- Auth: Google sign-in/sign-up + email verification + password reset wired in
  `LoginScreen.js` / `SignupScreen.js` (complete, reviewed).
- `firestore.rules` (untracked, working copy): owner-scoped users, `alerts` read scoped to
  elder/linked caretaker/on-duty volunteer, client-side pairing allowed via `list` with
  `limit <= 1` (matches `linking.js` client-side pairing — keep in sync!).
- `functions/index.js` has the rate-limited callable pairing, but the app does NOT call it
  (client-side pairing retained for the no-Blaze prototype). Keep both paths consistent.
- `src/m2_kinematics.py` gained `velocity_ready` / `jerk_ready` info flags (harmless).
- `dashboard/app.py` / `pipeline.py` show "N/A / warming up" instead of fake 0% telemetry.
- Escalation already includes real Expo push (`FirestoreExpoPushNotifier`) — the code was
  fine; delivery was blocked by missing FCM credentials (see above), NOT by routing alone.

### P0 discovery (live evidence)
- `test_push_live.py --elder "Rahul" --receipts` → Expo ticket **error**:
  `InvalidCredentials — Unable to retrieve the FCM server key for the recipient's app`.
  => No Android device could EVER receive a push until the FCM key is uploaded to EAS.
- `--list` shows: Eld→Caret (no token!), Prajwal→Vivek (no token!), Rahul→Var Studio (token ok),
  VIVEK→none. Stale routing + missing tokens both confirmed on real data.

---

## 2026-10-20 - Alert push for every source (SOS + dashboard + webcam + IP cam)

Fresh state verified: Rahul Krishna TP (elder, SAFE-UXTY, +918129719986) <-> VIVEK
SATHISH POOJARY (caretaker, +917338157548); both linked, caretaker token ok.
Live push re-verified through the same notifier class run_live uses
(FirestoreExpoPushNotifier): alert EP_7e956a65 -> Expo ticket ok -> receipt ok.
Both test alerts (EP_7e956a65, EP_4a9cccca) resolved afterwards.

Root causes fixed:
- Dashboard never notified: DashboardPipeline hard-wired LocalJsonSink and no
  notifier, using a fake ELDER_DEMO / CARE_1 context. Now the sidebar has an
  "Alert routing" picker over live linked elders; the pipeline writes to Firestore
  and pushes through FirestoreExpoPushNotifier. Local log still written.
- App SOS never pushed: the app only wrote a Firestore doc (only the Python gateway
  pushed). Added mobile_app/src/services/alertPush.js (direct Expo send, channel
  emergency-alerts-v4, time-sensitive); SOS now writes tier: 2 + elderPhone and
  pushes to profile.caretakerPushToken.
- Token mirror: linking.js copies the caretaker token onto the elder doc
  (caretakerPushToken); notifications.js refreshes it on every linked elder when a
  caretaker token registers; AuthContext re-runs on assignedElderIds change.
- TDZ crash: ElderHomeScreen referenced caretakerPhone in the effect deps before its
  const declaration - fixed by hoisting the derived values.
- Call timing (user decision - push first, never call first): the elder phone now
  waits ACK_WAIT_MS = 20s after an emergency before placing the fallback call,
  cancels on caretaker ack, and keeps auto-answer armed only while a call is recent.
- Camera sources: FirestoreExpoPushNotifier._resolve_tokens falls back to the elder
  doc's mirrored token and to elder.caretakerId when the alert record lacks them.
- Firestore rules: caretakerPushToken added to the profile whitelist, link/unlink
  branches (unlink clears it), plus isCaretakerRefreshingElderPushToken. NOT
  DEPLOYED YET - needs the user's firebase login:ci token run.

Verified: npm test (3 suites, 42 tests incl. new alertPush.test.js), Python
py_compile on all changed files, live Expo receipt ok. No APK/OTA/rules deploy per
user instruction; phone builds still predate these JS changes.

## 2026-10-21 - Local release APK build (no cloud build)

EAS build 60f47f85 finished before the local-only instruction; it is NOT the test artifact.
Local Windows release build fixed and verified:
- android/gradle.properties: added -Djava.io.tmpdir and -Dorg.sqlite.tmpdir to both
  org.gradle.jvmargs and kotlin.daemon.jvm.options, plus kapt.use.worker.api=false.
  Root cause: Room's annotation processor (expo-updates) pulls sqlite-jdbc, whose
  native library extraction/lock failed under protected C:\WINDOWS.
- :expo-updates:kaptReleaseKotlin passes; ssembleRelease succeeds (5m16s).
Artifact: mobile_app/android/app/build/outputs/apk/release/app-release.apk
(75,113,165 bytes, universal ABIs, debug-keystore signed). Verified the embedded
JS bundle contains caretakerResponse/volunteerResponse/responseEvents and
volunteer_directory, so responder coordination + escalation code is included.
No adb devices connected yet. Responder-status background pushes still require the
undeployed Cloud Function (Blaze); existing SOS/escalation client pushes are unchanged.

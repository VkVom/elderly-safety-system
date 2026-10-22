# UpSupport Alert Reliability and Coordination Report

**Prepared by:** Copilot  
**Date:** October 21, 2026  
**Repository:** `VkVom/elderly-safety-system`  
**Scope:** Mobile alerts, responder coordination, Firestore authorization, notification delivery, and free-tier constraints

## 1. Executive summary

The codebase already has the main end-to-end pieces for an alert workflow: alerts can originate in the mobile app or the Python monitoring pipeline, Firestore is the shared live record, caretakers and volunteers have separate response states, and the elder phone can call and escalate when nobody appears to respond.

The most likely cause of the tested caretaker and volunteer “Missing or insufficient permissions” failures was in Firestore Rules. New alert documents normally have no `responseEvents`, `caretakerResponse`, or `volunteerResponse` fields. The response rules accessed those optional fields as if they were present, so a first response could be rejected before a responder could accept an alert. I corrected the rules to guard optional fields and verified the caretaker accept, volunteer accept, and elder safe-confirmation writes against the Firestore emulator. The updated rules have also been deployed to the configured Firebase project.

The elder experience now has an active-alert list, a per-alert “I'm OK — Mark Safe” action, and a distinct “I Need Help” action. Marking safe writes a resident-attributed event and closes the alert without deleting or overwriting responder state. Repeated SOS attempts check for an existing active alert before creating another one. SOS push outcomes are no longer silently discarded; an unsuccessful or unavailable push path is logged and shown to the resident after the Firestore alert has been created.

The mobile source is not yet present in a newly built APK. The last known EAS Android build predates these changes, and the free Android build allowance was reported exhausted until November 1, 2026. No paid upgrade or Firebase Blaze change was made.

## 2. Evidence and limits

This assessment is based on the current repository, the available session checkpoints and task recap, and the real-device behavior described by the user. The reported test used an elder phone, caretaker phone, and volunteer phone. Screenshots described in the recap show duplicated alerts and response permission errors.

The following are **user-reported**, not independently measured:

- The SOS push was noticed only after a later SOS attempt.
- Caretaker and volunteer “I'm coming” actions displayed failures.
- Repeated SOS activity produced more than one active alert card.
- Monthly credits were at 86%; the service or quota this referred to was not identified.

The environment did not provide connected Android devices or a way to confirm actual Expo push delivery. Emulator rule tests confirm authorization behavior, not phone notification delivery. The 86% credit figure therefore remains unverified. The EAS free Android-build exhaustion and November 1 reset date are carried forward from the previous build record.

## 3. System architecture and role responsibilities

| Role/system | Creates or reads | Main responsibility |
| --- | --- | --- |
| Elder mobile app | Creates `MANUAL_SOS`; reads the elder's own active alerts; updates safety confirmation | SOS, seeing the active request, marking safe, or confirming help is still needed |
| Caretaker mobile app | Reads alerts assigned to a linked resident; writes `caretakerResponse` | Acknowledge, go on the way, mark arrival, stand down, or resolve |
| Volunteer mobile app | Reads alerts after `escalatedToVolunteers == true`; writes `volunteerResponse` | Accept an escalated alert, report arrival, stand down, or resolve |
| Python camera/dashboard pipeline | May create alerts in Firestore through the trusted Firebase Admin path | Convert monitoring events into shared alert documents |
| Firestore | Stores alerts, profiles, links, and volunteer directory entries | Authorization boundary and live source of truth |
| Expo Push Service | Receives client-sent push requests | Best-effort background notification delivery; a successful ticket does not prove a person saw the alert |
| Firebase Cloud Functions | Contains response-change notification logic | Not deployed for this Spark-only setup because Cloud Functions deployment requires Blaze |

### Account and visibility relationships

- Every alert has an `elderId`.
- `assignedCaretakerId` identifies the primary caretaker for response writes and caretaker feed queries.
- The caretaker profile links back to one or more residents; that link is also used for account and profile coordination.
- Volunteers are not paired with an elder. Their alert visibility begins after an alert is escalated to the volunteer community.
- Volunteer push tokens and on-duty state are mirrored in `volunteer_directory`.
- An elder's caretaker push token is mirrored to the elder profile when the caretaker app registers or refreshes its notification token.
- Firestore Rules use the signed-in Firebase UID, the role in the user's profile, the alert's elder/assigned-caretaker identifiers, and the escalation flag to decide which writes are allowed.

### Important alert fields

| Field | Meaning |
| --- | --- |
| `status` | Shared lifecycle state: typically `CREATED`, `WARNING`, `CONFIRMED`, then a terminal state such as `RESOLVED` or `AUTO_CANCELLED` |
| `eventType` | Source/type such as `MANUAL_SOS`, `FALL_IMPACT`, or `LONG_LIE_ALERT` |
| `assignedCaretakerId` | Caretaker eligible to respond as the primary responder |
| `escalatedToVolunteers` | Makes the alert visible to the volunteer response queue |
| `caretakerResponse` | Caretaker's individual status and identity |
| `volunteerResponse` | Volunteer responder's individual status and identity |
| `acknowledgedBy` | First acknowledgement identifier used by existing fallback logic |
| `responseEvents` | Append-only-style response history for accept, arrive, stand down, resolve, and resident safe confirmation |
| `elderConfirmation` | Resident's explicit safe confirmation, retained on the alert |
| `resolvedByUid`, `resolvedByRole`, `resolvedByName`, `resolvedAt` | Who closed the alert and when |
| `timestamp`, `updatedAt` | Alert creation/event time and most recent state update |

## 4. End-to-end flows

### Manual SOS

1. The elder opens SOS and gets the existing five-second cancellation countdown.
2. The app checks for an active alert belonging to that elder before creating another one.
3. If none exists, it creates a `MANUAL_SOS` alert in Firestore.
4. The app sends an Expo push request to the caretaker token if available. If there is no token or Expo rejects/fails the request, the alert remains in Firestore and the elder receives a clear warning.
5. The elder home listener displays the active alert and the existing fallback logic can place a call if nobody acknowledges in time.
6. The caretaker can accept; the alert stays visible while a responder is on the way. The caretaker must tap **Mark Arrived** before the safe/resolve action is offered.
7. If volunteer escalation is enabled, an on-duty volunteer can accept. The volunteer must also tap **Mark Arrived** before resolving. The caretaker and volunteer responses are retained separately.
8. The resident can open the alert and select “I'm OK — Mark Safe” or “I Need Help.” Resident confirmation can close the alert at any time. An arrived responder can close it after explicitly confirming the resident is safe; both closure paths retain responder data.

### Camera/dashboard alerts

The Python system can write alerts through its trusted backend path. The elder/caretaker/volunteer clients consume the same Firestore alert record. The app's push service is not the only delivery mechanism: active feeds and alert modals use Firestore listeners while the relevant app is online.

### Responder state and alert closure

Accepting is not resolution. The responder response records include `ON_THE_WAY`, `ARRIVED`, and `STOOD_DOWN`. The resident can explicitly mark safe at any time. A caretaker or volunteer must tap **Mark Arrived**, which writes `ARRIVED`, before explicitly confirming the resident safe and resolving. Firestore Rules enforce this sequence. `ARRIVED` is a manual confirmation, not GPS detection. Closing changes the alert lifecycle but does not erase response history.

### Escalation timers to be aware of

There are two client-side escalation mechanisms in the existing code:

- The elder-side fallback waits 20 seconds before trying a caretaker call, then schedules volunteer escalation 45 seconds after that call if the alert is still unacknowledged.
- The caretaker alert modal has its own 20-second countdown to volunteer escalation while that modal is active.

These paths can result in different escalation times depending on which app is open and connected. They were not unified in this change because changing the expected timing is a product decision; validate the desired timeline in the manual test plan below.

## 5. Defects found and changes made

### A. Responder updates rejected by Firestore Rules — fixed

**Observed:** Caretaker and volunteer response actions failed with a permission error.

**Cause:** First-response alerts do not contain prior response maps or a `responseEvents` list. The old rules evaluated absent fields directly in active-response checks and event-list validation. Firestore Rules can treat missing map fields as evaluation errors, which rejects the update.

**Change:** Added existence guards for the optional caretaker/volunteer response maps and `responseEvents` before reading them. The rules still require the correct role, alert assignment/escalation, a single own response event, and a valid state transition. The resident-safe path is separately restricted to the elder whose UID matches `elderId`. The caretaker accept screen now displays the actual write error instead of replacing it with a generic failure message.

**Validation and deployment:** Emulator tests accepted a first caretaker response, a first volunteer response, and an elder safe confirmation when those optional response fields were absent. Rules compiled and were deployed to the configured Firebase project on October 21, 2026.

### B. Elder had no persistent active-alert list — fixed

**Observed:** The elder was automatically pushed into the check-in screen and did not have a clear home-screen list of active alerts to revisit.

**Change:** Added a compact, live active-alert list to the elder home. Emergency alerts remain accessible there; warning alerts retain their automatic check-in behavior. The list shows location and whether help is requested or a responder is on the way. The home content is scrollable for shorter displays.

### C. Elder safe/help actions were silent and lacked durable authorship — fixed

**Observed:** The old “I'm OK” path attempted a direct status write, swallowed write errors, and navigated away whether or not Firestore accepted the update.

**Change:** Added a transaction for “I'm OK — Mark Safe.” It writes `elderConfirmation`, `resolvedBy*`, `resolvedAt`, and a `mark_safe` event. An emergency becomes `RESOLVED`; a `WARNING` retains its distinct `AUTO_CANCELLED` meaning. Caretaker/volunteer response fields are not overwritten. Firestore update errors are shown in the screen instead of being silently ignored. “I Need Help” moves the active alert to `CONFIRMED`.

### D. Responder closure required explicit arrival — fixed

**Decision:** The user chose “resident anytime; caretaker/volunteer only after tapping Mark Arrived.”

**Change:** Caretaker and volunteer screens offer resolve only after their response becomes `ARRIVED`; the action and Firestore Rules both reject resolution while `ON_THE_WAY`. The resident can still mark safe at any time. Arrival is explicitly confirmed by tapping the button; GPS tracking is not implemented.

### E. Repeated SOS could create multiple active alert cards — mitigated

**Observed:** Multiple active cards appeared after repeated SOS attempts.

**Change:** Before creating an SOS, the client queries the elder's active `CREATED`, `WARNING`, and `CONFIRMED` alerts. If one already exists, the app opens that alert instead of creating another. The SOS control already prevents duplicate timer callbacks from the same modal.

**Limit:** The check is client-side and is not a cross-device atomic uniqueness guarantee. Two devices can theoretically query simultaneously before either creates an alert. A server-side unique active-alert coordinator would need a separately designed Spark-compatible transaction/rules flow.

### F. Push failures were invisible to users and logs — improved

**Observed:** SOS push promises were fire-and-forget and their errors were discarded. A missing caretaker token or rejected Expo response could look like a successful SOS attempt.

**Change:** Expo push sending now checks the HTTP and ticket response, logs a failure without printing device tokens, and times out the request after eight seconds when `AbortController` is available. SOS still persists the alert first; if a push cannot be confirmed, the elder sees that the alert is active and is advised to keep the app open and call their caretaker if possible.

**Limit:** Expo acceptance is not proof of handset delivery, and successful delivery is not proof that a person saw or accepted the alert. Real device testing is still needed to isolate the user's first-attempt delay.

### G. Confirmed-help alerts were missing from some active views — fixed

**Change:** The elder and caretaker active-alert queries now include `CONFIRMED`, so the “I Need Help” state remains visible instead of dropping out of their active feed.

## 6. Files changed for this task

- [`firestore.rules`](./firestore.rules) — guard absent response fields and authorize resident safe confirmations.
- [`alertResponses.js`](./mobile_app/src/services/alertResponses.js) — build and transact resident safe-confirmation updates.
- [`alertResponses.test.js`](./mobile_app/src/services/__tests__/alertResponses.test.js) — test safe confirmation, event authorship, warning semantics, and another-resident rejection.
- [`alertPush.js`](./mobile_app/src/services/alertPush.js) — report Expo push failures and send resident status updates.
- [`ElderHomeScreen.js`](./mobile_app/src/screens/elder/ElderHomeScreen.js) — live active-alert list; retain warning check-in and fallback behavior.
- [`CancelAlertScreen.js`](./mobile_app/src/screens/elder/CancelAlertScreen.js) — explicit safe/help action, transaction errors, and status notifications.
- [`SOSModal.js`](./mobile_app/src/screens/elder/SOSModal.js) — existing-alert check, visible create/push error paths.
- [`CaretakerHomeScreen.js`](./mobile_app/src/screens/caretaker/CaretakerHomeScreen.js) — include `CONFIRMED` in active alerts.
- [`CaretakerAlertModal.js`](./mobile_app/src/screens/caretaker/CaretakerAlertModal.js) — preserve the useful responder-write error in the UI.
- [`ActiveResponseScreen.js`](./mobile_app/src/screens/caretaker/ActiveResponseScreen.js) and [`VolunteerDispatchModal.js`](./mobile_app/src/screens/volunteer/VolunteerDispatchModal.js) — require explicit arrival before responders can resolve.
- [`AlertHistoryScreen.js`](./mobile_app/src/screens/caretaker/AlertHistoryScreen.js) — display the resident safe-confirmation event.
- [`07-cloud-and-alerts.md`](./docs/modules/07-cloud-and-alerts.md), [`09-mobile-app.md`](./docs/modules/09-mobile-app.md), and [`README.md`](./mobile_app/README.md) — update alert behavior documentation.

The report does not claim that unrelated pre-existing worktree changes were reviewed or reverted.

## 7. Free-tier and build constraints

- No Firebase plan upgrade was made. Firestore Authentication, reads/writes, and rules remain the active Spark-tier approach.
- Cloud Functions were not deployed. The existing Firebase response-notification function needs Blaze, so background responder-status pushes continue to use client-side best effort; live Firestore listeners remain authoritative while apps are connected.
- The user's “86% monthly credits” figure could not be tied to a specific service. It should not be treated as an EAS or Firebase measurement without checking the corresponding dashboard.
- An EAS preview APK build was attempted October 21. EAS accepted the upload then rejected the build because the Free-plan Android quota is exhausted; it resets November 1, 2026. No EAS APK was produced.
- At the user's request, a local Android release APK was rebuilt successfully on October 21, 2026, fixing a missing native library crash. Artifact: `mobile_app/android/app/build/outputs/apk/release/app-release.apk` (75,483,688 bytes / 72.00 MiB), SHA-256 `1C1E92881A56C5ED3810FA2E24F7B7B8D0CD4170F3AC851CDC45870CEB4E8F55`. APK signature verification passed for v1 and v2; it has one signer, the local Android Debug certificate (SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`). The APK contains `arm64-v8a`, `armeabi-v7a`, `x86`, and `x86_64` ABIs, including the previously missing `librnscreens.so` for `arm64-v8a` and `armeabi-v7a`.
- The release APK uses the Android package ID `com.insight.fallsafety` and local debug signing, unlike the EAS-signed package. Install it as a fresh app. If Android reports a signature conflict, uninstall the EAS-signed app first; uninstalling removes its local app data, so sign in again.
- The last known EAS APK (`13323182-3730-462f-962c-bb16d36f1abf`) predates these source changes and must not be treated as containing the fixes.
- Earlier work noted that a local Android export failed under low available memory. This report does not claim a new APK exists or that the edited JavaScript has been installed on the three phones.
- Android API 23+ is the configured floor, but no app can be guaranteed to work on every Android vendor/device/network combination. Battery restrictions, Android notification permissions, token freshness, and weak connectivity still affect delivery.

## 8. Validation performed

| Check | Result |
| --- | --- |
| Focused alert-response tests | Passed |
| Full mobile Jest suite | 4 suites, 58 tests passed after the arrival-before-resolution change |
| Babel parsing of changed mobile JavaScript | Passed after correcting a JSX closing-tag error found during validation |
| Firestore emulator rule compilation | Passed |
| Firestore emulator authorization smoke test | Caretaker accept, volunteer accept, and elder safe confirmation passed with absent prior response fields |
| Firestore Rules deployment | Deployed successfully to the configured Firebase project on October 21, 2026, including arrival-before-resolution enforcement |
| `git diff --check` for task-touched files | Passed; only Windows line-ending warnings |
| Android/EAS APK build | EAS preview rejected due to Free-plan quota. Local Gradle release build completed; artifact signature verified and SHA-256 recorded above. The previous build crashed due to a missing native library; this is fixed. |
| Three-phone push/alert acceptance test | Not run in this environment |

The temporary emulator smoke-test script was removed after execution. The smoke test is recorded here; it is not a permanent integration-test target.

## 9. Required three-phone retest

Install the local APK above, which contains the current JavaScript, before evaluating the UI changes. The EAS request was rejected; the previous EAS APK does not contain these changes. The local APK is signed differently and may require uninstalling the EAS app first, which removes its local data. This newly rebuilt APK has successfully launched to the login screen on a connected device.

1. **Prepare notifications:** On caretaker and volunteer phones, sign in, grant notification permission, open the app, and verify the volunteer is On duty. This refreshes their Expo tokens and volunteer directory entry.
2. **Single SOS:** With the apps backgrounded, trigger SOS once. Verify exactly one active alert appears on elder and caretaker feeds. Record whether the caretaker push appears on the first attempt and whether the app reports a missing/rejected push.
3. **Caretaker accept:** Tap “I'm coming.” Verify the transaction succeeds, caretaker status appears in the elder and volunteer feeds, and the caretaker screen shows the resident/room.
4. **Volunteer accept:** On an escalated alert with no caretaker response, accept from the volunteer. Verify the volunteer appears as on the way for both elder and caretaker. Confirm response history remains visible.
5. **Cross-role race:** If the caretaker accepts after a volunteer, verify both roles remain recorded and that a second responder is not falsely hidden.
6. **Elder safe confirmation:** Open the active alert from the elder home and tap “I'm OK — Mark Safe.” Verify the alert leaves all active queues, remains in history/recent updates, displays the elder safe event, and any responder state is still present.
7. **Elder still needs help:** Select “I Need Help.” Verify the alert remains active as `CONFIRMED` on the elder and caretaker feeds and is not silently dropped.
8. **Duplicate guard:** While an alert is active, attempt SOS again. Verify the existing alert opens and no second active alert is created.
9. **Weak-network behavior:** Repeat with mobile data throttled or temporarily unavailable. Verify errors remain visible, no success message is shown for a failed Firestore write, and a locally visible alert is not misrepresented as a confirmed push delivery.
10. **Timing:** Record whether the caretaker modal's 20-second escalation or elder-side call/45-second volunteer timer fires first. Decide and document one intended escalation schedule before changing those timers.

## 10. Remaining risks and follow-up priorities

1. **Device delivery remains unproven.** Re-test first-attempt caretaker pushes on the rebuilt APK, with token-refresh state recorded. Use Expo ticket outcome and device receipt behavior to narrow the remaining issue.
2. **Escalation timers are not unified.** Caretaker modal and elder fallback use independent timers; make one agreed user-facing timeline the source of truth.
3. **Duplicate prevention is not globally atomic.** The client query prevents ordinary repeated taps but not simultaneous creates from separate devices.
4. **Spark limitation remains.** Background status-change pushes from a trusted server are not available without deploying Cloud Functions on Blaze. No cost upgrade is recommended for this project constraint.
5. **App launch is now verified.** The local 71.19 MiB APK was built, its v1/v2 signature verified, and it now successfully launches and renders the login screen on the Vivo Android 16 device. It contains all four configured ABIs; the attempted ARM64-only property did not reduce the APK. Background push delivery and full three-phone flow still need device testing.
6. **Pushes are not emergency-service guarantees.** This is a project/demo workflow, not a monitored dispatch service. Maintain direct call/emergency-service fallbacks and human verification.

## 11. Overall status

The permission-denied responder write path is fixed and emulator-verified; the Firestore Rules are deployed. The elder active-alert/safe-confirmation flow, duplicate-attempt guard, and SOS push feedback are implemented. Responders are restricted to resolving only after marking arrived, per the selected policy. EAS rejected the build because the free quota is exhausted. The local four-ABI release APK is built and now successfully launches and renders the login screen on the Vivo Android 16 device. Device installation, push delivery, and live three-phone behavior remain to be fully verified.



123
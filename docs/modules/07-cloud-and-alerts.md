# Cloud and Alert Delivery Module

## Purpose

The cloud module connects confirmed events to the mobile app. The main file is `src/escalation.py`. It builds alert records in one consistent format and sends them to one or more destinations.

## Alert Destinations

| Destination | When used | File/service |
| --- | --- | --- |
| Local JSON | Always available for local tests and dashboard demos | `logs/alerts.json` or dashboard alert log |
| Firebase Firestore | Available when trusted Firebase credentials are present | Firestore `alerts` collection |
| Expo push | Enabled in live mode when Firebase credentials and recipient push tokens are available | `FirestoreExpoPushNotifier` |

## Alert Information

Every alert includes:

- unique alert ID
- elder ID, name, and room
- event type such as `FALL_IMPACT`, `LONG_LIE_ALERT`, or `MANUAL_SOS`
- status, starting as `CREATED`
- fall probability
- posture and furniture context
- linked caretaker ID
- timestamp and escalation details

The same shape is used by the Python system and mobile app, so the app knows how to display and update each alert.

## Firebase Roles

### Client configuration

`mobile_app/src/config/firebase.js` connects the React Native app to Firebase Authentication and Firestore. It contains Firebase web/client identifiers. Those identifiers let the mobile app talk to the correct Firebase project; they are not the server administrator credential.

### Admin credentials

`firebase-service-account.json` is a secret administrator credential used by the Python runner through `firebase-admin`. It gives the trusted Python computer permission to write Firestore alerts. It is ignored by Git and must stay local.

The runner can also use the standard `GOOGLE_APPLICATION_CREDENTIALS` environment variable instead of the default file location.

## User and Alert Collections

`users` stores app profiles: name, role, phone, pairing code, room, and caretaker/elder links.

`alerts` stores alerts created by the Python system or the Elder SOS action.

## Account Linking

The elder is the anchor account. On registration, the elder gets a pairing code such as `SAFE-ABCD`. A caretaker enters that code. The app writes the relationship in both profiles:

- elder profile: caretaker ID, name, and phone
- caretaker profile: assigned elder ID, name, and room

This allows the caretaker app to query alerts only for their linked elder. Volunteers do not pair; they see alerts only when `escalatedToVolunteers` is true.

## Alert Escalation

1. A new alert is created with status `CREATED`.
2. The caretaker app observes alerts for linked elders through Firestore while open;
   Expo push can notify it in the background when a token is registered and the OS
   permits notifications.
3. An alert remains active until the resident marks safe or an authorized responder marks arrival and then explicitly confirms the resident is safe. A responder accepting does not change the global alert status.
4. Caretaker and volunteer responses are stored separately as `caretakerResponse` and `volunteerResponse`, with `ON_THE_WAY`, `ARRIVED`, or `STOOD_DOWN` state and timestamps.
5. After the escalation countdown, `escalatedToVolunteers` pages on-duty volunteers. The caretaker's active list continues to show the alert and any volunteer who accepted.
6. If the caretaker accepts after a volunteer, both responses remain visible. The volunteer stays marked as on the way until they explicitly stand down or the alert is resolved.
7. `responseEvents` records who accepted, arrived, stood down, or resolved the alert. The volunteer queue moves caretaker-handled alerts to recent updates rather than treating them as unresolved volunteer work.
8. Residents can view their active alerts on the home screen and open one to confirm they are safe or still need help. A resident safety confirmation closes the alert at any time. A caretaker or volunteer may resolve only after explicitly marking `ARRIVED` and confirming the resident is safe. Closure retains caretaker/volunteer response records; resident confirmation adds `elderConfirmation` and a `mark_safe` response event. Caretaker and escalated volunteer feeds observe the update; push delivery is best effort.

The mobile app uses Firestore transactions for responder actions and resident safety confirmation. Firestore rules must allow a first response when response maps and `responseEvents` are not yet present on a newly-created alert; rules guard these optional fields before reading them. `functions/index.js` can send counterpart push notifications when response state changes, but its deployment requires Blaze. On Spark, the Firestore document and live listeners remain the source of truth and the app sends best-effort client-side status pushes. An Expo acceptance receipt is an asynchronous handoff, not proof that the push reached or was seen on the caretaker phone. The camera console reports `EMERGENCY EVENT RECORDED`, not confirmed phone delivery.

## Cloud Utilities

- `test_firebase_sync.py`: writes a safe mock alert, reads it back, lists test alerts, or clears its own test alerts.
- `clear_firestore.py`: deletes all alert documents, user documents, or both. It does not remove Firebase Authentication accounts.

`clear_firestore.py` is destructive. Use it only for a test Firebase project or when you intentionally want a clean test database.

## Before Real Deployment

Deploy the updated Firestore rules and `notifyAlertResponseChanges` function before testing cross-role push updates. Verify the project is on a Firebase plan that supports Cloud Functions. Keep each mobile app signed in for live Firestore updates, grant notification permission for background pushes, and test both caretaker-first and volunteer-first response sequences. Review access rules, rotate any exposed service-account key, and never use a successful push receipt as proof that a person is responding.

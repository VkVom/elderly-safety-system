# Cloud and Alert Delivery Module

## Purpose

The cloud module connects confirmed events to the mobile app. The main file is `src/escalation.py`. It builds alert records in one consistent format and sends them to one or more destinations.

## Alert Destinations

| Destination | When used | File/service |
| --- | --- | --- |
| Local JSON | Always available for local tests and dashboard demos | `logs/alerts.json` or dashboard alert log |
| Firebase Firestore | Available when trusted Firebase credentials are present | Firestore `alerts` collection |

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
2. The caretaker app sees alerts for its linked elder while the app is open.
3. The caretaker can acknowledge or indicate they cannot respond.
4. The app can mark the alert for volunteer escalation after its countdown.
5. On-duty volunteer apps read escalated, still-created alerts.

The current version does not have real background push notifications. For testing, keep the caretaker app open and signed in.

## Cloud Utilities

- `test_firebase_sync.py`: writes a safe mock alert, reads it back, lists test alerts, or clears its own test alerts.
- `clear_firestore.py`: deletes all alert documents, user documents, or both. It does not remove Firebase Authentication accounts.

`clear_firestore.py` is destructive. Use it only for a test Firebase project or when you intentionally want a clean test database.

## Before Real Deployment

Review Firestore security rules, restrict access by user role and linked elder/caretaker relationship, rotate any exposed service-account key, and implement real background notification delivery.

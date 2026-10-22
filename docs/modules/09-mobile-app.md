# Mobile Application Module

## Purpose

`mobile_app/` is an Expo and React Native application. It gives three types of users a simple way to receive and manage safety alerts. It does not run the camera AI; it reads Firebase data created by the Python system.

## Entry and Configuration Files

| File | Purpose |
| --- | --- |
| `App.js` | Starts providers and navigation. |
| `app.json` | App name, Android package ID, iOS bundle ID, Expo owner, EAS project ID, update settings. |
| `eas.json` | Build profiles for preview APK and production Android bundle. |
| `src/config/firebase.js` | Firebase app, Authentication, Firestore, and local session persistence setup. |
| `src/context/AuthContext.js` | Keeps signed-in user profile and role available across screens. |
| `src/navigation/AppNavigator.js` | Selects the correct flow for login, setup, elder, caretaker, and volunteer screens. |

## Roles and Screens

### Older Adult

- `ElderHomeScreen.js`: shows status, a live list of active alerts, and access to SOS.
- `SOSModal.js`: five-second countdown, checks for an existing active alert, then creates `MANUAL_SOS` and reports whether the Expo push request was accepted.
- `CancelAlertScreen.js`: lets a resident confirm they are safe or still need help on a selected alert.
- `RoleSetupScreen.js`: shows the pairing code and saves room/emergency-contact details.

### Caretaker

- `CaretakerHomeScreen.js`: listens only for active `CREATED`, `WARNING`, and `CONFIRMED` alerts assigned to the caretaker.
- `CaretakerAlertModal.js`: alert screen with response actions and escalation countdown; it stays in sync if a volunteer accepts.
- `ActiveResponseScreen.js`: live response state, co-responder updates, arrival, and resolution actions.
- `AlertHistoryScreen.js`: past alert information.
- `ElderDetailsScreen.js`: linked elder details and unlink action.

### Volunteer

- `VolunteerHomeScreen.js`: on-duty toggle, active escalated alerts, active responses, and the latest ten updates.
- `VolunteerDispatchModal.js`: accepts, tracks, stands down, or resolves an escalated emergency.

## Shared UI and Services

- `src/components/`: reusable buttons, cards, text fields, status labels, and screen layout.
- `src/theme.js`: common colours, spacing, typography, and event labels.
- `src/services/linking.js`: pairing-code generation, elder lookup, caretaker link, and unlink logic.

## Authentication and Pairing

The app uses Firebase Email/Password Authentication. Each account also gets a Firestore profile.

1. The elder creates an account and receives a pairing code.
2. The elder shares the code with the caretaker.
3. The caretaker enters the code, confirms the elder's identity, and links.
4. The caretaker home screen now listens only for that elder's alerts.
5. A volunteer account needs no code; it sees escalated alerts while on duty.

## Build and Run

For development:

```powershell
cd mobile_app
npm ci
npx expo start
```

For an installable Android preview APK:

```powershell
cd mobile_app
npx eas build -p android --profile preview
```

The EAS project owner and IDs in `app.json` must belong to the team building the app. Do not change released Android/iOS IDs casually, because app stores treat them as the app's permanent identity.

The preview APK includes 32-bit and 64-bit ARM native libraries for Android phones and omits emulator-only x86 libraries. The unused Expo development launcher is excluded from the app build. React Native 0.74 requires Android 6.0 (API 23) or later; support for every Android device cannot be guaranteed.

Home-screen listeners filter to active alerts so completed alert history is not continuously downloaded. The volunteer screen separately listens to the active queue and the ten most recently updated escalated alerts. These queries require the composite indexes in `firestore.indexes.json`; deploying those indexes uses Firestore and does not require Cloud Functions or the Blaze plan.

## Alert Response Behavior

Accepting an alert is a responder state, not a global alert closure. The alert stays in the caretaker's active list until explicitly resolved. Caretaker and volunteer responses are tracked separately; if the caretaker responds after a volunteer is already on the way, the volunteer remains visible until explicit stand-down or resolution. The volunteer queue records caretaker-handled alerts in recent updates.

`alertResponses.js` uses Firestore transactions for responder actions and the resident's safe confirmation, appending timestamped `responseEvents` without removing responder state. Rules guard optional fields that are absent on newly-created alerts. The Firestore-triggered response notification function is not deployed on the Spark plan; responder state changes are live in the app while connected. Existing SOS, volunteer-escalation, and resident-update pushes are client-triggered and best effort; the alert document's live state is authoritative. Repeated SOS attempts reuse the visible active alert rather than creating another one when the client can read the current alert feed.

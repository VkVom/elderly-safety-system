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

- `ElderHomeScreen.js`: shows status and access to SOS.
- `SOSModal.js`: five-second countdown, then creates `MANUAL_SOS` in Firestore.
- `CancelAlertScreen.js`: allows a false alarm to be cancelled/managed.
- `RoleSetupScreen.js`: shows the pairing code and saves room/emergency-contact details.

### Caretaker

- `CaretakerHomeScreen.js`: listens only for `CREATED` alerts where `elderId` matches the linked elder.
- `CaretakerAlertModal.js`: alert screen with response actions and escalation countdown.
- `ActiveResponseScreen.js`: response state after an action.
- `AlertHistoryScreen.js`: past alert information.
- `ElderDetailsScreen.js`: linked elder details and unlink action.

### Volunteer

- `VolunteerHomeScreen.js`: on-duty toggle and list of escalated alerts.
- `VolunteerDispatchModal.js`: accepts or manages an escalated emergency.

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

## Current Limitation

Alerts appear live through Firestore listeners while the application is open. `expo-notifications` is installed but background push notification delivery is not wired up yet. Keep the caretaker app open during the current test flow.

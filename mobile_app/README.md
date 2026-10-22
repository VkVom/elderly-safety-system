# UpSupport — Mobile App (Expo / React Native)

Role-based mobile client for the Proactive Elderly Safety System. Consumes the
`alerts` Firestore collection produced by the Python backend (`src/escalation.py`).

## Roles
- **elder** — live status, giant SOS button, active-alert list, and per-alert safe/help confirmation.
- **caretaker** — monitoring hub, full-screen emergency modal with 20s auto-escalation.
- **volunteer** — community responder queue for escalated alerts.

Residents can open an active alert to mark themselves safe or confirm they still
need help. A safe confirmation closes that alert while preserving responder
history. Repeated SOS attempts first check for an existing active alert to avoid
creating a second one. Push delivery is best effort; the Firestore alert is the
source of truth.

## Setup
```bash
cd mobile_app
npm install
```

### Firebase config (required before it runs against real data)
The Firebase web configuration in `src/config/firebase.js` contains client-side
identifiers only. Confirm that the project belongs to your team, then enable
Email/Password Auth and Firestore in that Firebase project. Never put the Firebase
Admin service-account JSON or app signing keys in this folder or in Git.

## Run in Expo Go

Expo Go is suitable only for screens and behavior that do not require this
project's native call module or native notification integrations. It must also
match the project's Expo SDK version (currently SDK 51).

```bash
npx expo start
```

## Android development build

Use a development build to test custom native modules, real calling, and native
notifications. Install Android Studio/Android SDK and a compatible JDK, connect
an Android device with USB debugging enabled (or start an emulator), then from
this directory run:

```bash
npm install
```

Stop any existing Expo/Metro server first, then build and install the native
Android debug app:

```bash
npx expo run:android
```

This generates the native Android project when needed, builds and installs the
debug app, and starts Metro. Run it again to launch the app with Metro on a later
session. Rebuild after changing native dependencies, app config plugins,
permissions, or native module code.

On Windows, if prebuild fails because an unrelated global `sharp-cli` version
conflicts with Expo's image tooling, set Expo's supported fallback for that
build in PowerShell:

```powershell
$env:EXPO_IMAGE_UTILS_NO_SHARP = "1"
npx expo run:android
Remove-Item Env:EXPO_IMAGE_UTILS_NO_SHARP
```

An internal development-channel APK can also be built with:

```bash
npx eas build --platform android --profile development
```

This APK uses its bundled JavaScript and does not connect to a local Metro server.
The custom `insight-call` Expo module is a local package under `modules/`; keep it
installed as a dependency so Expo autolinking includes it in native builds.

### Google sign-in and push notification setup

For Google sign-in, verify the configured Android OAuth client matches this
app's Android package and signing certificate. A local debug build and an EAS
build use different signing certificates unless configured otherwise. Remote
push notifications require a physical device and valid Expo/Firebase credentials;
simulator or emulator behavior may differ.

## App identifiers
The current Expo owner, EAS project ID, iOS bundle ID, and Android package ID are
defined in `app.json`. Keep these IDs stable after release. Change them only when
you create a new Expo/Firebase/mobile application owned by your team.

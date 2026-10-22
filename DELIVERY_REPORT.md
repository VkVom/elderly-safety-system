# INSIGHT-Fall Delivery Report

Date: 2026-10-14  
Project: `elderly-safety-system`  
Firebase project: `insight-fall-safety`  
Android package: `com.insight.fallsafety`

## Current Build Status

Latest corrected Android preview build:

```text
https://expo.dev/accounts/vkvom/projects/insight-fall-safety/builds/2136ce6d-9f71-4691-b8bb-c2079a8423d7
```

Status at last check: `in queue`

This is the build you should download once Expo finishes it. It includes:

- Firebase Android app package `com.insight.fallsafety`
- `google-services.json`
- Android Google OAuth client ID
- Web Google OAuth client ID
- Email/password auth screens
- Google sign-in/sign-up screens
- Push notification registration
- Caretaker alarm audio
- No-Blaze client-side elder/caretaker pairing
- Dashboard real-value fixes

Previous finished APK, usable for basic testing but not the final Google-config build:

```text
https://expo.dev/artifacts/eas/ctScKm3h1LSdyEy893jewRdiVLfdCgUxA2a5Mvsgp7Y.apk
```

## Firebase Setup Done

- Email/password provider enabled.
- Google provider setup completed in Firebase Console.
- Android app registered with package:

```text
com.insight.fallsafety
```

- SHA-1 fingerprint was collected from EAS credentials.
- Updated `google-services.json` placed in:

```text
mobile_app/google-services.json
```

- Expo config updated in:

```text
mobile_app/app.json
```

Important config now present:

- `android.googleServicesFile`
- Google Web client ID
- Google Android client ID

## No-Blaze Decision

You decided not to upgrade Firebase to Blaze now. Because of that:

- Cloud Functions are not required for the demo.
- Server-side pairing-code rate limiting is not deployed.
- Pairing now works directly from the mobile app using a Firestore `limit(1)` query.
- Firestore rules were adjusted to allow this demo pairing flow.

Deploy only Firestore rules from your own terminal:

```powershell
firebase deploy --only firestore:rules --project insight-fall-safety --token $env:FIREBASE_TOKEN
```

Do not deploy Functions unless you upgrade to Blaze.

## Work Completed

- Added Google sign-in and Google sign-up support.
- Added email/password sign-up with email verification.
- Added forgot/reset password email flow.
- Added Expo push token registration.
- Added emergency notification channel for Android.
- Added caretaker alert alarm sound loop using `alarm.wav`.
- Wired Python escalation to send Expo push notifications when a user has a token.
- Kept manual SOS and fall alert paths compatible with Firestore.
- Reworked pairing to avoid Cloud Functions for the current prototype.
- Fixed dashboard fake/default values.
- Updated mobile alert screens to show `N/A` instead of fake `0%` when fall probability is unavailable.
- Updated EAS upload ignore rules so heavy files are excluded.

## Validation Completed

Python escalation regression:

```text
PASS Bed ADL clip: 0 false alarms
PASS Chair fall clip: 1 FALL_IMPACT
PASS Low-light fall clip: 1 FALL_IMPACT
PASS Expo push payload test
```

Expo checks:

```text
npx expo-doctor
16/16 checks passed

npx expo install --check
Dependencies are up to date
```

Dashboard/pipeline checks:

- Dashboard no longer shows fake initial zero values.
- `P(fall)` shows unavailable/warming state until the model produces output.
- Velocity and jerk show unavailable until enough frames exist.
- Alert history maps missing fall probability to `N/A`.

## End-to-End Test Plan

### 1. Install Latest APK

Open the latest EAS build:

```text
https://expo.dev/accounts/vkvom/projects/insight-fall-safety/builds/2136ce6d-9f71-4691-b8bb-c2079a8423d7
```

When status becomes `finished`, download the APK and install it on Android.

### 2. Test Authentication

Email/password:

1. Sign up with email and password.
2. Check email inbox.
3. Open Firebase verification email.
4. Return to app and log in.
5. Use forgot password from login screen and confirm reset email arrives.

Google:

1. Tap Google sign-up.
2. Choose Google account.
3. Complete profile role selection.
4. Sign out.
5. Tap Google login.
6. Confirm it opens the correct role dashboard.

### 3. Test Three Roles

Elder:

1. Create/login as elder.
2. Confirm elder home opens.
3. Note the `SAFE-XXXX` pairing code.
4. Test manual SOS.

Caretaker:

1. Create/login as caretaker.
2. Enter elder pairing code.
3. Confirm elder appears as linked.
4. Confirm caretaker monitoring screen receives alerts.

Volunteer:

1. Create/login as volunteer.
2. Set volunteer availability/on-duty.
3. Wait for escalated alert after caretaker timeout.

### 4. Test Realtime Fall Flow

List elders:

```powershell
venv\Scripts\python.exe run_live.py --list-elders
```

Run a known fall clip:

```powershell
venv\Scripts\python.exe run_live.py --video data\manual_test_videos\gmdcsa24_s1_fall_chair_partial_original.mp4 --elder <ELDER_UID>
```

Or use webcam:

```powershell
venv\Scripts\python.exe run_live.py --camera --elder <ELDER_UID>
```

Expected result:

1. Fall is detected by Python pipeline.
2. Alert is written to Firestore.
3. Caretaker receives alert modal.
4. Alarm sound and vibration start.
5. 20-second countdown begins.
6. If caretaker does not accept, alert escalates to volunteers.
7. On-duty volunteer receives dispatch modal.

### 5. Test Dashboard

Run:

```powershell
venv\Scripts\streamlit.exe run dashboard\app.py
```

Check:

- Live state updates.
- `P(fall)` is not fake `0%`.
- Metrics show `N/A` until real data exists.
- Alert log shows real Firestore/logged alert values.

## Notes

- The current setup is suitable for demo/prototype use.
- Production-grade pairing rate limiting requires Cloud Functions, which requires Firebase Blaze.
- Email/password and Google auth do not require Blaze.
- Firestore rules deployment does not require Blaze.
- EAS Android builds do not require Blaze.


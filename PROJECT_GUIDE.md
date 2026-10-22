# Elderly Safety System: Simple Run Guide

This project processes a camera stream on the computer running the detector. Confirmed event metadata can be written to Firebase and sent by Expo push; video frames are not uploaded. The caretaker app also observes linked alerts in Firestore while open. If the caretaker does not respond, the alert can be shared with on-duty volunteers.

## Before You Start

You need a Windows computer with Python, Node.js, and a camera or test video. For phone testing, use an Android phone with the project APK installed.

From the project root, create and activate the Python environment once:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

The live camera system also needs these local files:

- `models/m3_temporal_fall.onnx`
- `models/m3_norm.npz`
- `firebase-service-account.json` at the project root, or `GOOGLE_APPLICATION_CREDENTIALS` pointing to it, when routed alerts must reach Firebase

These files are intentionally not stored in GitHub. Put them on the computer running the Python system. The Firebase service-account file must never be uploaded to GitHub.

## Project Flow

```text
Camera or video (processed on the camera host)
      |
      v
M1: finds the person and nearby furniture
      |
      v
M2: measures movement, tilt, speed, and jerk
      |
      v
M3: estimates fall probability
      |
      v
M4: confirms down-state evidence before raising an alert
      |
      v
Local alert record + (production mode) Firestore record and Expo push
      |
      +--> Caretaker app: live Firestore update and push notification
      |
      +--> Volunteer app: push after caretaker escalation
```

The three user roles are:

- **Older Adult:** has an SOS button and a pairing code.
- **Caretaker:** links to one older adult using the pairing code and receives their alerts.
- **Volunteer:** can turn on duty status and receive escalated alerts.

## Run the Dashboard

The dashboard is a local visual demo. It plays a prepared video and shows the camera view, pose skeleton, fall probability, movement values, system state, and local alert log.

1. Open PowerShell in the project root.
2. Activate the Python environment.
3. Start the dashboard:

```powershell
.\.venv\Scripts\Activate.ps1
python -m streamlit run dashboard/app.py
```

4. Open the local address shown in PowerShell, usually `http://localhost:8501`.
5. Choose a test clip in the left panel and select **Play**.

If the dashboard says a clip is missing, copy the test videos into `data/manual_test_videos/`. These video files are not included in GitHub because they are large.

## Run a Laptop Webcam

First create an elder account and link it to a caretaker account. The elder ID is needed so the system sends the alert to the correct caretaker.

To list elder IDs:

```powershell
.\.venv\Scripts\Activate.ps1
python run_live.py --list-elders
```

The list shows each resident's linked caretaker and whether a push token is present.
Use the exact resident UID shown there. Pair the older-adult and caretaker accounts
first. On the caretaker phone, sign in, allow notifications, and open the app once so
it can register its Expo push token. The camera process resolves the caretaker from
the selected resident; `--caretaker` is only a debug override.

To start the default laptop camera:

```powershell
python run_live.py --camera --elder YOUR_ELDER_UID
```

Replace `YOUR_ELDER_UID` with the ID displayed by the previous command. The camera preview opens in a separate window. Press `Q`, `Esc`, or `Ctrl+C` to stop it.

For a local-only test that does not send alerts to Firebase:

```powershell
python run_live.py --camera --elder local-camera-test --no-firestore
```

With `--no-firestore`, the runner makes no Firebase resident lookup or push request.
`--elder` is only a local log label in this mode; it does not route an alert. Live
camera read failures trigger retries with increasing delays (1s, 2s, 4s, up to 30s).
The runner prints when the feed is lost and reopened, then clears motion history. It
does not yet notify the caretaker that a camera is offline.

Local mode still processes frames on this computer and writes event records under
`logs/`; it does not write or send video frames. Use it to verify camera access and
the visual pipeline before configuring Firebase routing.

## Run a Remote Phone Camera

The phone camera must provide an MJPEG or RTSP video stream. A common approach is to install an IP-camera streaming app on an old Android phone.

1. Connect the computer and camera phone to the same Wi-Fi network.
2. Open the IP-camera app on the camera phone and start its server/stream.
3. In that app, find the stream address. It might look like `http://192.168.1.5:8080/video`.
4. Test that address in the computer browser first. You should see the phone camera video.
5. Run the Python system with that exact address:

```powershell
python run_live.py --url "http://192.168.1.5:8080/video" --elder YOUR_ELDER_UID
```

6. Keep the camera phone awake, charging, and facing the monitored area. Press `Q`, `Esc`, or `Ctrl+C` on the computer to stop.

The phone used as a camera does not need the INSIGHT app installed. It only sends video to the computer. The computer runs the AI model and creates alerts.

The camera runner currently monitors one camera for one selected resident per process. It is an edge program that must stay running on the computer; the mobile app does not yet configure or supervise cameras. Keep camera credentials private and do not paste credential-bearing RTSP URLs into shared logs or screenshots. A lost stream is retried locally, but the caretaker is not yet notified that monitoring has gone offline.

For CCTV/NVR, use the RTSP URL supplied by the camera/NVR administrator only if the
computer running this process can reach it on the local network. Keep the stream on
that private network; this design processes frames on the computer and sends event
metadata to Firebase. Do not expose the stream URL or its credentials in screenshots
or shared logs.

## Run With a Saved Video

Use this mode for a repeatable demo:

```powershell
python run_live.py --video "data/manual_test_videos/your-video.mp4" --elder YOUR_ELDER_UID
```

## Install and Open the Android APK

The APK is the installable Android app. Build it first if you do not already have an APK:

```powershell
cd mobile_app
npm ci
npx eas build -p android --profile preview
```

The build service gives you a download link. Open that link on each Android phone, download the APK, and install it. Android may ask you to allow installation from the browser or file manager. Allow it only for the app you used to download the APK.

After installation:

1. Open **INSIGHT-Fall Safety**.
2. Create an account or sign in.
3. Use a different email address for each test role.
4. Sign in as the caretaker, allow notifications, and open the app once so its Expo push token is registered. Firestore updates work while the app is open; configured Expo pushes can notify it in the background, subject to phone permissions and OS delivery.

For development without an APK, start Expo from the computer:

```powershell
cd mobile_app
npm ci
npx expo start
```

Use the QR code with Expo Go only for basic development checks. Use a freshly built APK for the full installed-app test.

## Create and Link Test Accounts

Do this in order on separate phones, or log out and reuse one phone.

### 1. Create the Older Adult Account

1. Open the app and choose **Create Account**.
2. Enter a name, email, phone number, and password.
3. Choose **Older Adult** and select **Register Account**.
4. The setup screen displays a code such as `SAFE-ABCD`.
5. Enter the room number and emergency contact, then select **Save & Continue**.
6. Share the pairing code with the caretaker.

### 2. Create the Caretaker Account

1. Open the app on the caretaker phone and choose **Create Account**.
2. Use a different email address.
3. Choose **Caretaker** and register.
4. Enter the older adult's pairing code.
5. Select **Find Resident**.
6. Check the name and room, then select **Confirm & Link**.

The caretaker dashboard should now show the linked older adult.

### 3. Create the Volunteer Account

1. Create another account with a different email address.
2. Choose **Volunteer** and register.
3. Open the volunteer home screen and leave **On Duty** turned on.

Volunteers do not use a pairing code. They see alerts only after the caretaker escalation timer finishes.

## Test the App Without a Camera

You can test the normal app alert path using the Older Adult's SOS button.

1. Sign in as the linked older adult.
2. Select the large SOS button.
3. Wait for the five-second countdown, or cancel it with **I'm OK**.
4. Keep the caretaker app open and signed in.
5. After the countdown, the caretaker should see the emergency alert.
6. The caretaker can acknowledge the alert or mark **I Can't Respond**.
7. If no caretaker response is made during the alert timer, the alert is escalated to on-duty volunteers.

## Test the Full Camera-to-App Alert

1. Confirm that the older adult and caretaker accounts are linked.
2. Keep the caretaker app open on the caretaker phone.
3. Start the laptop webcam or remote phone camera command with the correct elder ID.
4. Use a labeled fall video long enough to include at least 3 seconds after the person
   reaches the floor. Do not ask a real person to fall.
5. For a no-cloud video-to-alert contract check, run:

   ```powershell
   python test_video_to_alert.py
   ```

   This uses a local alert sink and mocked push transport; it does not contact Firebase
   or deliver a real push.
6. For a live routed test, configure the service account as described above and run
   `python run_live.py --url "STREAM_URL" --elder YOUR_ELDER_UID`. The console says
   `EMERGENCY EVENT RECORDED`; it does not prove that a phone received the alert.
7. Check the caretaker app and its notification settings. The app must be linked to
   the selected resident and have notification permission. A push accepted by Expo
   may still be delayed or not shown by the phone; verify receipt on the device.

## Important Safety Notes

- This is a prototype, not a replacement for emergency services or human supervision.
- Test with videos or a controlled environment. Do not create unsafe falls for testing.
- Firebase security rules must be reviewed and locked down before any real deployment.
- Never upload `firebase-service-account.json`, APK signing keys, datasets, trained model files, or `node_modules` to GitHub.

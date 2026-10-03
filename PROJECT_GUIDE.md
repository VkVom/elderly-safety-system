# Elderly Safety System: Simple Run Guide

This project watches a camera for a possible fall. When it detects a serious fall, it creates an alert in Firebase. The caretaker app shows the alert and the caretaker can respond. If the caretaker does not respond, the alert can be shared with volunteers.

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
- `firebase-service-account.json` when alerts must reach Firebase

These files are intentionally not stored in GitHub. Put them on the computer running the Python system. The Firebase service-account file must never be uploaded to GitHub.

## Project Flow

```text
Camera or video
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
M4: decides whether this is a real fall
      |
      v
Firebase alerts collection
      |
      +--> Caretaker app: receives and responds to the alert
      |
      +--> Volunteer app: receives alert only after caretaker escalation
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

To start the default laptop camera:

```powershell
python run_live.py --camera --elder YOUR_ELDER_UID
```

Replace `YOUR_ELDER_UID` with the ID displayed by the previous command. The camera preview opens in a separate window. Press `Q`, `Esc`, or `Ctrl+C` to stop it.

For a local-only test that does not send alerts to Firebase:

```powershell
python run_live.py --camera --elder YOUR_ELDER_UID --no-firestore
```

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
4. Keep the caretaker app open during a live alert test. The current version uses an in-app Firebase listener; it does not yet send background push notifications.

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
4. Trigger a safe, controlled test with an approved test video. Do not ask a real person to fall.
5. When the system detects a fall, the computer preview shows `ALERT SENT`.
6. Confirm that the caretaker app opens the emergency alert screen.

## Important Safety Notes

- This is a prototype, not a replacement for emergency services or human supervision.
- Test with videos or a controlled environment. Do not create unsafe falls for testing.
- Firebase security rules must be reviewed and locked down before any real deployment.
- Never upload `firebase-service-account.json`, APK signing keys, datasets, trained model files, or `node_modules` to GitHub.

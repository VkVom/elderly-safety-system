# System Overview

## Purpose

The Elderly Safety System is a prototype that watches a camera feed and looks for signs of a fall. It is designed to give a caretaker an early warning. It is not emergency medical equipment and must not replace human supervision or emergency services.

## The Big Picture

```text
Camera / saved video
  -> Python live runner
  -> M1: pose and furniture
  -> M2: body movement values
  -> M3: machine-learning fall score
  -> M4: safety confirmation rules
  -> Firebase alert record
  -> caretaker app, then volunteer app if escalated
```

## Main Parts

| Part | Location | Job |
| --- | --- | --- |
| Live runner | `run_live.py` | Opens a camera, video, or network stream and connects all AI modules. |
| M1 | `src/m1_perception.py` | Finds one person's 33 body landmarks and nearby bed/chair/couch context. |
| M2 | `src/m2_kinematics.py` | Converts body landmarks into movement measurements. |
| M3 | `src/m3_temporal_model.py` | Uses recent movement history to estimate fall probability. |
| M4 | `src/m4_state_machine.py` | Checks whether the event is serious enough to alert. |
| Cloud alerts | `src/escalation.py` | Creates a standard alert and stores it locally or in Firestore. |
| Dashboard | `dashboard/` | Local visual demonstration of the pipeline. |
| Mobile app | `mobile_app/` | Elder, caretaker, and volunteer app. |

## What Happens During a Fall

1. A camera frame enters the Python program.
2. M1 finds the person and checks whether they are near a bed, couch, or chair.
3. M2 measures body angle, downward movement, acceleration, and other motion features.
4. M3 reads a short history of these measurements and gives a score from 0 to 1.
5. M4 waits for evidence that the person actually went down and stayed down. This prevents many false alarms caused by bending, sitting, or lying in bed.
6. If confirmed, the cloud module writes an alert with the elder's identity, room, fall score, and status.
7. A caretaker who is signed in and has the app open sees the alert. An unanswered alert can be escalated to an on-duty volunteer.

## What Is Stored

- The Python modules process camera frames in memory. M1 does not keep a copy of raw video frames.
- The local dashboard writes test alerts to `logs/dashboard_alerts.json`.
- The live runner can write real alerts to Firebase Firestore.
- Firebase stores user profiles in `users` and alerts in `alerts`.

## Important Boundaries

- The computer runs the AI. A remote phone camera only sends video to the computer.
- The mobile app does not run fall detection itself; it reads and updates alert records.
- Firebase web configuration is used by the mobile app. The Firebase Admin service-account JSON is used only on the trusted computer running the Python service.

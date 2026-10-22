# 06 Mobile app and dashboard

Navigation in mobile_app/src/navigation/AppNavigator.js:
| Screen | Role/purpose |
|---|---|
| LoginScreen / SignupScreen | all roles auth |
| RoleSetupScreen | elder room/emergency phone; caretaker pairing; volunteer setup |
| VerifyEmail, ForgotPassword, SetupFailed | auth support |
| ElderHomeScreen | active alerts, SOS, caretaker link |
| SOSModal | countdown/cancel, duplicate query, create SOS |
| CancelAlertScreen | safe/help confirmation |
| CaretakerHomeScreen | resident/alert overview |
| CaretakerAlertModal | incoming alert/response |
| ActiveResponseScreen | arrival/resolution |
| AlertHistoryScreen | history |
| ElderDetailsScreen | resident detail |
| ManageResidentsScreen | pair/unlink |
| VolunteerHomeScreen | duty and escalated queue |
| VolunteerDispatchModal | accept/arrive/resolve/stand down/call |

Mobile SOS creates alert; safe/help/respond updates via alertResponses; pairing writes linked profiles; duty toggle updates user/directory; push registration stores tokens. Notification permission requested; Android call permissions include CALL_PHONE, READ_PHONE_STATE and optional ANSWER_PHONE_CALLS. No camera/GPS permission. Emergency phone collected during setup; no general settings editor. Emergency services link hard-coded tel:911.

Dashboard panels: three fixed clips; cloud routing and elder picker; speed .5–4 default 2; render interval 1–6 default 2; width choices 480/640/800/960; play/stop, clear log, video overlay, M4 state, tilt, vertical velocity, jerk, event table. Fall probability widget NOT IMPLEMENTED though comment says otherwise.

Screenshot shot list: Dashboard idle/run; mobile login; notification permission on fresh install; live pose overlay by running webcam; normal walking STAND_WALK; warning with qualifying clip; SOS countdown; real caretaker notification; on-way/arrived/resolved after response actions; volunteer queue after duty on; emergency contact during elder setup (redact); caretaker history. General settings screenshot not possible because screen absent. No screenshots captured this session.

~~~mermaid
flowchart LR
 Camera --> Runner[Python run_live]
 Runner --> M1 --> M2 --> M3[ONNX] --> M4 --> Gateway
 Gateway --> JSON[(Local log)]
 Gateway --> FS[(Firestore)]
 Gateway --> Expo[Push]
 FS <--> App[Role mobile app]
 Expo --> App
 Dashboard[Streamlit replay] --> M1
~~~
~~~mermaid
flowchart LR
 Camera --> M1 --> M2 --> M3 --> M4 --> Gateway
 Gateway --> Local[(JSON)]
 Gateway --> Cloud[(Firestore)]
 Gateway --> Push[Expo]
 Cloud --> Apps[Mobile feeds]
 Push --> Apps
 Apps -->|responses| Cloud
~~~
~~~mermaid
flowchart LR
 Elder --> SOS((SOS))
 Elder --> Safe((Safe/help))
 Caretaker --> Respond((Accept/arrive/resolve))
 Volunteer --> Respond
 Volunteer --> Duty((On duty))
 Caretaker --> Pair((Pair resident))
 Operator --> Replay((Select clip))
~~~
~~~mermaid
sequenceDiagram
 participant C as Camera
 participant R as Python runner
 participant M as M1-M4
 participant G as Gateway
 participant F as Firestore/Expo
 participant A as Caretaker app
 C->>R: frame/time
 R->>M: pose/features/score
 M-->>R: event
 R->>G: handle event
 G->>F: write alert/push request
 F-->>A: listener or notification
 A->>F: response update
~~~
~~~mermaid
stateDiagram-v2
 [*] --> STAND_WALK
 STAND_WALK --> PRE_FALL: p>.40 or vy>1.2 and tilt>35
 PRE_FALL --> CONFIRMING: impact or lost pose
 PRE_FALL --> STAND_WALK: recover/latch expiry
 CONFIRMING --> POST_FALL_MONITOR: down evidence 1.3/2.5s
 CONFIRMING --> STAND_WALK: recovery/rest surface
 POST_FALL_MONITOR --> LONG_LIE_ALERT: 180s down
 POST_FALL_MONITOR --> STAND_WALK: upright 1s
~~~
~~~mermaid
erDiagram
 USERS ||--o{ ALERTS : elderId
 USERS ||--o{ ALERTS : caretakerId
 USERS ||--o{ VOLUNTEER_DIRECTORY : mirrored
 USERS { string role string name string roomLocation string caretakerId boolean onDuty }
 ALERTS { string eventType string status number tier number fallProbability boolean escalatedToVolunteers }
~~~
~~~mermaid
flowchart TD
 A[Frame] --> B{Pre-fall?}
 B -- no --> A
 B -- yes --> C[Tier 1 warning]
 C --> D{Impact/lost pose?}
 D -- recover --> E[Tier 0 cancel]
 D -- yes --> F[Confirm down]
 F --> G{Recovered/rest surface?}
 G -- yes --> E
 G -- no --> H{Time met?}
 H -- no --> F
 H -- yes --> I[Tier 2 emergency]
 I --> J{180s down?}
 J -- yes --> K[Tier 3 volunteer]
~~~
## Primary references
- Navigation registrations: mobile_app/src/navigation/AppNavigator.js:112–183.
- Role screens: mobile_app/src/screens/auth/RoleSetupScreen.js; mobile_app/src/screens/elder/ElderHomeScreen.js and SOSModal.js; mobile_app/src/screens/caretaker/; mobile_app/src/screens/volunteer/.
- Dashboard controls/render: dashboard/app.py:38–270.
- Notification/call permissions and services: mobile_app/app.json:18–29; mobile_app/src/services/notifications.js; autoCall.js; modules/insight-call/android/src/main/java/expo/modules/insightcall/InsightCallModule.kt.

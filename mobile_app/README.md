# INSIGHT-Fall Safety — Mobile App (Expo / React Native)

Role-based mobile client for the Proactive Elderly Safety System. Consumes the
`alerts` Firestore collection produced by the Python backend (`src/escalation.py`).

## Roles
- **elder** — live status, giant SOS button, "I'm OK" false-alarm cancel.
- **caretaker** — monitoring hub, full-screen emergency modal with 20s auto-escalation.
- **volunteer** — community responder queue for escalated alerts.

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

## Run
```bash
npx expo start
```
Then press `a` (Android), `i` (iOS), or `w` (web).

## App identifiers
The current Expo owner, EAS project ID, iOS bundle ID, and Android package ID are
defined in `app.json`. Keep these IDs stable after release. Change them only when
you create a new Expo/Firebase/mobile application owned by your team.

# M4: Safety Decision Engine

## Purpose

M4 is in `src/m4_state_machine.py`. It is the final safety filter. It combines M1 furniture context, M2 motion values, and M3 fall probability before deciding whether to create an alert.

## Why It Is Needed

A high machine-learning score alone can be wrong. M4 adds easy-to-audit safety rules: did the person move down quickly, become horizontal, stay down, recover, or lie on a bed/couch?

## States

| State | Meaning |
| --- | --- |
| `STAND_WALK` | Normal upright activity. |
| `PRE_FALL` | Warning signs such as balance loss or rapid tilt. No alert yet. |
| `CONFIRMING` | Possible impact or pose loss; waits to see whether the person stays down. |
| `POST_FALL_MONITOR` | A fall alert was confirmed. The system watches for recovery or long lying. |
| `LONG_LIE_ALERT` | The person remained down long enough to require an additional alert. |

## Decision Process

1. A strong tilt, downward movement, or model score can enter `PRE_FALL`.
2. An impact-like signal or loss of pose can enter `CONFIRMING`.
3. If the person gets upright quickly, the engine returns to normal without an alert.
4. If the person remains down past the confirmation time, M4 creates `FALL_IMPACT` or `POSE_LOST_WHILE_FALLEN`.
5. If the person stays down for a longer period, M4 can create `LONG_LIE_ALERT`.

## False-Alarm Protection

- A person lying on a detected bed or couch is treated as normal resting unless there is strong impact evidence.
- A temporary bend or exercise movement is ignored when the person becomes upright before the confirmation timer ends.
- The hip location is checked against remembered `rest_surface` furniture boxes.

## Output

M4 returns the current state, a true/false alert flag, an alert type, and small diagnostic values such as down timer and recent maximum tilt. `src/escalation.py` receives only fresh confirmed alert events.

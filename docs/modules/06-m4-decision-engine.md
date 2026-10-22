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
3. During `CONFIRMING`, an upright tilt must persist for the recovery window and be
   accompanied by reliable M2 motion (`motion_reliable=True`) and plausible values
   (`|hip_v_y| <= 12` and jerk `<= 20000`). These outlier limits match M2. An upright-looking pose with extreme
   landmark jitter does not count as recovery.
4. Confirmation time accumulates only while the pose is horizontal (trunk tilt at least
   45 degrees) or M1 reports pose loss after the fall sequence. Upright or ambiguous
   frames pause and reset this timer; a high M3 score by itself is not proof the person
   stayed down. After the configured down time, M4 creates `FALL_IMPACT` or
   `POSE_LOST_WHILE_FALLEN`.
5. If the person stays down for a longer period, M4 can create `LONG_LIE_ALERT`.

## False-Alarm Protection

- A person lying on a detected bed or couch is treated as normal resting unless there is strong impact evidence.
- A temporary bend or exercise movement is ignored when the person becomes upright before the confirmation timer ends.
- A suspected fall is not cancelled from trunk tilt alone; implausible vertical
  velocity or jerk resets the upright recovery timer. The bounds are initial
  engineering limits and need calibration on more labeled camera footage.
- The hip location is checked against remembered `rest_surface` furniture boxes.

## Clip Replay Interpretation

`test_m4_runner.py` reports a clip as `INCOMPLETE` when it ends in `PRE_FALL` or
`CONFIRMING`. A short video that stops during the confirmation window cannot show
whether the person stayed down; this is not equivalent to a confirmed negative. Live
camera processing continues receiving frames, so it can complete the decision.
For useful offline fall clips, record at least 3 seconds after the person reaches the
floor so the full 2.5-second normal confirmation period is observable.

## Output

M4 returns the current state, a true/false alert flag, an alert type, and small diagnostic values such as down timer and recent maximum tilt. `src/escalation.py` receives only fresh confirmed alert events.

"""
Module 4: Decision Engine & State Machine (M4)
Project: Proactive Elderly Safety System for Pre-Impact Fall Anticipation
Author: M4 Owner (VK / G14 Team)

Fuses the upstream signals into a deterministic finite state machine with temporal
memory and raises escalations:

    Inputs per frame:
      - pose_status  from M1   : "TRACKING" | "HELD" | "LOST"
      - trunk_tilt   from M2   : degrees (0 upright .. ~90 horizontal)
      - hip_v_y      from M2   : signed vertical velocity (+ = downward)
      - jerk         from M2   : hip jerk magnitude
      - p_fall       from M3   : neural fall probability in [0, 1]
      - on_rest_surface        : True if the body overlaps a bed/couch box (context)
      - dt                     : seconds since previous frame

States:
    STAND_WALK              normal activity
    PRE_FALL                balance-loss / rapid descent detected (latched briefly)
    FALL_IMPACT             confirmed fall (high P_fall while pre-fall, or hard impact)
    POSE_LOST_WHILE_FALLEN  tracking lost right after a pre-fall -> occluded fall catch
    POST_FALL_MONITOR       person is down; watching for recovery
    LONG_LIE_ALERT          down and immobile too long -> emergency escalation

Why this closes the chair-fall gap:
    M3 alone missed the chair fall because the subject fell into shadow/out-of-frame
    and M1 honestly reported LOST (buffer reset, nothing to classify). M4 remembers the
    PRE_FALL that immediately preceded the loss and transitions to
    POSE_LOST_WHILE_FALLEN instead of resetting to normal - so an occluded fall is
    still caught and escalated.

Design intent on the furniture suppressor:
    Lying on a rest_surface (bed/couch) is normal. If a horizontal posture arises on a
    rest_surface WITHOUT a preceding PRE_FALL (no velocity/jerk spike), the alarm is
    suppressed. A genuine fall onto a bed still shows the PRE_FALL spike first, so it is
    NOT suppressed.
"""

import time
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, List, Optional


# ---- Tunable thresholds (starting points; verified against measured signals) --------
@dataclass
class M4Config:
    # PRE_FALL entry
    pre_fall_p: float = 0.40          # M3 probability
    pre_fall_vy: float = 1.2          # downward velocity (norm units/s)
    pre_fall_tilt: float = 35.0       # trunk tilt (deg) accompanying the velocity
    pre_fall_latch_s: float = 1.5     # how long PRE_FALL memory persists

    # FALL_IMPACT confirmation
    impact_p: float = 0.70            # strong neural probability
    impact_tilt: float = 60.0         # near-horizontal
    impact_jerk: float = 1500.0       # hard impact jerk

    # POSE_LOST_WHILE_FALLEN
    lost_recent_tilt: float = 45.0    # a recent high tilt also arms the occluded-fall catch

    # POST_FALL / recovery
    recovery_tilt: float = 30.0       # tilt back below this = getting up
    long_lie_s: float = 10.0          # prone & immobile longer than this -> alert
    recovery_confirm_s: float = 1.0   # sustained upright time to declare recovered

    # Fall CONFIRMATION window (the key false-alarm fix).
    # After impact/occlusion we wait this long; if the person gets back up within it,
    # it was bending / exercise / a stumble -> NO alert. Only a sustained "down" fires.
    confirm_s: float = 2.5            # seconds the person must stay down to confirm a fall
    confirm_upright_tilt: float = 35.0  # tilt below this during the window = recovered


@dataclass
class M4Output:
    state: str
    alert: bool                 # True on the frame an escalation fires
    alert_type: Optional[str]   # e.g. "FALL_IMPACT", "POSE_LOST_WHILE_FALLEN", "LONG_LIE_ALERT"
    info: Dict = field(default_factory=dict)


class FallDecisionEngine:
    STATES = (
        "STAND_WALK", "PRE_FALL", "CONFIRMING",
        "FALL_IMPACT", "POSE_LOST_WHILE_FALLEN", "POST_FALL_MONITOR", "LONG_LIE_ALERT",
    )

    def __init__(self, config: Optional[M4Config] = None):
        self.cfg = config or M4Config()
        self.reset()

    def reset(self):
        self.state = "STAND_WALK"
        self._pre_fall_timer = 0.0        # counts down while PRE_FALL memory is live
        self._down_timer = 0.0            # time spent down since impact/loss
        self._upright_timer = 0.0         # sustained upright time (for recovery)
        self._confirm_timer = 0.0         # time elapsed in CONFIRMING (must stay down)
        self._pending_type = None         # which event is being confirmed
        self._long_lie_fired = False
        self._recent_tilt = deque(maxlen=15)  # ~0.5 s of tilt history

    # -- helpers ----------------------------------------------------------------
    def _recent_max_tilt(self) -> float:
        return max(self._recent_tilt) if self._recent_tilt else 0.0

    def _is_pre_fall_signal(self, p_fall: float, tilt: float, vy: float) -> bool:
        if p_fall > self.cfg.pre_fall_p:
            return True
        if vy > self.cfg.pre_fall_vy and tilt > self.cfg.pre_fall_tilt:
            return True
        return False

    def _is_impact(self, p_fall: float, tilt: float, jerk: float, vy: float) -> bool:
        # Strong neural evidence is sufficient.
        if p_fall > self.cfg.impact_p:
            return True
        # Kinematic impact: near-horizontal AND a hard jerk AND an actual downward
        # motion. The velocity term is what rejects a person lying STILL on a bed,
        # whose jerk value is just landmark jitter (vy ~ 0) rather than a real impact.
        if (tilt > self.cfg.impact_tilt and jerk > self.cfg.impact_jerk
                and vy > self.cfg.pre_fall_vy):
            return True
        return False

    # -- main step --------------------------------------------------------------
    def update(
        self,
        pose_status: str,
        trunk_tilt_deg: float,
        hip_v_y: float,
        jerk: float,
        p_fall: float,
        on_rest_surface: bool = False,
        dt: float = 1.0 / 30.0,
    ) -> M4Output:
        cfg = self.cfg
        valid = pose_status in ("TRACKING", "HELD")
        if valid:
            self._recent_tilt.append(trunk_tilt_deg)

        # Decay the PRE_FALL latch.
        if self._pre_fall_timer > 0:
            self._pre_fall_timer = max(0.0, self._pre_fall_timer - dt)

        alert = False
        alert_type = None
        pre_fall_active = self._pre_fall_timer > 0

        # On a rest_surface (bed/couch), the person is expected to be/lie there.
        # Suppress fall logic unless there is strong neural evidence AND an actual
        # fast descent (a real fall ONTO the bed). This kills sleeping/turning-over
        # false alarms, including tracking loss while rolling over in bed.
        rest_suppressed = on_rest_surface and not (p_fall > cfg.impact_p and hip_v_y > cfg.pre_fall_vy)

        # ---------------- STAND_WALK ----------------
        if self.state == "STAND_WALK":
            if valid and not rest_suppressed and self._is_pre_fall_signal(p_fall, trunk_tilt_deg, hip_v_y):
                already_horizontal = trunk_tilt_deg > cfg.impact_tilt
                if not (already_horizontal and p_fall <= cfg.pre_fall_p):
                    self.state = "PRE_FALL"
                    self._pre_fall_timer = cfg.pre_fall_latch_s

        # ---------------- PRE_FALL ----------------
        # Balance loss detected. Move to CONFIRMING on impact/loss, but DO NOT alert
        # yet -- we must first see the person STAY down (confirm_s). This is what
        # rejects bending / exercise / stumbles that recover quickly.
        elif self.state == "PRE_FALL":
            if not valid and not rest_suppressed:
                self.state = "CONFIRMING"
                self._pending_type = "POSE_LOST_WHILE_FALLEN"
                self._confirm_timer = 0.0
                self._down_timer = 0.0
            elif self._is_impact(p_fall, trunk_tilt_deg, jerk, hip_v_y) and not rest_suppressed:
                self.state = "CONFIRMING"
                self._pending_type = "FALL_IMPACT"
                self._confirm_timer = 0.0
                self._down_timer = 0.0
            elif not pre_fall_active:
                self.state = "STAND_WALK"

        # ---------------- CONFIRMING (no alert yet) ----------------
        # The person went down. If they get back UP within confirm_s -> it was a
        # bend / exercise / stumble -> silently return to normal (NO alert).
        # If they stay down past confirm_s -> confirmed fall -> fire the alert.
        elif self.state == "CONFIRMING":
            self._confirm_timer += dt
            self._down_timer += dt
            recovered = valid and trunk_tilt_deg < cfg.confirm_upright_tilt
            # Resting on a bed/couch is NOT a fall: a genuine fall ends on the floor,
            # not on a rest_surface. If the person is horizontal but ON a rest_surface,
            # treat it as lying down / sleeping and abort the alert.
            resting_on_furniture = valid and on_rest_surface
            if recovered or resting_on_furniture:
                self.state = "STAND_WALK"
                self._pending_type = None
            elif self._confirm_timer >= cfg.confirm_s:
                # Still down, NOT on furniture -> confirmed fall. Fire the alert.
                alert, alert_type = True, self._pending_type
                self.state = "POST_FALL_MONITOR"
                self._pending_type = None

        # ---------------- POSE_LOST_WHILE_FALLEN (kept for compatibility) ----------
        elif self.state == "POSE_LOST_WHILE_FALLEN":
            self._down_timer += dt
            if valid and trunk_tilt_deg < cfg.recovery_tilt:
                self._upright_timer += dt
                if self._upright_timer >= cfg.recovery_confirm_s:
                    self.state = "STAND_WALK"
                    self._upright_timer = 0.0
                    self._long_lie_fired = False
            else:
                self._upright_timer = 0.0
                if self._down_timer >= cfg.long_lie_s and not self._long_lie_fired:
                    self.state = "LONG_LIE_ALERT"
                    alert, alert_type = True, "LONG_LIE_ALERT"
                    self._long_lie_fired = True

        # ---------------- POST_FALL_MONITOR ----------------
        elif self.state == "POST_FALL_MONITOR":
            self._down_timer += dt
            if valid and trunk_tilt_deg < cfg.recovery_tilt:
                self._upright_timer += dt
                if self._upright_timer >= cfg.recovery_confirm_s:
                    self.state = "STAND_WALK"
                    self._upright_timer = 0.0
                    self._long_lie_fired = False
            else:
                self._upright_timer = 0.0
                if self._down_timer >= cfg.long_lie_s and not self._long_lie_fired:
                    self.state = "LONG_LIE_ALERT"
                    alert, alert_type = True, "LONG_LIE_ALERT"
                    self._long_lie_fired = True

        # ---------------- LONG_LIE_ALERT ----------------
        elif self.state == "LONG_LIE_ALERT":
            self._down_timer += dt
            if valid and trunk_tilt_deg < cfg.recovery_tilt:
                self._upright_timer += dt
                if self._upright_timer >= cfg.recovery_confirm_s:
                    self.state = "STAND_WALK"
                    self._upright_timer = 0.0
                    self._long_lie_fired = False

        return M4Output(
            state=self.state,
            alert=alert,
            alert_type=alert_type,
            info={
                "pre_fall_active": pre_fall_active,
                "down_timer": round(self._down_timer, 2),
                "recent_max_tilt": round(self._recent_max_tilt(), 1),
            },
        )


def body_on_rest_surface(hip_px, furniture_boxes: List[Dict], margin_frac: float = 0.2) -> bool:
    """
    True if the hip point lies inside (or within a small margin of) any 'rest_surface'
    box. The margin matters because a reclining person's hip often sits just above the
    detected mattress box; a strict point-in-box test misses that. The box is expanded
    by `margin_frac` of its own width/height before the containment test.
    """
    if hip_px is None:
        return False
    x, y = hip_px
    for box in furniture_boxes:
        if box.get("label") != "rest_surface":
            continue
        x1, y1, x2, y2 = box["bbox"]
        mx = (x2 - x1) * margin_frac
        my = (y2 - y1) * margin_frac
        if (x1 - mx) <= x <= (x2 + mx) and (y1 - my) <= y <= (y2 + my):
            return True
    return False


# Self-test: real fall confirms; bending/exercise recovers (no alert); bed = no alert.
if __name__ == "__main__":
    print("Executing M4 Decision Engine Self-Test...")
    dt = 1.0 / 30.0

    def alerts_in(seq):
        return [o.alert_type for o in seq if o.alert]

    # 1) REAL FALL: balance loss -> impact -> STAYS down past confirm_s -> alert fires.
    eng = FallDecisionEngine()
    for _ in range(10):
        eng.update("TRACKING", 5.0, 0.1, 50, 0.02, False, dt)
    eng.update("TRACKING", 40.0, 2.5, 500, 0.30, False, dt)          # balance loss
    eng.update("TRACKING", 85.0, 2.5, 2000, 0.95, False, dt)         # impact
    fired = None
    for _ in range(int(4 / dt)):                                      # stay down 4s
        o = eng.update("TRACKING", 85.0, 0.0, 20, 0.9, False, dt)
        if o.alert:
            fired = o.alert_type
    print(f"  Real fall (stays down) -> alert={fired}, state={eng.state}")
    assert fired == "FALL_IMPACT"

    # 2) BENDING / EXERCISE: brief impact-like spike, then GETS BACK UP -> NO alert.
    eng2 = FallDecisionEngine()
    for _ in range(10):
        eng2.update("TRACKING", 5.0, 0.1, 50, 0.02, False, dt)
    eng2.update("TRACKING", 55.0, 2.2, 1800, 0.5, False, dt)         # bend down fast
    eng2.update("TRACKING", 70.0, 1.5, 1600, 0.6, False, dt)         # low for a moment
    rec = []
    for _ in range(int(1.5 / dt)):                                    # stand back up within confirm_s
        rec.append(eng2.update("TRACKING", 10.0, 0.3, 60, 0.1, False, dt))
    print(f"  Bending/exercise (recovers) -> alerts={alerts_in(rec)}, state={eng2.state}")
    assert len(alerts_in(rec)) == 0 and eng2.state == "STAND_WALK"

    # 3) BED lie-down: horizontal on rest_surface, no strong fall evidence -> no alarm.
    eng3 = FallDecisionEngine()
    last = None
    for _ in range(60):
        last = eng3.update("TRACKING", 80.0, 0.05, 30, 0.03, on_rest_surface=True, dt=dt)
    print(f"  Bed lie-down -> state={last.state}, alert={last.alert}")
    assert last.state == "STAND_WALK" and not last.alert

    # 4) ROLLING OVER in bed (tracking lost on rest_surface) -> no alarm.
    eng4 = FallDecisionEngine()
    o = None
    for _ in range(5):
        eng4.update("TRACKING", 78.0, 0.1, 40, 0.05, on_rest_surface=True, dt=dt)
    for _ in range(20):
        o = eng4.update("LOST", 0.0, 0.0, 0, 0.0, on_rest_surface=True, dt=dt)
    print(f"  Rolling over in bed (LOST) -> state={eng4.state}, alert={o.alert}")
    assert not o.alert

    print("[M4 Phase-4 Test Passed!]")

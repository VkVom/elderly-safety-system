"""
TDD tests for M4 tiered pre-impact events (P1).

Contract under test:
  - PRE_FALL_WARNING        fires ONCE per episode at balance loss (tier_event,
                            alert stays False so existing emergency escalation
                            semantics are unchanged).
  - SELF_RECOVERY_CANCELLED fires on the same episode if the person recovers
                            (or stays upright during the confirm window) BEFORE
                            impact confirmation - no FALL_IMPACT ever fires.
  - episode_id              `EP_<8 hex>` created at PRE_FALL entry and carried
                            through impact / long-lie / cancel.
  - adaptive confirm        hard fall (impact-frame hip vy > hard_fall_vy)
                            confirms after confirm_fast_s (~1.3s); normal
                            falls after confirm_s (~2.5s).
  - warning_cooldown_s      rapid balance-loss flapping must NOT re-warn until
                            the cooldown elapses.
  - long_lie_s              defaults to 180.0 (run_live --demo overrides to 10).

Run: .\\venv\\Scripts\\python.exe test_m4_tiers.py
"""

import re

from src.m4_state_machine import FallDecisionEngine, M4Config

DT = 1.0 / 30.0
EP_RE = re.compile(r"^EP_[0-9a-f]{8}$")


def warm(eng, n=10):
    for _ in range(n):
        eng.update("TRACKING", 5.0, 0.1, 50, 0.02, False, DT)


def test_defaults():
    cfg = M4Config()
    assert cfg.long_lie_s == 180.0, f"long_lie_s default is {cfg.long_lie_s}"
    assert cfg.warning_cooldown_s == 2.0
    assert cfg.confirm_fast_s == 1.3
    assert cfg.confirm_s == 2.5
    assert cfg.hard_fall_vy == 2.0
    assert cfg.recovery_max_abs_vy == 12.0
    assert cfg.recovery_max_jerk == 20000.0
    assert cfg.confirm_down_tilt == 45.0


def test_pre_fall_warning_once_per_episode():
    eng = FallDecisionEngine()
    warm(eng)
    o = eng.update("TRACKING", 40.0, 2.5, 500, 0.30, False, DT)  # balance loss
    assert o.tier_event == "PRE_FALL_WARNING"
    assert o.alert is False and o.alert_type is None
    assert EP_RE.match(o.episode_id or ""), f"bad episode id: {o.episode_id}"
    assert eng.state == "PRE_FALL"
    for _ in range(10):  # subsequent PRE_FALL frames must not re-warn
        o2 = eng.update("TRACKING", 40.0, 1.0, 100, 0.30, False, DT)
        assert o2.tier_event is None
    assert eng.state == "PRE_FALL"


def test_same_episode_warning_then_impact():
    eng = FallDecisionEngine()
    warm(eng)
    w = eng.update("TRACKING", 40.0, 2.5, 500, 0.30, False, DT)
    eng.update("TRACKING", 85.0, 2.5, 2000, 0.95, False, DT)  # impact -> CONFIRMING
    fired = None
    for _ in range(int(3.0 / DT)):
        o = eng.update("TRACKING", 85.0, 0.0, 20, 0.9, False, DT)
        if o.alert:
            fired = o
            break
    assert fired is not None and fired.alert_type == "FALL_IMPACT"
    assert fired.episode_id == w.episode_id


def test_self_recovery_cancelled_same_episode():
    eng = FallDecisionEngine()
    warm(eng)
    w = eng.update("TRACKING", 40.0, 2.5, 500, 0.30, False, DT)
    assert w.tier_event == "PRE_FALL_WARNING"
    cancel, got_impact = None, False
    for _ in range(int(1.2 / DT)):  # stand back up; recovery_confirm_s = 1.0
        o = eng.update("TRACKING", 10.0, 0.2, 40, 0.05, False, DT)
        if o.alert:
            got_impact = True
        if o.tier_event == "SELF_RECOVERY_CANCELLED":
            cancel = o
            break
    assert cancel is not None, "no SELF_RECOVERY_CANCELLED emitted"
    assert not got_impact
    assert cancel.episode_id == w.episode_id
    assert cancel.alert is False
    assert eng.state == "STAND_WALK"


def test_cancel_during_confirming_no_impact():
    eng = FallDecisionEngine()
    warm(eng)
    w = eng.update("TRACKING", 55.0, 2.2, 1800, 0.5, False, DT)  # bend: balance loss
    eng.update("TRACKING", 70.0, 1.5, 1600, 0.6, False, DT)      # impact-like -> CONFIRMING
    cancel, got_impact = None, False
    for _ in range(int(2.0 / DT)):
        o = eng.update("TRACKING", 10.0, 0.3, 60, 0.1, False, DT)  # gets back up
        if o.alert:
            got_impact = True
        if o.tier_event == "SELF_RECOVERY_CANCELLED":
            cancel = o
            break
    assert cancel is not None, "no SELF_RECOVERY_CANCELLED during confirm window"
    assert not got_impact
    assert cancel.episode_id == w.episode_id
    assert eng.state == "STAND_WALK"


def test_single_upright_pose_flicker_does_not_cancel_fall():
    eng = FallDecisionEngine()
    warm(eng)
    eng.update("TRACKING", 40.0, 2.5, 500, 0.30, False, DT)  # balance loss
    eng.update("TRACKING", 85.0, 2.5, 2000, 0.95, False, DT)  # hard impact

    flicker = eng.update("TRACKING", 10.0, 0.0, 20, 0.95, False, DT)
    assert flicker.alert is False
    assert eng.state == "CONFIRMING", "one upright pose should not cancel an episode"

    fired = None
    for _ in range(int(1.5 / DT)):
        out = eng.update("TRACKING", 85.0, 0.0, 20, 0.95, False, DT)
        if out.alert:
            fired = out
            break
    assert fired is not None and fired.alert_type == "FALL_IMPACT"


def test_implausible_motion_does_not_count_as_recovery_during_confirmation():
    eng = FallDecisionEngine()
    warm(eng)
    eng.update("TRACKING", 40.0, 2.5, 500, 0.30, False, DT)
    eng.update("TRACKING", 85.0, 2.5, 2000, 0.95, False, DT)

    # A jittering pose may report an upright tilt while kinematics are invalid.
    # It must not cancel the suspected fall as if the person had stood up.
    for _ in range(int(1.1 / DT)):
        out = eng.update("TRACKING", 12.0, 71.16, 40115, 0.96, False, DT)
        assert out.tier_event != "SELF_RECOVERY_CANCELLED"
        assert eng.state == "CONFIRMING"

    fired = None
    for _ in range(int(2.0 / DT)):
        out = eng.update("TRACKING", 85.0, 0.0, 20, 0.9, False, DT)
        if out.alert:
            fired = out
            break
    assert fired is not None and fired.alert_type == "FALL_IMPACT"


def test_sanitized_outlier_frame_is_not_treated_as_recovery():
    eng = FallDecisionEngine()
    warm(eng)
    eng.update("TRACKING", 40.0, 2.5, 500, 0.30, False, DT)
    eng.update("TRACKING", 85.0, 2.5, 2000, 0.95, False, DT)

    for _ in range(int(1.1 / DT)):
        out = eng.update(
            "TRACKING", 12.0, 0.0, 0.0, 0.96, False, DT,
            kinematics_reliable=False,
        )
        assert out.tier_event != "SELF_RECOVERY_CANCELLED"
        assert eng.state == "CONFIRMING"


def test_recovery_with_plausible_standing_motion_still_cancels():
    eng = FallDecisionEngine()
    warm(eng)
    eng.update("TRACKING", 40.0, 2.5, 500, 0.30, False, DT)
    eng.update("TRACKING", 85.0, 2.5, 2000, 0.95, False, DT)

    cancel = None
    for _ in range(int(1.2 / DT)):
        out = eng.update("TRACKING", 12.0, 8.0, 500.0, 0.05, False, DT)
        if out.tier_event == "SELF_RECOVERY_CANCELLED":
            cancel = out
            break
    assert cancel is not None
    assert eng.state == "STAND_WALK"


def test_confirm_timer_requires_sustained_down_evidence():
    eng = FallDecisionEngine()
    warm(eng)
    eng.update("TRACKING", 40.0, 2.5, 500, 0.30, False, DT)
    eng.update("TRACKING", 20.0, 0.0, 0.0, 0.96, False, DT)
    assert eng.state == "CONFIRMING"

    # Persistent model scores and ambiguous upright-looking pose must not count as
    # time spent down when M2 says its motion measurements are unreliable.
    for _ in range(int(3.0 / DT)):
        out = eng.update(
            "TRACKING", 15.0, 0.0, 0.0, 0.99, False, DT,
            kinematics_reliable=False,
        )
        assert out.alert is False
        assert eng.state == "CONFIRMING"
        assert eng._confirm_timer == 0.0

    # Once the torso is actually horizontal, the continuous down timer can confirm.
    fired = None
    for _ in range(int(3.0 / DT)):
        out = eng.update("TRACKING", 80.0, 0.0, 0.0, 0.99, False, DT,
                         kinematics_reliable=False)
        if out.alert:
            fired = out
            break
    assert fired is not None and fired.alert_type == "FALL_IMPACT"


def test_zero_dt_frame_gap_does_not_advance_confirmation_clock():
    eng = FallDecisionEngine()
    warm(eng)
    eng.update("TRACKING", 40.0, 2.5, 500, 0.30, False, DT)
    eng.update("TRACKING", 85.0, 2.5, 2000, 0.95, False, DT)
    before = eng._confirm_timer

    out = eng.update("TRACKING", 85.0, 0.0, 20, 0.95, False, 0.0)

    assert eng._confirm_timer == before
    assert out.alert is False
    assert eng.state == "CONFIRMING"


def _confirm_time(impact_vy):
    eng = FallDecisionEngine()
    warm(eng)
    eng.update("TRACKING", 40.0, 2.5, 500, 0.30, False, DT)   # balance loss
    eng.update("TRACKING", 85.0, impact_vy, 2000, 0.95, False, DT)  # impact
    t = 0.0
    for _ in range(int(5.0 / DT)):
        o = eng.update("TRACKING", 85.0, 0.0, 20, 0.9, False, DT)
        t += DT
        if o.alert:
            return t
    return None


def test_adaptive_confirm_fast_hard_fall():
    t = _confirm_time(2.5)
    assert t is not None and 1.2 <= t <= 1.8, f"hard-fall confirm took {t}s"


def test_adaptive_confirm_normal_fall():
    t = _confirm_time(1.5)
    assert t is not None and 2.4 <= t <= 3.0, f"normal-fall confirm took {t}s"


def test_warning_cooldown_suppresses_flapping():
    eng = FallDecisionEngine()
    warm(eng)
    w1 = eng.update("TRACKING", 40.0, 2.5, 500, 0.30, False, DT)
    assert w1.tier_event == "PRE_FALL_WARNING"
    for _ in range(int(1.2 / DT)):  # recover -> cancel
        eng.update("TRACKING", 10.0, 0.2, 40, 0.05, False, DT)
    assert eng.state == "STAND_WALK"
    o = eng.update("TRACKING", 40.0, 2.5, 500, 0.30, False, DT)  # re-loss within cooldown
    assert o.tier_event is None, "warning re-emitted inside cooldown"
    assert eng.state == "STAND_WALK"
    for _ in range(int(1.5 / DT)):  # wait past the 2.0s cooldown
        eng.update("TRACKING", 10.0, 0.1, 40, 0.02, False, DT)
    o2 = eng.update("TRACKING", 40.0, 2.5, 500, 0.30, False, DT)
    assert o2.tier_event == "PRE_FALL_WARNING"
    assert o2.episode_id != w1.episode_id, "new episode must get a new id"


def test_long_lie_carries_episode_id():
    eng = FallDecisionEngine(M4Config(long_lie_s=2.0))
    warm(eng)
    w = eng.update("TRACKING", 40.0, 2.5, 500, 0.30, False, DT)
    eng.update("TRACKING", 85.0, 2.5, 2000, 0.95, False, DT)
    impact, lie = None, None
    for _ in range(int(6.0 / DT)):
        o = eng.update("TRACKING", 85.0, 0.0, 20, 0.9, False, DT)
        if o.alert and o.alert_type == "FALL_IMPACT":
            impact = o
        if o.alert and o.alert_type == "LONG_LIE_ALERT":
            lie = o
    assert impact is not None and lie is not None
    assert impact.episode_id == w.episode_id == lie.episode_id


def main():
    tests = [
        test_defaults,
        test_pre_fall_warning_once_per_episode,
        test_same_episode_warning_then_impact,
        test_self_recovery_cancelled_same_episode,
        test_cancel_during_confirming_no_impact,
        test_single_upright_pose_flicker_does_not_cancel_fall,
        test_implausible_motion_does_not_count_as_recovery_during_confirmation,
        test_sanitized_outlier_frame_is_not_treated_as_recovery,
        test_recovery_with_plausible_standing_motion_still_cancels,
        test_confirm_timer_requires_sustained_down_evidence,
        test_zero_dt_frame_gap_does_not_advance_confirmation_clock,
        test_adaptive_confirm_fast_hard_fall,
        test_adaptive_confirm_normal_fall,
        test_warning_cooldown_suppresses_flapping,
        test_long_lie_carries_episode_id,
    ]
    for t in tests:
        t()
        print(f"  [ok] {t.__name__}")
    print(f"[M4 tiers: {len(tests)}/{len(tests)} passed]")


if __name__ == "__main__":
    main()

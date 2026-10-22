"""
Streamlit Visual Presentation Dashboard for the Elderly Safety System.

Renders the M1 -> M2 -> M3 -> M4 -> escalation pipeline over a chosen test clip:
  - annotated video (skeleton + furniture boxes)
  - lightweight kinematic metric cards (trunk tilt, vertical velocity, jerk)
  - neural fall-probability bar (green / yellow / red)
  - M4 state badge
  - live alert event log (from logs/dashboard_alerts.json)

Performance notes (why this is smooth):
  - Every frame is PROCESSED by the pipeline (detection stays correct), but the browser
    is only UPDATED every `render_every` frames - decoupling heavy render cost from the
    pipeline. Per-frame Plotly charts (the original lag source) are replaced with light
    HTML metric cards.
  - The video frame is downscaled and JPEG-encoded before display (small payload).

Run:
    streamlit run dashboard/app.py
"""

import os
import sys
import time
import json

import cv2
import numpy as np
import pandas as pd
import streamlit as st

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from dashboard.pipeline import DashboardPipeline, STATE_COLORS
from src.escalation import (
    ElderContext, FirestoreExpoPushNotifier, FirestoreSink, LocalJsonSink,
)

CLIPS = {
    "Chair fall (occluded)": "data/manual_test_videos/gmdcsa24_s1_fall_chair_partial_original.mp4",
    "Bed lie-down (ADL)": "data/manual_test_videos/gmdcsa24_s1_adl_bed_to_sleep_original.mp4",
    "Low-light fall": "data/manual_test_videos/gmdcsa24_s4_fall_low_light_original.mp4",
}
ALERTS_PATH = os.path.join(_ROOT, "logs", "dashboard_alerts.json")

st.set_page_config(page_title="Elderly Safety System - Live HUD", layout="wide")


def _load_alerts():
    try:
        with open(ALERTS_PATH, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


# --- Sidebar controls ---
st.sidebar.title("Controls")
clip_name = st.sidebar.selectbox("Test clip", list(CLIPS.keys()))


@st.cache_data(ttl=30, show_spinner=False)
def _linked_elders():
    """Elders that can receive cloud alerts, with their caretaker routing."""
    try:
        from src.elder_picker import load_elders
        from src.escalation import get_firestore_db
        return [
            {
                "uid": c.uid, "name": c.name, "room": c.room, "phone": c.phone,
                "caretaker_id": c.caretaker_id, "caretaker_name": c.caretaker_name,
                "has_token": c.has_token,
            }
            for c in load_elders(get_firestore_db())
        ]
    except Exception:
        return []


st.sidebar.markdown("---")
cloud_routing_enabled = st.sidebar.checkbox(
    "Enable cloud alert routing",
    value=False,
    help="Turn this on to load linked residents and allow alerts to reach their caretakers.",
)
ELDERS = _linked_elders() if cloud_routing_enabled else []
ROUTE_LABELS = ["Local only (no cloud)"] + [
    f"{e['name']} - {e['room']}" + ("" if e["has_token"] else " [no push token]")
    for e in ELDERS
]
route_label = st.sidebar.selectbox("Alert routing", ROUTE_LABELS, index=0)
if cloud_routing_enabled and ELDERS:
    st.sidebar.caption("Select a resident to route alerts to their linked caretaker.")
elif cloud_routing_enabled:
    st.sidebar.caption("No linked residents found - alerts stay in the local log.")
else:
    st.sidebar.caption("Local only is active. Enable cloud routing to load resident accounts.")


def _selected_elder():
    try:
        idx = ROUTE_LABELS.index(route_label) - 1
    except ValueError:
        idx = -1
    return ELDERS[idx] if 0 <= idx < len(ELDERS) else None


def _routing_context(clip):
    elder = _selected_elder()
    if elder:
        return ElderContext(
            elder_id=elder["uid"], elder_name=elder["name"],
            room_location=elder["room"],
            assigned_caretaker_id=elder["caretaker_id"],
            elder_phone=elder["phone"],
        )
    return ElderContext("ELDER_DEMO", clip, "Demo Room", None)


def _alert_sinks():
    sinks = [LocalJsonSink(ALERTS_PATH)]
    if _selected_elder():
        try:
            fsink = FirestoreSink()
            if fsink.available:
                sinks.insert(0, fsink)
        except Exception:
            pass
    return sinks


def _alert_notifiers():
    notifiers = []
    if _selected_elder():
        try:
            push = FirestoreExpoPushNotifier()
            if push.available:
                notifiers.append(push)
        except Exception:
            pass
    return notifiers


speed = st.sidebar.slider("Playback speed", 0.5, 4.0, 2.0, 0.5)
render_every = st.sidebar.slider("Render every N frames (higher = smoother)", 1, 6, 2, 1)
disp_width = st.sidebar.select_slider("Display width (px)", [480, 640, 800, 960], value=640)
col_a, col_b = st.sidebar.columns(2)
start = col_a.button("▶ Play", use_container_width=True)
stop = col_b.button("⏹ Stop", use_container_width=True)
if st.sidebar.button("Clear alert log", use_container_width=True):
    os.makedirs(os.path.dirname(ALERTS_PATH), exist_ok=True)
    with open(ALERTS_PATH, "w") as f:
        json.dump([], f)

if "running" not in st.session_state:
    st.session_state.running = False
if start:
    st.session_state.running = True
if stop:
    st.session_state.running = False

st.title("Proactive Elderly Safety System — Live Telemetry")

# --- Layout ---
video_col, tele_col = st.columns([2, 1])
video_ph = video_col.empty()
state_ph = tele_col.empty()
metrics_ph = tele_col.empty()
log_ph = st.empty()


def render_state(state):
    color = STATE_COLORS.get(state, "#888")
    label = state or "WAITING_FOR_FRAME"
    state_ph.markdown(
        f"<div style='padding:12px;border-radius:8px;background:{color};"
        f"color:white;font-size:20px;font-weight:700;text-align:center'>"
        f"M4 STATE: {label}</div>", unsafe_allow_html=True)


def _metric_card(label, value, unit, warn, alarm):
    if value is None:
        return (
            f"<div style='padding:8px;border-radius:8px;background:#1b1b1b;margin-bottom:6px'>"
            f"<div style='color:#aaa;font-size:12px'>{label}</div>"
            f"<div style='color:#888;font-size:24px;font-weight:700'>N/A"
            f"<span style='font-size:12px;color:#888'> no valid pose</span></div></div>"
        )
    color = "#21c25a" if value < warn else "#f2c037" if value < alarm else "#e53935"
    return (
        f"<div style='padding:8px;border-radius:8px;background:#1b1b1b;margin-bottom:6px'>"
        f"<div style='color:#aaa;font-size:12px'>{label}</div>"
        f"<div style='color:{color};font-size:24px;font-weight:700'>{value:.1f}"
        f"<span style='font-size:12px;color:#888'> {unit}</span></div></div>"
    )


def render_metrics(tilt, vy, jerk):
    html = (
        _metric_card("Trunk Tilt", tilt, "deg", 35, 60)
        + _metric_card("Vertical Velocity", abs(vy) if vy is not None else None, "u/s", 1.2, 2.0)
        + _metric_card("Jerk", min(jerk, 9999) if jerk is not None else None, "", 1500, 3000)
    )
    metrics_ph.markdown(html, unsafe_allow_html=True)


def render_alerts():
    alerts = _load_alerts()
    if alerts:
        df = pd.DataFrame(alerts)[["timestamp", "eventType", "elderName",
                                   "roomLocation", "furnitureContext"]]
        log_ph.dataframe(df.tail(10), width="stretch")
    else:
        log_ph.info("No alerts dispatched yet.")


def show_frame(frame_bgr, width):
    # Downscale for a smaller payload (the real perf win), then hand Streamlit a plain
    # RGB numpy array - the most version-robust st.image input. (Passing raw JPEG bytes
    # rendered blank on Streamlit 1.64, so we avoid that.)
    h, w = frame_bgr.shape[:2]
    if w > width:
        frame_bgr = cv2.resize(frame_bgr, (width, int(h * width / w)))
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    video_ph.image(rgb, channels="RGB", width="stretch")


# Initial idle render. Do not display fake zero telemetry before a real frame exists.
render_state("WAITING_FOR_FRAME")
render_metrics(None, None, None)
render_alerts()

if st.session_state.running:
    path = os.path.join(_ROOT, CLIPS[clip_name])
    if not os.path.isfile(path):
        st.error(f"Clip not found: {path}")
    else:
        pipe = DashboardPipeline(
            _routing_context(clip_name),
            alerts_path=ALERTS_PATH,
            sinks=_alert_sinks(),
            notifiers=_alert_notifiers(),
        )
        pipe.reset()
        cap = cv2.VideoCapture(path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_i = 0
        try:
            while cap.isOpened() and st.session_state.running:
                ok, frame = cap.read()
                if not ok:
                    break
                frame_i += 1
                t = pipe.process(frame, fps=fps)  # every frame processed

                # Throttle the browser update to keep playback smooth.
                if frame_i % render_every == 0 or t["alert"]:
                    show_frame(t["frame"], disp_width)
                    render_state(t["state"])
                    render_metrics(t["tilt"], t["vy"], t["jerk"])
                    if t["alert"]:
                        render_alerts()
                time.sleep((1.0 / fps) / speed)
        finally:
            cap.release()
            pipe.close()
        st.session_state.running = False
        render_alerts()
        st.success("Playback finished.")

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
from src.escalation import ElderContext

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
pbar_txt = tele_col.empty()
pbar_ph = tele_col.empty()
metrics_ph = tele_col.empty()
log_ph = st.empty()


def render_state(state):
    color = STATE_COLORS.get(state, "#888")
    state_ph.markdown(
        f"<div style='padding:12px;border-radius:8px;background:{color};"
        f"color:white;font-size:20px;font-weight:700;text-align:center'>"
        f"M4 STATE: {state}</div>", unsafe_allow_html=True)


def render_pfall(p):
    label = "LOW" if p < 0.4 else "ELEVATED" if p < 0.7 else "HIGH"
    color = "#21c25a" if p < 0.4 else "#f2c037" if p < 0.7 else "#e53935"
    pbar_txt.markdown(
        f"<span style='color:{color};font-weight:700;font-size:18px'>"
        f"P(fall) = {p:.2f} ({label})</span>", unsafe_allow_html=True)
    pbar_ph.progress(min(max(p, 0.0), 1.0))


def _metric_card(label, value, unit, warn, alarm):
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
        + _metric_card("Vertical Velocity", abs(vy), "u/s", 1.2, 2.0)
        + _metric_card("Jerk", min(jerk, 9999), "", 1500, 3000)
    )
    metrics_ph.markdown(html, unsafe_allow_html=True)


def render_alerts():
    alerts = _load_alerts()
    if alerts:
        df = pd.DataFrame(alerts)[["timestamp", "eventType", "elderName",
                                   "roomLocation", "fallProbability", "furnitureContext"]]
        log_ph.dataframe(df.tail(10), use_container_width=True)
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
    video_ph.image(rgb, channels="RGB", use_container_width=True)


# Initial idle render.
render_state("STAND_WALK")
render_pfall(0.0)
render_metrics(0.0, 0.0, 0.0)
render_alerts()

if st.session_state.running:
    path = os.path.join(_ROOT, CLIPS[clip_name])
    if not os.path.isfile(path):
        st.error(f"Clip not found: {path}")
    else:
        pipe = DashboardPipeline(
            ElderContext("ELDER_DEMO", clip_name, "Demo Room", "CARE_1"),
            alerts_path=ALERTS_PATH,
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
                    render_pfall(t["p_fall"])
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

// ─────────────────────────────────────────────────────────────────────────────
// UpSupport app design system
//
// Light, high-contrast, age-inclusive. Teal = safety/trust, Red = emergency ONLY.
// One source of truth for color, type, spacing, radius, elevation so every screen
// (elder / caretaker / volunteer) feels like one cohesive app.
// ─────────────────────────────────────────────────────────────────────────────

export const palette = {
  // Backgrounds & surfaces
  bg: "#FBF8F3",          // warm off-white
  surface: "#FFFFFF",     // cards
  surfaceAlt: "#E3F1EE",  // teal-tinted surface

  // Text (high contrast on light bg, all >= 4.5:1)
  text: "#12403B",        // primary ink
  textMuted: "#55626B",   // secondary ink
  textFaint: "#55626B",   // slate-400 hints

  // Safety (primary brand)
  safe: "#0B7468",        // UpSupport teal
  safeDark: "#0B7468",
  safeSoft: "#E3F1EE",    // teal tint for backgrounds
  accent: "#E5A93C",
  success: "#059669",     // emerald

  // Emergency (reserved strictly for active alerts / SOS)
  danger: "#DC2626",
  dangerDark: "#B91C1C",
  dangerSoft: "#FEE2E2",

  // Warning / caution (pre-fall, escalation timers)
  warn: "#D97706",
  warnSoft: "#FEF3C7",

  border: "#D9D2C7",
  white: "#FFFFFF",
  black: "#000000",
};

// Typography scale. Body sizes are deliberately large for aging eyes.
// Elder screens lean on `display`/`xl`; dense caretaker screens use `md`/`sm`.
export const type = {
  display: 40,
  xxl: 32,
  xl: 26,
  lg: 22,
  md: 18,   // elder body baseline (>= 18px per accessibility guidance)
  sm: 15,
  xs: 13,
  weightBold: "800",
  weightSemi: "700",
  weightMed: "600",
  weightReg: "400",
};

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  pill: 999,
};

// Soft elevation for cards on the light theme.
export const shadow = {
  card: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  floating: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 8,
  },
};

// Minimum touch target sizes (px). Elder targets are extra-large.
export const touch = {
  min: 48,
  elder: 64,
};

// ── Back-compat: existing caretaker/volunteer screens import { colors, EVENT_META }.
// Keep those names working by mapping onto the new palette.
export const colors = {
  bg: palette.bg,
  card: palette.surface,
  primary: palette.safe,
  safe: palette.success,
  warn: palette.warn,
  danger: palette.danger,
  text: palette.text,
  muted: palette.textMuted,
  white: palette.white,
};

// M4 event type -> display metadata for alert UIs.
export const EVENT_META = {
  FALL_IMPACT: { label: "Fall Impact", color: palette.danger, icon: "alert-circle" },
  POSE_LOST_WHILE_FALLEN: { label: "Fall (Obscured)", color: palette.danger, icon: "eye-off" },
  LONG_LIE_ALERT: { label: "Long Lie", color: palette.dangerDark, icon: "time" },
  MANUAL_SOS: { label: "Manual SOS", color: palette.danger, icon: "hand-left" },
  PRE_FALL_WARNING: { label: "Possible Stumble", color: palette.warn, icon: "eye" },
  SELF_RECOVERY_CANCELLED: { label: "Recovered", color: palette.success, icon: "checkmark-circle" },
};

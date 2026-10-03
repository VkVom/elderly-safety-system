import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette, type, radius, space } from "../theme";

/**
 * Pill badge for a status. tone: "safe" | "danger" | "warn" | "neutral".
 * `large` renders an elder-friendly bigger badge.
 */
export default function StatusBadge({ label, icon, tone = "neutral", large = false }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, large && styles.large]}>
      {icon ? <Ionicons name={icon} size={large ? 22 : 16} color={t.fg} style={{ marginRight: space.xs }} /> : null}
      <Text style={[styles.txt, { color: t.fg, fontSize: large ? type.md : type.sm }]}>{label}</Text>
    </View>
  );
}

const TONES = {
  safe: { bg: palette.safeSoft, fg: palette.safeDark },
  danger: { bg: palette.dangerSoft, fg: palette.dangerDark },
  warn: { bg: palette.warnSoft, fg: palette.warn },
  neutral: { bg: palette.surfaceAlt, fg: palette.textMuted },
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
  },
  large: { paddingVertical: space.sm, paddingHorizontal: space.lg },
  txt: { fontWeight: type.weightSemi },
});

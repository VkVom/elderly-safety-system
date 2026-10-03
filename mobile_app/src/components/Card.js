import React from "react";
import { View, StyleSheet } from "react-native";
import { palette, radius, space, shadow } from "../theme";

/** Elevated white surface used to group content. `tone` tints the background. */
export default function Card({ children, tone = "surface", style }) {
  const bg = TONES[tone] || palette.surface;
  return <View style={[styles.card, { backgroundColor: bg }, shadow.card, style]}>{children}</View>;
}

const TONES = {
  surface: palette.surface,
  safe: palette.safeSoft,
  danger: palette.dangerSoft,
  warn: palette.warnSoft,
  alt: palette.surfaceAlt,
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: space.lg,
    marginVertical: space.sm,
  },
});

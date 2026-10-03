import React from "react";
import { Pressable, Text, StyleSheet, View, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette, type, radius, space, touch, shadow } from "../theme";

/**
 * Accessible button with variants and sizes.
 *
 * variant: "primary" | "danger" | "success" | "secondary" | "ghost"
 * size:    "md" | "lg" | "elder"   (elder = extra-large touch target + big text)
 * icon:    optional Ionicons name
 */
export default function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  disabled = false,
  style,
  accessibilityLabel,
}) {
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;

  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: disabled || loading }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: v.bg, borderColor: v.border, minHeight: s.minHeight, paddingHorizontal: s.padX },
        v.elevated && shadow.card,
        pressed && !disabled && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={v.fg} />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={s.icon} color={v.fg} style={{ marginRight: space.sm }} /> : null}
            <Text style={[styles.txt, { color: v.fg, fontSize: s.font }]}>{title}</Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const VARIANTS = {
  primary: { bg: palette.safe, fg: palette.white, border: palette.safe, elevated: true },
  success: { bg: palette.success, fg: palette.white, border: palette.success, elevated: true },
  danger: { bg: palette.danger, fg: palette.white, border: palette.danger, elevated: true },
  secondary: { bg: palette.surface, fg: palette.text, border: palette.border, elevated: true },
  ghost: { bg: "transparent", fg: palette.textMuted, border: "transparent", elevated: false },
};

const SIZES = {
  md: { minHeight: touch.min, padX: space.lg, font: type.md, icon: 20 },
  lg: { minHeight: 56, padX: space.lg, font: type.lg, icon: 24 },
  elder: { minHeight: touch.elder, padX: space.lg, font: type.xl, icon: 30 },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: space.sm,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  txt: { fontWeight: type.weightSemi, textAlign: "center" },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
});

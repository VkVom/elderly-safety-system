import React from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette, type, radius, space } from "../theme";

/** Labeled text input with optional leading icon, consistent styling. */
export default function TextField({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = "none",
}) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.field}>
        {icon ? <Ionicons name={icon} size={20} color={palette.textMuted} style={{ marginRight: space.sm }} /> : null}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.textFaint}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: space.sm },
  label: { fontSize: type.sm, color: palette.textMuted, marginBottom: space.xs, fontWeight: type.weightMed },
  field: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: palette.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: palette.border,
    paddingHorizontal: space.md, minHeight: 52,
  },
  input: { flex: 1, fontSize: type.md, color: palette.text, paddingVertical: space.sm },
});

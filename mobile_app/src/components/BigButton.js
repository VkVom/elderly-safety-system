import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { colors } from "../theme";

export default function BigButton({ title, onPress, color = colors.primary, style, textStyle }) {
  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: color }, style]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.txt, textStyle]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
  },
  txt: { color: colors.white, fontSize: 18, fontWeight: "700" },
});

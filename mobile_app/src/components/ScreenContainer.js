import React from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { palette, space } from "../theme";

/**
 * Standard screen wrapper: safe-area aware, consistent padding, light background.
 * Set `scroll` for scrollable content, `center` to vertically center children.
 */
export default function ScreenContainer({ children, scroll = false, center = false, style }) {
  const inner = (
    <View style={[styles.inner, center && styles.center, style]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scroll, center && styles.center]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  inner: { flex: 1, padding: space.lg },
  scroll: { flexGrow: 1, padding: space.lg },
  center: { justifyContent: "center" },
});

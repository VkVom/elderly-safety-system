import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { palette, space, type } from "../../theme";

const font = {
  display: "Fraunces_700Bold",
  body: "NunitoSans_400Regular",
  bodySemi: "NunitoSans_600SemiBold",
  bodyBold: "NunitoSans_700Bold",
};

export function Screen({ children, contentStyle, keyboard = true, onBack }) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={keyboard && Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
              style={styles.screenBackButton}
            >
              <Ionicons name="arrow-back" size={22} color={palette.text} />
            </Pressable>
          ) : null}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Heading({ title, description, style }) {
  return (
    <View style={styles.heading}>
      <Text style={[styles.headingTitle, style]}>{title}</Text>
      {description ? <Text style={styles.headingDescription}>{description}</Text> : null}
    </View>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  hint,
  keyboardType = "default",
  autoCapitalize = "none",
  autoComplete,
  textContentType,
  secureTextEntry = false,
  onBlur,
  accessibilityLabel,
  rightAction,
  multiline = false,
}) {
  const [visible, setVisible] = useState(false);
  const hideText = secureTextEntry && !visible;
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputShell, error && styles.inputError, multiline && styles.multilineShell]}>
        <TextInput
          accessibilityLabel={accessibilityLabel || label}
          style={[styles.input, multiline && styles.multilineInput]}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={palette.textMuted}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          textContentType={textContentType}
          secureTextEntry={hideText}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : "center"}
          accessibilityState={{ disabled: false }}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setVisible((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel={visible ? "Hide password" : "Show password"}
            style={styles.fieldAction}
          >
            <Text style={styles.fieldActionText}>{visible ? "Hide" : "Show"}</Text>
          </Pressable>
        ) : rightAction}
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.fieldError}>{error}</Text> : null}
      {!error && hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

function ActionButton({ title, onPress, loading, disabled, icon, variant = "primary", accessibilityLabel }) {
  const inactive = Boolean(disabled || loading);
  const primary = variant === "primary";
  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primaryButton : styles.secondaryButton,
        pressed && !inactive && styles.pressed,
        inactive && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? palette.white : palette.safeDark} />
      ) : (
        <View style={styles.buttonContent}>
          {icon ? <Ionicons name={icon} size={20} color={primary ? palette.white : palette.text} /> : null}
          <Text style={[styles.buttonText, primary ? styles.primaryText : styles.secondaryText]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function PrimaryButton(props) {
  return <ActionButton {...props} variant="primary" />;
}

export function SecondaryButton(props) {
  return <ActionButton {...props} variant="secondary" />;
}

export function GoogleButton(props) {
  return <ActionButton {...props} variant="secondary" icon="logo-google" />;
}

export function ProgressHeader({ step, total = 3, onBack }) {
  return (
    <View style={styles.progressHeader}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={styles.backButton}
      >
        <Ionicons name="chevron-back" size={22} color={palette.text} />
      </Pressable>
      <View style={styles.progressBars}>
        {Array.from({ length: total }, (_, index) => (
          <View key={index} style={[styles.progressBar, index < step && styles.progressBarActive]} />
        ))}
      </View>
      <Text style={styles.progressLabel}>Step {step} of {total}</Text>
    </View>
  );
}

export function RoleCard({ title, description, icon, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.roleCard, selected && styles.roleCardSelected]}
    >
      <View style={styles.roleIcon}>
        <Ionicons name={icon} size={22} color={palette.safeDark} />
      </View>
      <View style={styles.roleCopy}>
        <Text style={styles.roleTitle}>{title}</Text>
        <Text style={styles.roleDescription}>{description}</Text>
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

export function StepCard({ title, description, icon }) {
  return (
    <View style={styles.stepCard}>
      <View style={styles.stepIcon}>
        <Ionicons name={icon} size={21} color={palette.safeDark} />
      </View>
      <View style={styles.roleCopy}>
        <Text style={styles.roleTitle}>{title}</Text>
        <Text style={styles.roleDescription}>{description}</Text>
      </View>
    </View>
  );
}

export function UpSupportMark({ size = 44, variant = "color" }) {
  return (
    <View style={[styles.markFrame, { width: size, height: size }]}>
      <Image
        source={
          variant === "white"
            ? require("../../../assets/adaptive-icon-foreground.png")
            : require("../../../assets/splash-icon.png")
        }
        accessibilityLabel="UpSupport logo"
        resizeMode="contain"
        style={{ width: size * 1.75, height: size * 1.75 }}
      />
    </View>
  );
}

export function BrandLockup({ centered = false }) {
  return (
    <View style={[styles.brandLockup, centered && styles.brandCentered]}>
      <Image
        source={require("../../../assets/upsupport-logo-horizontal.png")}
        accessibilityLabel="UpSupport"
        resizeMode="contain"
        style={styles.brandLogo}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 32 },
  screenBackButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 8,
  },
  heading: { marginTop: space.md, marginBottom: 20 },
  headingTitle: { color: palette.text, fontFamily: font.display, fontSize: 30, lineHeight: 38 },
  headingDescription: { color: palette.textMuted, fontFamily: font.body, fontSize: 16, lineHeight: 23, marginTop: 6 },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { color: palette.text, fontFamily: font.bodySemi, fontSize: 15, marginBottom: 7 },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    borderWidth: 1.5,
    borderColor: palette.border,
    borderRadius: 16,
    backgroundColor: palette.surface,
    paddingHorizontal: 15,
  },
  inputError: { borderColor: palette.danger },
  input: { flex: 1, minHeight: 52, color: palette.text, fontFamily: font.body, fontSize: 16, paddingVertical: 10 },
  multilineShell: { alignItems: "flex-start", minHeight: 96 },
  multilineInput: { minHeight: 88 },
  fieldAction: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  fieldActionText: { color: palette.safeDark, fontFamily: font.bodyBold, fontSize: 14 },
  fieldError: { color: palette.danger, fontFamily: font.bodySemi, fontSize: 14, lineHeight: 19, marginTop: 5 },
  fieldHint: { color: palette.textMuted, fontFamily: font.body, fontSize: 14, lineHeight: 19, marginTop: 5 },
  button: {
    minHeight: 56,
    borderRadius: 999,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
    marginTop: 8,
  },
  primaryButton: { backgroundColor: palette.safe, borderColor: palette.safe },
  secondaryButton: { backgroundColor: palette.surface, borderColor: palette.border },
  buttonContent: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  buttonText: { fontFamily: font.bodyBold, fontSize: 16, textAlign: "center" },
  primaryText: { color: palette.white },
  secondaryText: { color: palette.text },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
  progressHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: palette.surface, alignItems: "center", justifyContent: "center" },
  progressBars: { flex: 1, flexDirection: "row", gap: 5 },
  progressBar: { height: 4, flex: 1, borderRadius: 4, backgroundColor: palette.border },
  progressBarActive: { backgroundColor: palette.safe },
  progressLabel: { color: palette.textMuted, fontFamily: font.body, fontSize: 12 },
  roleCard: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
  },
  roleCardSelected: { borderColor: palette.safe, backgroundColor: palette.safeSoft },
  roleIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.safeSoft, alignItems: "center", justifyContent: "center" },
  roleCopy: { flex: 1 },
  roleTitle: { color: palette.text, fontFamily: font.bodyBold, fontSize: 15, lineHeight: 21 },
  roleDescription: { color: palette.textMuted, fontFamily: font.body, fontSize: 13, lineHeight: 18, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: palette.border, alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: palette.safe },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: palette.safe },
  stepCard: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 15, paddingHorizontal: 14, borderRadius: 16, backgroundColor: palette.surface, marginBottom: 10 },
  stepIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.safeSoft, alignItems: "center", justifyContent: "center" },
  markFrame: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  brandLockup: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  brandCentered: { justifyContent: "center" },
  brandLogo: { width: 240, height: 52 },
});

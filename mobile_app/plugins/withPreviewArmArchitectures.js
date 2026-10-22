const { withGradleProperties } = require("@expo/config-plugins");

module.exports = function withPreviewArmArchitectures(config) {
  return withGradleProperties(config, (modConfig) => {
    if (process.env.EAS_BUILD_PROFILE !== "preview") return modConfig;

    const key = "reactNativeArchitectures";
    const existing = modConfig.modResults.find(
      (property) => property.type === "property" && property.key === key
    );

    if (existing) {
      existing.value = "armeabi-v7a,arm64-v8a";
    } else {
      modConfig.modResults.push({
        type: "property",
        key,
        value: "armeabi-v7a,arm64-v8a",
      });
    }

    return modConfig;
  });
};

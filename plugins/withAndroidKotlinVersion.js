const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withAndroidKotlinVersion(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.contents) {
      config.modResults.contents = config.modResults.contents.replace(
        /kotlinVersion = findProperty\('android\.kotlinVersion'\) \?\: '[\d.]+'/,
        "kotlinVersion = findProperty('android.kotlinVersion') ?: '1.9.0'"
      );
    }
    return config;
  });
};
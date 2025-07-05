const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withForceKotlinVersion(config) {
  return withProjectBuildGradle(config, (config) => {
    // Kotlin 버전만 강제로 변경
    config.modResults.contents = config.modResults.contents.replace(
      /kotlinVersion\s*=\s*["'][\d.]+["']/g,
      'kotlinVersion = "1.7.20"'
    );
    
    return config;
  });
};
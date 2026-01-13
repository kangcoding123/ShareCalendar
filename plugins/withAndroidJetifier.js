const { withGradleProperties } = require('@expo/config-plugins');

module.exports = function withAndroidJetifier(config) {
  return withGradleProperties(config, (config) => {
    // Check if android.enableJetifier already exists
    const hasJetifier = config.modResults.some(
      (item) => item.type === 'property' && item.key === 'android.enableJetifier'
    );

    if (!hasJetifier) {
      config.modResults.push({
        type: 'property',
        key: 'android.enableJetifier',
        value: 'true',
      });
    }

    return config;
  });
};

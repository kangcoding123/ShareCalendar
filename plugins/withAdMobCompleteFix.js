const { withDangerousMod, withPlugins, withProjectBuildGradle, withAppBuildGradle } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withAdMobAndroidFix(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      // Fix app/build.gradle
      const appBuildGradlePath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'build.gradle'
      );
      
      if (fs.existsSync(appBuildGradlePath)) {
        let content = fs.readFileSync(appBuildGradlePath, 'utf8');
        
        // Remove duplicate plugin applications
        const lines = content.split('\n');
        const filteredLines = [];
        const appliedPlugins = new Set();
        
        for (const line of lines) {
          if (line.trim().startsWith('apply plugin:')) {
            const pluginMatch = line.match(/["']([^"']+)["']/);
            if (pluginMatch) {
              const pluginId = pluginMatch[1];
              
              // Skip library plugin if application plugin is already applied
              if (pluginId.includes('com.android.library') && 
                  (appliedPlugins.has('com.android.application') || 
                   lines.some(l => l.includes('com.android.application')))) {
                console.log(`Skipping duplicate plugin: ${pluginId}`);
                continue;
              }
              
              if (!appliedPlugins.has(pluginId)) {
                appliedPlugins.add(pluginId);
                filteredLines.push(line);
              }
            }
          } else {
            filteredLines.push(line);
          }
        }
        
        fs.writeFileSync(appBuildGradlePath, filteredLines.join('\n'));
      }
      
      // Fix settings.gradle
      const settingsGradlePath = path.join(
        config.modRequest.platformProjectRoot,
        'settings.gradle'
      );
      
      if (fs.existsSync(settingsGradlePath)) {
        let settingsContent = fs.readFileSync(settingsGradlePath, 'utf8');
        
        // Ensure proper module inclusion
        if (!settingsContent.includes("rootProject.name = 'ShareCalendar'")) {
          settingsContent = settingsContent.replace(
            /rootProject\.name\s*=\s*['"][^'"]+['"]/,
            "rootProject.name = 'ShareCalendar'"
          );
        }
        
        fs.writeFileSync(settingsGradlePath, settingsContent);
      }
      
      return config;
    },
  ]);
}

function withAdMobBuildGradleFix(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.contents) {
      let contents = config.modResults.contents;
      
      // Ensure kotlin version is consistent
      contents = contents.replace(
        /kotlinVersion\s*=\s*findProperty\('android\.kotlinVersion'\)\s*\?\:\s*['"][\d.]+['"]/g,
        "kotlinVersion = findProperty('android.kotlinVersion') ?: '1.9.0'"
      );
      
      // Add kspVersion if not present
      if (!contents.includes('kspVersion')) {
        contents = contents.replace(
          /(ext\s*{)/,
          `$1
        kspVersion = findProperty('kspVersion') ?: '1.9.0-1.0.12'`
        );
      }
      
      config.modResults.contents = contents;
    }
    return config;
  });
}

function withAdMobAppBuildGradleFix(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.contents) {
      let contents = config.modResults.contents;
      
      // Ensure google-services plugin is at the bottom
      contents = contents.replace(/apply plugin: ['"]com\.google\.gms\.google-services['"]/g, '');
      
      if (!contents.includes("apply plugin: 'com.google.gms.google-services'")) {
        contents += "\napply plugin: 'com.google.gms.google-services'";
      }
      
      config.modResults.contents = contents;
    }
    return config;
  });
}

module.exports = function withAdMobCompleteFix(config) {
  return withPlugins(config, [
    withAdMobBuildGradleFix,
    withAdMobAppBuildGradleFix,
    withAdMobAndroidFix
  ]);
};
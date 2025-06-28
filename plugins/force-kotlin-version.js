const { withDangerousMod, withProjectBuildGradle } = require('@expo/config-plugins');
const { readFileSync, writeFileSync } = require('fs');
const path = require('path');

module.exports = function withForceKotlinVersion(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const buildGradlePath = path.join(projectRoot, 'android', 'build.gradle');
      
      // build.gradle 내용 생성
      const buildGradleContent = `
// Force Kotlin version
buildscript {
    ext {
        kotlinVersion = "1.7.20"
    }
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.7.20")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
    
    // Force kotlinVersion for all subprojects
    afterEvaluate { project ->
        if (project.hasProperty("ext")) {
            project.ext.set("kotlinVersion", "1.7.20")
        }
    }
}

// Force resolution strategy
subprojects {
    configurations.all {
        resolutionStrategy {
            force "org.jetbrains.kotlin:kotlin-stdlib:1.7.20"
            force "org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.7.20"
            force "org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.7.20"
        }
    }
}
`;
      
      writeFileSync(buildGradlePath, buildGradleContent);
      
      return config;
    }
  ]);
};
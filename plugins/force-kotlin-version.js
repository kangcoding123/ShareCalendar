const { withProjectBuildGradle, withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withForceKotlinVersion(config) {
  // Project-level build.gradle 수정
  config = withProjectBuildGradle(config, (config) => {
    let { contents } = config.modResults;
    
    // ext 블록 찾기 또는 생성
    if (!contents.includes('ext {')) {
      contents = contents.replace(
        'buildscript {',
        `buildscript {
    ext {
        buildToolsVersion = "35.0.0"
        minSdkVersion = 24
        compileSdkVersion = 35
        targetSdkVersion = 34
        ndkVersion = "26.1.10909125"
        kotlinVersion = "1.7.20"
        kspVersion = "1.7.20-1.0.8"
    }`
      );
    } else {
      // ext 블록이 있으면 필요한 속성들 추가/수정
      contents = contents.replace(/ext\s*{/, `ext {
        buildToolsVersion = findProperty("buildToolsVersion") ?: "35.0.0"
        minSdkVersion = Integer.parseInt(findProperty("minSdkVersion") ?: "24")
        compileSdkVersion = Integer.parseInt(findProperty("compileSdkVersion") ?: "35")
        targetSdkVersion = Integer.parseInt(findProperty("targetSdkVersion") ?: "34")
        ndkVersion = findProperty("ndkVersion") ?: "26.1.10909125"
        kotlinVersion = findProperty("kotlinVersion") ?: "1.7.20"
        kspVersion = findProperty("kspVersion") ?: "1.7.20-1.0.8"
        `);
    }

    // Kotlin 버전 강제 변경
    contents = contents.replace(
      /kotlinVersion\s*=\s*["'][\d.]+["']/g,
      'kotlinVersion = "1.7.20"'
    );

    // allprojects 블록 추가 (없으면)
    if (!contents.includes('allprojects {')) {
      contents += `
allprojects {
    repositories {
        google()
        mavenCentral()
    }
    
    afterEvaluate { project ->
        if (project.hasProperty("android")) {
            project.android {
                ndkVersion rootProject.ext.ndkVersion
                compileSdkVersion rootProject.ext.compileSdkVersion
                buildToolsVersion rootProject.ext.buildToolsVersion
            }
        }
    }
    
    configurations.all {
        resolutionStrategy {
            force "org.jetbrains.kotlin:kotlin-stdlib:1.7.20"
            force "org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.7.20"
            force "org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.7.20"
        }
    }
}`;
    }

    config.modResults.contents = contents;
    return config;
  });

  // App-level build.gradle 수정
  config = withAppBuildGradle(config, (config) => {
    let { contents } = config.modResults;
    
    // android 블록에 필요한 설정 추가
    contents = contents.replace(
      /android\s*{/,
      `android {
    ndkVersion rootProject.ext.ndkVersion
    compileSdkVersion rootProject.ext.compileSdkVersion
    buildToolsVersion rootProject.ext.buildToolsVersion
    `
    );

    config.modResults.contents = contents;
    return config;
  });

  return config;
};
const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withForceKotlinVersion(config) {
  // Project-level build.gradle만 수정 (app-level은 건드리지 않음)
  config = withProjectBuildGradle(config, (config) => {
    let { contents } = config.modResults;
    
    // buildscript 블록 찾기
    const buildscriptIndex = contents.indexOf('buildscript {');
    if (buildscriptIndex !== -1) {
      // ext 블록이 있는지 확인
      const extIndex = contents.indexOf('ext {', buildscriptIndex);
      const buildscriptEndIndex = contents.indexOf('}', buildscriptIndex);
      
      if (extIndex === -1 || extIndex > buildscriptEndIndex) {
        // ext 블록이 없으면 추가
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
        // ext 블록이 있으면 내용 수정
        const extEndIndex = contents.indexOf('}', extIndex);
        const extContent = contents.substring(extIndex, extEndIndex + 1);
        
        // kotlinVersion이 있으면 교체
        if (extContent.includes('kotlinVersion')) {
          contents = contents.replace(
            /kotlinVersion\s*=\s*["'][\d.]+["']/g,
            'kotlinVersion = "1.7.20"'
          );
        } else {
          // kotlinVersion이 없으면 추가
          contents = contents.replace(
            /ext\s*{/,
            `ext {
        kotlinVersion = "1.7.20"
        kspVersion = "1.7.20-1.0.8"`
          );
        }
      }
    }

    // allprojects 블록에 resolutionStrategy 추가
    if (!contents.includes('resolutionStrategy')) {
      const allprojectsIndex = contents.indexOf('allprojects {');
      if (allprojectsIndex !== -1) {
        const repositoriesIndex = contents.indexOf('repositories {', allprojectsIndex);
        const repositoriesEndIndex = contents.indexOf('}', repositoriesIndex) + 1;
        
        contents = contents.substring(0, repositoriesEndIndex) + `
    
    configurations.all {
        resolutionStrategy {
            force "org.jetbrains.kotlin:kotlin-stdlib:1.7.20"
            force "org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.7.20"
            force "org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.7.20"
        }
    }` + contents.substring(repositoriesEndIndex);
      }
    }

    config.modResults.contents = contents;
    return config;
  });

  return config;
};
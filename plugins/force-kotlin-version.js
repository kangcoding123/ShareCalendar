const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withForceKotlinVersion(config) {
  return withProjectBuildGradle(config, (config) => {
    let { contents } = config.modResults;
    
    // buildscript의 ext 블록 찾기 또는 생성
    if (contents.includes('buildscript {')) {
      // ext 블록이 있는지 확인
      const buildscriptMatch = contents.match(/buildscript\s*{[^}]*}/s);
      if (buildscriptMatch && !buildscriptMatch[0].includes('ext {')) {
        // ext 블록이 없으면 추가
        contents = contents.replace(
          /buildscript\s*{/,
          `buildscript {
    ext {
        kotlinVersion = "1.7.20"
        kspVersion = "1.7.20-1.0.8"
    }`
        );
      } else {
        // ext 블록이 있으면 속성 추가/수정
        if (!contents.includes('kspVersion')) {
          contents = contents.replace(
            /ext\s*{/,
            `ext {
        kspVersion = "1.7.20-1.0.8"`
          );
        }
      }
    }
    
    // 모든 kotlinVersion 강제 변경
    contents = contents.replace(
      /kotlinVersion\s*=\s*["'][\d.]+["']/g,
      'kotlinVersion = "1.7.20"'
    );
    
    // 모든 kspVersion 강제 변경
    contents = contents.replace(
      /kspVersion\s*=\s*["'][\d.-]+["']/g,
      'kspVersion = "1.7.20-1.0.8"'
    );
    
    config.modResults.contents = contents;
    return config;
  });
};
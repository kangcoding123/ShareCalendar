const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing Kotlin and KSP versions to compatible version 1.8.10...');

const fixes = [
  {
    file: 'node_modules/react-native/gradle/libs.versions.toml',
    search: /kotlin = ".*"/g,
    replace: 'kotlin = "1.8.10"'
  },
  {
    file: 'node_modules/@react-native/gradle-plugin/gradle/libs.versions.toml',
    search: /kotlin = ".*"/g,
    replace: 'kotlin = "1.8.10"'
  },
  {
    file: 'node_modules/expo-modules-core/android/build.gradle',
    search: /buildscript\s*{/,
    replace: `buildscript {
  ext {
    kotlin_version = '1.8.10'
    compose_compiler_version = '1.4.3'
  }`
  }
];

fixes.forEach(({ file, search, replace }) => {
  const filePath = path.join(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(search, replace);
    fs.writeFileSync(filePath, content);
    console.log(`✅ Fixed: ${file}`);
  }
});

// expo-modules-core의 build.gradle에서 Compose Compiler 버전 수정
const expoModulesBuildGradle = path.join(__dirname, '../node_modules/expo-modules-core/android/build.gradle');
if (fs.existsSync(expoModulesBuildGradle)) {
  let content = fs.readFileSync(expoModulesBuildGradle, 'utf8');
  
  // Compose 비활성화 방법
  console.log('📝 Disabling Compose to fix compatibility issue...');
  
  // compose_compiler_version 변수 수정
  content = content.replace(
    /compose_compiler_version\s*=\s*["'][\d.]+["']/g,
    'compose_compiler_version = "1.4.3"'
  );
  
  // composeOptions 블록 수정
  content = content.replace(
    /composeOptions\s*{\s*kotlinCompilerExtensionVersion\s*=?\s*["']?[\d.]+["']?\s*}/gs,
    `composeOptions {
        kotlinCompilerExtensionVersion = "1.4.3"
    }`
  );
  
  // androidx.compose.compiler:compiler 직접 참조 수정
  content = content.replace(
    /androidx\.compose\.compiler:compiler:[\d.]+/g,
    'androidx.compose.compiler:compiler:1.4.3'
  );
  
  // compose BOM 버전도 호환되는 버전으로 변경
  content = content.replace(
    /androidx\.compose:compose-bom:[\d.-]+/g,
    'androidx.compose:compose-bom:2023.01.00'
  );
  
  // ext 블록에 compose_compiler_version 추가 (없을 경우)
  if (!content.includes('compose_compiler_version')) {
    content = content.replace(
      /ext\s*{/,
      `ext {
        compose_compiler_version = '1.4.3'`
    );
  }
  
  // Compose 비활성화
  content = content.replace(
    /buildFeatures\s*{[^}]*}/gs,
    `buildFeatures {
      compose false
      buildConfig true
      viewBinding true
    }`
  );
  
  // Compose 관련 dependencies 주석 처리
  content = content.replace(
    /dependencies\s*{([^}]*)}/gs,
    (match, dependencies) => {
      const modifiedDeps = dependencies.replace(
        /implementation\s*["']androidx\.compose[^"'\n]+["']/g,
        match => `// ${match} - Disabled for Kotlin compatibility`
      );
      return `dependencies {${modifiedDeps}}`;
    }
  );
  
  fs.writeFileSync(expoModulesBuildGradle, content);
  console.log('✅ Updated expo-modules-core build.gradle with Compose Compiler 1.4.3');
}

// expo-modules-core의 gradle.properties 생성/수정
const expoModulesGradleProps = path.join(__dirname, '../node_modules/expo-modules-core/android/gradle.properties');
const expoGradlePropsContent = `
kotlin.version=1.8.10
kspVersion=1.8.10-1.0.9
android.jetpack.compose.suppressKotlinVersionCompatibilityCheck=true
kotlin.suppressKotlinVersionCompatibilityCheck=true
kotlin.jvm.target=11
compose.compiler.version=1.4.3
`;

fs.writeFileSync(expoModulesGradleProps, expoGradlePropsContent);
console.log('✅ Created/Updated expo-modules-core gradle.properties');

// Google Mobile Ads 관련 수정
const googleAdsGradlePath = path.join(__dirname, '../node_modules/react-native-google-mobile-ads/android/build.gradle');
if (fs.existsSync(googleAdsGradlePath)) {
  let content = fs.readFileSync(googleAdsGradlePath, 'utf8');
  
  // buildscript에 kotlin 버전 고정
  if (!content.includes("kotlin_version = '1.8.10'")) {
    content = content.replace(
      /buildscript\s*{/,
      `buildscript {
  ext {
    kotlin_version = '1.8.10'
  }`
    );
  }
  
  // KSP 버전 설정
  content = content.replace(
    /kspVersion\s*=\s*["'][\d.-]+["']/g,
    "kspVersion = '1.8.10-1.0.9'"
  );
  
  fs.writeFileSync(googleAdsGradlePath, content);
  console.log('✅ Fixed Google Mobile Ads Kotlin version');
}

// Android 프로젝트의 gradle.properties 수정
const gradlePropertiesPath = path.join(__dirname, '../android/gradle.properties');
if (fs.existsSync(gradlePropertiesPath)) {
  let content = fs.readFileSync(gradlePropertiesPath, 'utf8');
  
  // Compose Compiler 버전 설정 추가
  if (!content.includes('compose.compiler.version')) {
    content += '\n# Compose Compiler version override\n';
    content += 'compose.compiler.version=1.4.3\n';
  }
  
  if (!content.includes('kspVersion')) {
    content += '\n# KSP version\n';
    content += 'kspVersion=1.8.10-1.0.9\n';
  }
  
  if (!content.includes('suppressKotlinVersionCompatibilityCheck')) {
    content += '\n# Compose compatibility\n';
    content += 'android.jetpack.compose.suppressKotlinVersionCompatibilityCheck=true\n';
    content += 'kotlin.suppressKotlinVersionCompatibilityCheck=true\n';
  }
  
  fs.writeFileSync(gradlePropertiesPath, content);
  console.log('✅ Updated Android gradle.properties');
}

// 추가: expo-modules-core의 다른 Compose 관련 설정 확인
const checkAndFixComposeReferences = (filePath) => {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Compose 버전 1.3.x 참조를 1.4.3으로 변경
    if (content.includes('1.3.')) {
      content = content.replace(/1\.3\.\d+/g, '1.4.3');
      modified = true;
    }
    
    // KSP 버전 수정
    if (content.includes('ksp')) {
      content = content.replace(
        /kspVersion\s*=\s*["'][\d.-]+["']/g,
        "kspVersion = '1.8.10-1.0.9'"
      );
      modified = true;
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Fixed versions in ${path.basename(filePath)}`);
    }
  }
};

// 다양한 위치의 gradle 파일 확인
const gradleFiles = [
  'node_modules/expo-modules-core/android/gradle.properties',
  'node_modules/expo-modules-core/android/settings.gradle',
  'node_modules/expo/android/build.gradle'
];

gradleFiles.forEach(checkAndFixComposeReferences);

console.log('\n✅ Kotlin 1.8.10 and KSP compatibility fixes applied!');
console.log('📌 Compose has been disabled in expo-modules-core');
console.log('\n🔄 Next steps:');
console.log('   1. Clear caches: rm -rf node_modules/.cache');
console.log('   2. Clean build: cd android && ./gradlew clean');
console.log('   3. Build: eas build --platform android --profile production --clear-cache');
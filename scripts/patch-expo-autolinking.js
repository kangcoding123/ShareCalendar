// scripts/patch-expo-autolinking.js
const fs = require('fs');
const path = require('path');

console.log('Patching expo-modules-autolinking...');

// autolinking_implementation.gradle 파일 경로
const autolinkingPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-modules-autolinking',
  'scripts',
  'android',
  'autolinking_implementation.gradle'
);

if (fs.existsSync(autolinkingPath)) {
  let content = fs.readFileSync(autolinkingPath, 'utf8');
  
  // 333번째 줄 근처의 문제가 되는 부분을 찾아서 수정
  const lines = content.split('\n');
  
  // gradle.afterProject 부분 찾기
  for (let i = 0; i < lines.length; i++) {
    // expo-module-gradle-plugin 적용 부분 찾기
    if (lines[i].includes("println \" ${Emojis.INFORMATION}  ${Colors.YELLOW}Applying gradle plugin${Colors.RESET}") && 
        lines[i].includes("expo-module-gradle-plugin")) {
      
      // 다음 줄에 있는 project.plugins.apply 찾기
      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        if (lines[j].includes('project.plugins.apply(modulePlugin.id)')) {
          // 조건문으로 감싸기
          lines[j] = `          if (project.name != 'app') {
            ${lines[j]}
          } else {
            println " ${Emojis.INFORMATION}  ${Colors.YELLOW}Skipping gradle plugin${Colors.RESET} '${Colors.GREEN}${modulePlugin.id}${Colors.RESET}' for app project"
          }`;
          console.log(`Patched line ${j + 1}`);
          break;
        }
      }
    }
  }
  
  // 수정된 내용 저장
  const modifiedContent = lines.join('\n');
  fs.writeFileSync(autolinkingPath, modifiedContent);
  
  console.log('Successfully patched expo-modules-autolinking!');
} else {
  console.error('Could not find autolinking_implementation.gradle');
  process.exit(1);
}

// 백업 생성
const backupPath = autolinkingPath + '.backup';
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(autolinkingPath, backupPath);
  console.log('Backup created at:', backupPath);
}
// constants/Colors.ts
const tintColorLight = '#3c66af';  // WE:IN 앱의 기본 파란색
const tintColorDark = '#4e7bd4';   // 다크 모드에서는 약간 밝은 파란색

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    card: '#ffffff',
    cardText: '#333333',
    tint: tintColorLight,
    tabIconDefault: '#888888',
    tabIconSelected: tintColorLight,
    secondary: '#f8f9fa',
    border: '#eeeeee',
    headerBackground: '#ffffff',
    inputBackground: '#f9f9f9',
    inputBorder: '#dddddd',
    buttonBackground: '#3c66af',
    buttonText: '#ffffff',
    disabledButton: '#a0a0a0',
    eventCardBackground: '#f9f9f9',
    lightGray: '#666666',
    darkGray: '#495057'
  },
  dark: {
    text: '#ffffff',
    background: '#121212',
    card: '#1e1e1e',
    cardText: '#e0e0e0',
    tint: tintColorDark,
    tabIconDefault: '#888888',
    tabIconSelected: tintColorDark,
    secondary: '#242424',
    border: '#333333',
    headerBackground: '#1e1e1e',
    inputBackground: '#2c2c2c',
    inputBorder: '#444444',
    buttonBackground: '#4e7bd4',
    buttonText: '#ffffff',
    disabledButton: '#555555',
    eventCardBackground: '#2c2c2c',
    lightGray: '#bbbbbb',
    darkGray: '#aaaaaa'
  }
};
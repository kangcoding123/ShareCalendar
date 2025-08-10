const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Asset 확장자 설정
config.resolver.assetExts.push('db');

// 번들링 최적화 설정 추가
config.transformer = {
  ...config.transformer,
  minifierConfig: {
    keep_fnames: true, // 함수 이름 유지
    mangle: {
      keep_fnames: true, // 함수 이름 유지
    },
  },
};

// 모듈 해결 최적화
config.resolver = {
  ...config.resolver,
  resolverMainFields: ['react-native', 'browser', 'main'],
};

// react-native-google-mobile-ads 모듈이 항상 포함되도록 설정
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'react-native-google-mobile-ads': __dirname + '/node_modules/react-native-google-mobile-ads',
};

module.exports = config;
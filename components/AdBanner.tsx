// components/AdBanner.tsx
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

interface AdBannerProps {
  size?: 'banner' | 'largeBanner';
}

const AdBanner = ({ size = 'banner' }: AdBannerProps) => {
  // 개발 모드에서는 더미 배너 표시
  if (__DEV__) {
    return (
      <View style={[styles.container, styles.devBanner]}>
        <WebView
          style={styles.webView}
          source={{ html: getDummyAdHTML() }}
          scrollEnabled={false}
        />
      </View>
    );
  }

  // 프로덕션 모드에서는 실제 카카오 애드핏 광고 표시 (비추적 모드로 설정)
  return (
    <View style={styles.container}>
      <WebView
        style={styles.webView}
        source={{ html: getKakaoAdFitHTML('ADFIT_UNIT_ID_여기에_삽입') }}
        scrollEnabled={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        // 사용자 추적 비활성화
        incognito={true} // 웹뷰 개인 정보 보호 모드
        thirdPartyCookiesEnabled={false} // 서드파티 쿠키 비활성화
        // 추가 개인정보 보호 옵션
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
      />
    </View>
  );
};

// 실제 카카오 애드핏 HTML 코드 생성
const getKakaoAdFitHTML = (unitId: string) => {
  const width = 320;
  const height = 50;

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { margin: 0; padding: 0; overflow: hidden; }
        </style>
      </head>
      <body>
        <ins class="kakao_ad_area" style="display:none;"
          data-ad-unit="${unitId}"
          data-ad-width="${width}"
          data-ad-height="${height}"></ins>
        <script type="text/javascript" src="//t1.daumcdn.net/kas/static/ba.min.js" async></script>
      </body>
    </html>
  `;
};

// 개발 모드용 더미 HTML 코드 생성
const getDummyAdHTML = () => {
  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 50px;
            background-color: #f0f0f0;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          }
          .ad-text {
            color: #999;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="ad-text">카카오 애드핏 광고 영역 (개발 모드)</div>
      </body>
    </html>
  `;
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 50,
    overflow: 'hidden',
  },
  webView: {
    width: '100%',
    height: '100%',
  },
  devBanner: {
    backgroundColor: '#f0f0f0',
  }
});

export default AdBanner;

// components/AdBanner.tsx
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

interface AdBannerProps {
  size?: 'banner' | 'largeBanner';
}

const AdBanner = ({ size = 'banner' }: AdBannerProps) => {
  // 항상 실제 카카오 애드핏 광고 표시
  return (
    <View style={styles.container}>
      <WebView
        key="adfit-webview" // 고유 키 추가하여 경고 방지
        style={styles.webView}
        source={{ html: getKakaoAdFitHTML('DAN-GMYukMAURn2LZOoR') }}
        scrollEnabled={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        // 개인정보 보호 관련 속성들
        incognito={true}
        thirdPartyCookiesEnabled={false}
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

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 50,
    overflow: 'hidden',
  },
  webView: {
    width: '100%',
    height: '100%',
  }
});

export default AdBanner;
// components/AdBanner.tsx
import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { getAdConfig } from '../services/adConfigService';

interface AdBannerProps {
  size?: 'banner' | 'largeBanner';
  unitId?: string; // 직접 unitId를 전달받을 수 있도록 선택적 prop 추가
}

const AdBanner = ({ size = 'banner', unitId }: AdBannerProps) => {
  const [adUnitId, setAdUnitId] = useState<string>(unitId || '');
  const [adEnabled, setAdEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);

  // unitId가 없을 경우 Firestore에서 가져오기
  useEffect(() => {
    const fetchAdConfig = async () => {
      if (!unitId) {
        try {
          const result = await getAdConfig();
          if (result.success && result.config) {
            setAdUnitId(result.config.banner_unit_id);
            setAdEnabled(result.config.ad_enabled);
            console.log('광고 설정 로드 성공:', result.config);
          } else {
            console.log('광고 설정이 없거나 로드 실패');
          }
        } catch (error) {
          console.error('광고 설정 로드 오류:', error);
        }
      } else {
        // unitId가 직접 전달된 경우
        setAdUnitId(unitId);
      }
      setLoading(false);
    };

    fetchAdConfig();
  }, [unitId]);

  // 광고 ID가 없거나 광고가 비활성화되었거나 로딩 중이면 빈 컨테이너 반환
  if (!adUnitId || !adEnabled || loading) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <WebView
        key={`adfit-webview-${adUnitId}`}
        style={styles.webView}
        source={{ html: getKakaoAdFitHTML(adUnitId) }}
        scrollEnabled={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        incognito={true}
        thirdPartyCookiesEnabled={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
      />
    </View>
  );
};

// 카카오 애드핏 HTML 코드 생성
const getKakaoAdFitHTML = (unitId: string) => {
  const width = 320;
  const height = 50;

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { margin: 0; padding: 0; overflow: hidden; background-color: transparent; }
          .adfit-container { display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        <div class="adfit-container">
          <ins class="kakao_ad_area" style="display:none;"
            data-ad-unit="${unitId}"
            data-ad-width="${width}"
            data-ad-height="${height}"></ins>
        </div>
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
    backgroundColor: 'transparent',
  },
  webView: {
    width: '100%',
    height: '100%',
  }
});

export default AdBanner;
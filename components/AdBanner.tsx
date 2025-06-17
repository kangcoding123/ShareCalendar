// components/AdBanner.tsx (디버그 버전)
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { getAdConfig } from '../services/adConfigService';

console.log('[AdBanner] 파일 로드됨');

interface AdBannerProps {
  size?: 'banner' | 'largeBanner';
  unitId?: string;
}

const AdBanner = ({ size = 'banner', unitId }: AdBannerProps) => {
  console.log('[AdBanner] 컴포넌트 렌더링 시작');
  
  const [adConfig, setAdConfig] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 광고 크기 설정
  const adSizes = {
    banner: { width: 320, height: 50 },
    largeBanner: { width: 320, height: 100 }
  };

  const { width: adWidth, height: adHeight } = adSizes[size];

  useEffect(() => {
    console.log('[AdBanner] useEffect 실행');
    loadAdConfig();
  }, []);

  const loadAdConfig = async () => {
    console.log('[AdBanner] loadAdConfig 시작');
    try {
      const result = await getAdConfig();
      console.log('[AdBanner] getAdConfig 결과:', JSON.stringify(result, null, 2));
      
      if (result.success && result.config) {
        console.log('[AdBanner] 광고 설정 로드 성공');
        setAdConfig(result.config);
      } else {
        console.log('[AdBanner] 광고 설정 로드 실패');
        setLoadError('광고 설정 로드 실패');
      }
    } catch (error) {
      console.error('[AdBanner] 광고 설정 로드 오류:', error);
      setLoadError('광고 설정 로드 오류');
    }
    setIsLoading(false);
  };

  // 디버그: 항상 무언가를 표시
  if (isLoading) {
    return (
      <View style={[styles.debugContainer, { height: adHeight }]}>
        <ActivityIndicator size="small" color="#999" />
        <Text style={styles.debugText}>광고 로딩중...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.debugContainer, { height: adHeight }]}>
        <Text style={styles.errorText}>{loadError}</Text>
      </View>
    );
  }

  if (!adConfig) {
    return (
      <View style={[styles.debugContainer, { height: adHeight }]}>
        <Text style={styles.errorText}>광고 설정 없음</Text>
      </View>
    );
  }

  // 광고 비활성화 상태도 표시
  if (!adConfig.ad_enabled) {
    return (
      <View style={[styles.debugContainer, { height: adHeight }]}>
        <Text style={styles.debugText}>광고 비활성화됨</Text>
        <Text style={styles.debugSubText}>ad_enabled: false</Text>
      </View>
    );
  }

  // 테스트 모드
  if (adConfig.test_mode) {
    console.log('[AdBanner] 테스트 모드 활성화');
    return (
      <View style={[styles.container, { height: adHeight }]}>
        <View style={styles.testBanner}>
          <Text style={styles.testText}>테스트 광고 영역</Text>
          <Text style={styles.testSubText}>Unit ID: {unitId || adConfig.banner_unit_id}</Text>
        </View>
      </View>
    );
  }

  console.log('[AdBanner] 실제 광고 렌더링');
  const finalUnitId = unitId || adConfig.banner_unit_id;

  // 애드핏 광고 HTML
  const adHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: #f0f0f0;
        }
        .adfit-container {
          width: ${adWidth}px;
          height: ${adHeight}px;
          background-color: #e0e0e0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .debug {
          font-size: 10px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="adfit-container" id="adContainer">
        <div class="debug" id="debug">광고 로딩중...</div>
        <ins class="kakao_ad_area" 
             style="display:none;" 
             data-ad-unit="${finalUnitId}" 
             data-ad-width="${adWidth}" 
             data-ad-height="${adHeight}">
        </ins>
      </div>
      <script type="text/javascript" src="//t1.daumcdn.net/kas/static/ba.min.js" async></script>
      <script>
        document.getElementById('debug').innerHTML = 'Unit: ${finalUnitId.substring(0, 10)}...';
        
        setTimeout(function() {
          var adArea = document.querySelector('.kakao_ad_area');
          if (adArea && adArea.children.length > 0) {
            document.getElementById('debug').style.display = 'none';
          } else {
            document.getElementById('debug').innerHTML = '광고 없음';
          }
        }, 3000);
      </script>
    </body>
    </html>
  `;

  return (
    <View style={[styles.container, { height: adHeight + 10 }]}>
      <WebView
        source={{ html: adHtml }}
        style={[styles.webView, { height: adHeight }]}
        onLoadEnd={() => console.log('[AdBanner] WebView 로드 완료')}
        onError={(e) => console.log('[AdBanner] WebView 에러:', e.nativeEvent)}
        onMessage={(event) => {
          console.log('[AdBanner] WebView 메시지:', event.nativeEvent.data);
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scrollEnabled={false}
        originWhitelist={['*']}
        mixedContentMode="always"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    marginVertical: 5,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
    minHeight: 50,
  },
  debugContainer: {
    width: '100%',
    backgroundColor: '#ffe0e0',
    marginVertical: 5,
    borderWidth: 1,
    borderColor: '#ff6666',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  debugText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 8,
  },
  debugSubText: {
    fontSize: 10,
    color: '#999',
    marginLeft: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#ff0000',
  },
  testBanner: {
    flex: 1,
    backgroundColor: '#e0e0e0',
    borderWidth: 1,
    borderColor: '#999',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  testText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
  },
  testSubText: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
});

console.log('[AdBanner] 컴포넌트 정의 완료');

export default AdBanner;
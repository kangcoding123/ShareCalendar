// components/AdBanner.tsx
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, Dimensions, Platform } from 'react-native';
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

  // 화면 너비 가져오기
  const screenWidth = Dimensions.get('window').width;
  
  // 광고 크기 설정 (화면 너비에 맞춤)
  const adSizes = {
    banner: { width: Math.min(screenWidth, 320), height: 50 },
    largeBanner: { width: Math.min(screenWidth, 320), height: 100 }
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

  // 로딩 중
  if (isLoading) {
    return (
      <View style={[styles.container, { height: adSizes[size].height }]}>
        <ActivityIndicator size="small" color="#999" />
      </View>
    );
  }

  // 에러 발생 시 빈 공간 반환 (광고 영역은 유지)
  if (loadError || !adConfig) {
    return <View style={[styles.container, { height: adSizes[size].height }]} />;
  }

  // 광고 비활성화 시 빈 공간 반환
  if (!adConfig.ad_enabled) {
    return <View style={[styles.container, { height: adSizes[size].height }]} />;
  }

  console.log('[AdBanner] 실제 광고 렌더링');
  const finalUnitId = unitId || 
  (Platform.OS === 'ios' ? adConfig.ios_banner_unit_id : adConfig.android_banner_unit_id) || 
  adConfig.banner_unit_id;

  // 카카오 애드핏 공식 가이드에 맞춘 HTML (보안 정책 및 동적 로드 추가)
  const adHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src *; img-src * data: blob: 'unsafe-inline'; frame-src *; style-src * 'unsafe-inline';">
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: transparent;
          overflow: hidden;
        }
        html, body {
          width: 100%;
          height: 100%;
        }
        .adfit-container {
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: transparent;
        }
        /* 광고 로드 전 표시될 placeholder */
        .ad-placeholder {
          position: absolute;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #fafafa;
          z-index: 1;
        }
        .ad-placeholder-text {
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 12px;
          color: #c0c0c0;
          letter-spacing: 0.5px;
          font-weight: 500;
        }
        .kakao_ad_area {
          position: relative;
          z-index: 10;
          display: block !important;
          margin: 0 auto;
        }
        /* 광고 iframe 스타일 조정 */
        .kakao_ad_area iframe {
          display: block !important;
          margin: 0 auto !important;
        }
      </style>
    </head>
    <body>
      <div class="adfit-container">
        <div class="ad-placeholder" id="placeholder">
          <span class="ad-placeholder-text">AD</span>
        </div>
        <ins class="kakao_ad_area" 
             style="display:none;" 
             data-ad-unit="${finalUnitId}" 
             data-ad-width="${adWidth}" 
             data-ad-height="${adHeight}">
        </ins>
      </div>
      <script>
        // React Native로 메시지 전송
        function sendMessage(msg) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify(msg));
          }
        }
        
        // XMLHttpRequest 모니터링
        var originalXHR = window.XMLHttpRequest;
        window.XMLHttpRequest = function() {
          var xhr = new originalXHR();
          var originalOpen = xhr.open;
          xhr.open = function(method, url) {
            sendMessage({type: 'network', method: method, url: url});
            return originalOpen.apply(xhr, arguments);
          };
          return xhr;
        };
        
        sendMessage({type: 'log', message: '페이지 로드 시작'});
        sendMessage({type: 'log', message: 'Unit ID: ${finalUnitId}'});
        
        // 동적으로 애드핏 스크립트 로드
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = 'https://t1.daumcdn.net/kas/static/ba.min.js';
        script.async = true;
        
        script.onload = function() {
          sendMessage({type: 'script_loaded', message: '애드핏 스크립트 로드 성공'});
          
          // 카카오 객체 확인
          setTimeout(function() {
            sendMessage({
              type: 'adfit_check',
              hasKakao: typeof window.kakao !== 'undefined',
              hasAdfit: typeof window.kakao !== 'undefined' && typeof window.kakao.adfit !== 'undefined'
            });
          }, 1000);
        };
        
        script.onerror = function(e) {
          sendMessage({type: 'script_error', message: '애드핏 스크립트 로드 실패'});
        };
        
        // 스크립트를 head에 추가
        document.head.appendChild(script);
        
        // 광고 로드 체크
        var checkCount = 0;
        var checkInterval = setInterval(function() {
          var adArea = document.querySelector('.kakao_ad_area');
          checkCount++;
          
          if (adArea) {
            var hasIframe = adArea.querySelector('iframe') !== null;
            var adStyle = window.getComputedStyle(adArea);
            var hasContent = adArea.innerHTML.trim().length > 0;
            
            sendMessage({
              type: 'adCheck',
              checkCount: checkCount,
              hasIframe: hasIframe,
              display: adStyle.display,
              hasContent: hasContent,
              innerHTML: adArea.innerHTML.substring(0, 100)
            });
            
            if (hasIframe || (hasContent && adStyle.display !== 'none')) {
              var placeholder = document.getElementById('placeholder');
              if (placeholder) {
                placeholder.style.opacity = '0';
                placeholder.style.transition = 'opacity 0.3s ease-out';
                setTimeout(function() {
                  placeholder.style.display = 'none';
                }, 300);
              }
              sendMessage({type: 'log', message: '광고 로드 완료!'});
              clearInterval(checkInterval);
            }
          }
          
          if (checkCount > 30) {
            sendMessage({type: 'log', message: '광고 로드 타임아웃 - placeholder 유지'});
            clearInterval(checkInterval);
          }
        }, 500);
        
        // 에러 핸들링
        window.addEventListener('error', function(e) {
          sendMessage({
            type: 'error',
            message: e.message,
            filename: e.filename,
            lineno: e.lineno
          });
        });
        
        // 페이지 로드 완료 시 추가 체크
        window.addEventListener('load', function() {
          sendMessage({
            type: 'page_loaded',
            hasKakao: typeof window.kakao !== 'undefined',
            url: window.location.href
          });
        });
      </script>
    </body>
    </html>
  `;

  return (
    <View style={[styles.container, { height: adHeight }]}>
      <WebView
        source={{ html: adHtml }}
        style={{ width: '100%', height: adHeight }}
        onLoadEnd={() => console.log('[AdBanner] WebView 로드 완료')}
        onError={(e) => console.log('[AdBanner] WebView 에러:', e.nativeEvent)}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            console.log('[AdBanner WebView]', data);
          } catch (e) {
            console.log('[AdBanner WebView Raw]', event.nativeEvent.data);
          }
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scrollEnabled={false}
        scalesPageToFit={false}
        originWhitelist={['*']}
        mixedContentMode="always"
        onShouldStartLoadWithRequest={() => true}
        // iOS 추가 설정
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        // 디버깅용
        webviewDebuggingEnabled={true}
        // User-Agent 설정 추가
        userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAO_ADFIT_APP"
        // 쿠키 및 캐시 활성화
        sharedCookiesEnabled={true}
        cacheEnabled={true}
        // iOS 추가 보안 설정
        allowsBackForwardNavigationGestures={false}
        allowsLinkPreview={false}
        // 스크롤 바운스 비활성화
        bounces={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
});

console.log('[AdBanner] 컴포넌트 정의 완료');

export default AdBanner;
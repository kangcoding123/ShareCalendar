// components/AdMobBanner.tsx
import React, { useEffect, useState, memo, useRef } from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';
import { getAdConfig } from '../services/adConfigService';

// 정적 import로 변경 - Metro 번들러가 인식할 수 있도록
let BannerAd: any = null;
let BannerAdSize: any = null;
let TestIds: any = null;
let MobileAds: any = null;

// try-catch로 안전하게 import
try {
  const admobModule = require('react-native-google-mobile-ads');
  BannerAd = admobModule.BannerAd;
  BannerAdSize = admobModule.BannerAdSize;
  TestIds = admobModule.TestIds;
  MobileAds = admobModule.default;
} catch (error) {
  console.log('AdMob module not available:', error);
}

// 애드몹 광고 ID
const adUnitIds = {
  ios: 'ca-app-pub-7310506169021656/3493072152',
  android: 'ca-app-pub-7310506169021656/1974323964',
};

interface AdMobBannerProps {
  size?: 'banner' | 'largeBanner';
}

// 초기화 상태를 전역으로 관리
let isAdMobInitialized = false;
let initializationPromise: Promise<void> | null = null;

export const initializeAdMob = async () => {
  if (isAdMobInitialized || !MobileAds) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = MobileAds()
    .initialize()
    .then(() => {
      console.log('AdMob initialized successfully');
      isAdMobInitialized = true;
    })
    .catch((error: any) => {
      console.error('AdMob initialization error:', error);
      // 초기화 실패해도 앱은 계속 동작하도록
      isAdMobInitialized = false;
    });

  return initializationPromise;
};

const AdMobBanner = memo(({ size = 'banner' }: AdMobBannerProps) => {
  const [isEnabled, setIsEnabled] = useState(true);
  const [isTestMode, setIsTestMode] = useState(__DEV__);
  const [adError, setAdError] = useState(false);
  const [customAdUnitId, setCustomAdUnitId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const isInitialized = useRef(false);

  useEffect(() => {
    const setup = async () => {
      if (!isInitialized.current) {
        isInitialized.current = true;

        // AdMob 초기화 (프로덕션에서만)
        if (!__DEV__ && MobileAds) {
          await initializeAdMob();
        }

        // 광고 설정 로드
        await loadAdConfig();

        setIsReady(true);
      }
    };

    setup();
  }, []);

  const loadAdConfig = async () => {
    try {
      const result = await getAdConfig();
      if (result.success && result.config) {
        setIsEnabled(result.config.ad_enabled);
        setIsTestMode(result.config.test_mode);

        if (result.config.ios_banner_unit_id || result.config.android_banner_unit_id) {
          const platformId = Platform.select({
            ios: result.config.ios_banner_unit_id,
            android: result.config.android_banner_unit_id,
          });

          if (platformId) {
            setCustomAdUnitId(platformId);
          }
        }
      }
    } catch (error) {
      console.error('광고 설정 로드 오류:', error);
      setIsEnabled(true);
      setIsTestMode(__DEV__);
    }
  };

  // 개발 환경에서는 플레이스홀더 표시
  if (__DEV__) {
    return (
      <View style={[styles.container, styles.placeholder]}>
        <Text style={styles.placeholderText}>광고 영역 (개발 모드)</Text>
      </View>
    );
  }

  // AdMob 모듈이 없거나 초기화 전이면 빈 공간 유지
  if (!BannerAd || !isReady) {
    return <View style={[styles.container, { height: 60 }]} />;
  }

  // 광고가 비활성화되면 빈 공간 유지
  if (!isEnabled) {
    return <View style={[styles.container, { height: 60 }]} />;
  }

  // 광고 에러 시 빈 공간 유지
  if (adError) {
    return <View style={[styles.container, { height: 60 }]} />;
  }

  // 광고 ID 결정
  const unitId = isTestMode
    ? TestIds?.BANNER || 'ca-app-pub-3940256099942544/6300978111' // 기본 테스트 ID
    : customAdUnitId || Platform.select({
        ios: adUnitIds.ios,
        android: adUnitIds.android,
      }) || adUnitIds.android;

  try {
    return (
      <View style={styles.container}>
        <BannerAd
          unitId={unitId}
          size={BannerAdSize?.ANCHORED_ADAPTIVE_BANNER || 'ANCHORED_ADAPTIVE_BANNER'}
          requestOptions={{
            requestNonPersonalizedAdsOnly: true,
          }}
          onAdLoaded={() => {
            console.log('광고 로드 완료');
            setAdError(false);
          }}
          onAdFailedToLoad={(error: any) => {
            console.error('광고 로드 실패:', error);
            setAdError(true);
            // 30초 후 재시도
            setTimeout(() => {
              console.log('광고 재시도 중...');
              setAdError(false);
            }, 30000);
          }}
        />
      </View>
    );
  } catch (error) {
    console.error('광고 렌더링 오류:', error);
    return <View style={[styles.container, { height: 60 }]} />;
  }
});

AdMobBanner.displayName = 'AdMobBanner';

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  placeholder: {
    height: 50,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 12,
    color: '#999',
  },
});

export default AdMobBanner;

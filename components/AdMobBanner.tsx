// components/AdMobBanner.tsx
import React, { useEffect, useState, memo, useRef } from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';
import { getAdConfig } from '../services/adConfigService';

// AdMob 모듈 import
let BannerAd: any = null;
let BannerAdSize: any = null;
let TestIds: any = null;
let MobileAds: any = null;

try {
  const admobModule = require('react-native-google-mobile-ads');
  BannerAd = admobModule.BannerAd;
  BannerAdSize = admobModule.BannerAdSize;
  TestIds = admobModule.TestIds;
  MobileAds = admobModule.default;
} catch (error) {
  console.log('AdMob module not available:', error);
}

interface AdMobBannerProps {
  size?: 'banner' | 'largeBanner';
}

// 초기화 상태 전역 관리
let isAdMobInitialized = false;
let initializationPromise: Promise<void> | null = null;

const initializeAdMob = async () => {
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
      isAdMobInitialized = false;
    });
  
  return initializationPromise;
};

const AdMobBanner = memo(({ size = 'banner' }: AdMobBannerProps) => {
  // 1️⃣ 기본값으로 즉시 시작
  const [adUnitId, setAdUnitId] = useState(() => {
    return Platform.select({
      ios: 'ca-app-pub-7310506169021656/3493072152',
      android: 'ca-app-pub-7310506169021656/1974323964',
    });
  });
  
  const [isEnabled, setIsEnabled] = useState(true);
  const [adError, setAdError] = useState(false);
  const [isTestMode, setIsTestMode] = useState(__DEV__);
  
  const hasCheckedFirebase = useRef(false);

  useEffect(() => {
    // AdMob 초기화 (프로덕션에서만)
    if (!__DEV__ && MobileAds) {
      initializeAdMob();
    }
    
    // 2️⃣ 백그라운드에서 Firebase 체크
    if (!hasCheckedFirebase.current) {
      hasCheckedFirebase.current = true;
      checkFirebaseConfig();
    }
  }, []);

  const checkFirebaseConfig = async () => {
    try {
      // 약간의 지연 후 Firebase 조회 (광고 로드 우선순위)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const result = await getAdConfig();
      if (result.success && result.config) {
        console.log('Firebase 광고 설정 로드 완료');
        
        // 광고 활성화 상태 체크
        if (!result.config.ad_enabled) {
          console.log('광고가 비활성화되어 있음');
          setIsEnabled(false);
        }
        
        // 테스트 모드 체크
        setIsTestMode(result.config.test_mode || __DEV__);
        
        // 커스텀 광고 ID가 있으면 업데이트
        const customId = Platform.select({
          ios: result.config.ios_banner_unit_id,
          android: result.config.android_banner_unit_id,
        });
        
        if (customId && customId !== adUnitId) {
          console.log('광고 ID 업데이트:', customId);
          setAdUnitId(customId);
        }
      }
    } catch (error) {
      // Firebase 조회 실패해도 기본값으로 계속 작동
      console.log('Firebase 조회 실패, 기본 설정 유지');
    }
  };

  // 개발 환경에서는 플레이스홀더
  if (__DEV__) {
    return (
      <View style={[styles.container, styles.placeholder]}>
        <Text style={styles.placeholderText}>광고 영역 (개발 모드)</Text>
      </View>
    );
  }

  // AdMob 모듈이 없으면 빈 공간 유지
  if (!BannerAd) {
    return <View style={[styles.container, { height: 60 }]} />;
  }

  // 광고 비활성화면 빈 공간 유지
  if (!isEnabled) {
    return <View style={[styles.container, { height: 60 }]} />;
  }

  // 광고 오류 시 빈 공간 유지
  if (adError) {
    return <View style={[styles.container, { height: 60 }]} />;
  }

  // 테스트 모드 체크
  const finalAdUnitId = isTestMode 
    ? (TestIds?.BANNER || 'ca-app-pub-3940256099942544/6300978111')
    : adUnitId;

  return (
    <View style={[styles.container, { minHeight: 60 }]}>
      <BannerAd
        unitId={finalAdUnitId}
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
        }}
      />
    </View>
  );
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
    height: 60,
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
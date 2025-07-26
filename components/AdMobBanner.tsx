import React, { useEffect, useState, memo, useRef } from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';
import Constants from 'expo-constants';
import { getAdConfig } from '../services/adConfigService';

// AdMob 모듈 조건부 import
let BannerAd: any;
let BannerAdSize: any;
let TestIds: any;

try {
  const admob = require('react-native-google-mobile-ads');
  BannerAd = admob.BannerAd;
  BannerAdSize = admob.BannerAdSize;
  TestIds = admob.TestIds;
} catch (error) {
  console.log('AdMob not available in Expo Go');
}

// 애드몹 광고 ID
const adUnitIds = {
  ios: 'ca-app-pub-7310506169021656/3493072152',
  android: 'ca-app-pub-7310506169021656/1974323964',
};

interface AdMobBannerProps {
  size?: 'banner' | 'largeBanner';
}

// 🔥 memo로 감싸서 불필요한 리렌더링 방지
const AdMobBanner = memo(({ size = 'banner' }: AdMobBannerProps) => {
  const [isEnabled, setIsEnabled] = useState(true);
  const [isTestMode, setIsTestMode] = useState(false);
  const [adError, setAdError] = useState(false);
  
  // 🔥 설정 로드는 한 번만
  const isInitialized = useRef(false);

  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true;
      loadAdConfig();
    }
  }, []);

  const loadAdConfig = async () => {
    try {
      const result = await getAdConfig();
      if (result.success && result.config) {
        setIsEnabled(result.config.ad_enabled);
        setIsTestMode(result.config.test_mode);
      }
    } catch (error) {
      console.error('광고 설정 로드 오류:', error);
    }
  };

  // Expo Go에서는 아무것도 표시하지 않음 (공간 차지 X)
  if (!BannerAd || Constants.appOwnership === 'expo') {
    return null;
  }

  // 광고가 비활성화되거나 에러가 있으면 표시하지 않음
  if (!isEnabled || adError) {
    return null;
  }

  // 개발 모드이거나 테스트 모드일 때는 테스트 광고 ID 사용
  const unitId = (__DEV__ || isTestMode)
    ? TestIds.BANNER 
    : Platform.select({
        ios: adUnitIds.ios,
        android: adUnitIds.android,
      }) || adUnitIds.android;

  return (
    <View style={styles.container}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={() => {
          console.log('AdMob 광고 로드 완료');
          setAdError(false);
        }}
        onAdFailedToLoad={(error: any) => {
          console.error('AdMob 광고 로드 실패:', error);
          setAdError(true); // 에러 시 광고 숨김
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
});

export default AdMobBanner;
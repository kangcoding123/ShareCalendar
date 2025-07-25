import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';
import Constants from 'expo-constants';
import { getAdConfig } from '../services/adConfigService';

// AdMob 모듈 조건부 import with TypeScript ignore
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

const AdMobBanner = ({ size = 'banner' }: AdMobBannerProps) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);

  useEffect(() => {
    loadAdConfig();
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

  // Expo Go에서는 placeholder 표시
  if (!BannerAd || Constants.appOwnership === 'expo') {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>광고 영역</Text>
      </View>
    );
  }

  // 광고가 비활성화된 경우
  if (!isEnabled) {
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
      size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}  // 변경: 화면 너비에 맞춤
      requestOptions={{
        requestNonPersonalizedAdsOnly: true,
      }}
      onAdLoaded={() => console.log('광고 로드 완료')}
      onAdFailedToLoad={(error: any) => console.error('광고 로드 실패:', error)}
    />
  </View>
  );
};

const styles = StyleSheet.create({
   container: {
    alignItems: 'center',
    marginVertical: 0,
    paddingHorizontal: 10,
    width: '100%',
    backgroundColor: 'transparent',  // 투명 배경
    overflow: 'hidden',  // 오버플로우 숨김
  },
  placeholder: {
    alignItems: 'center',
    marginVertical: 1,
    marginHorizontal: 10,  // 좌우 여백 추가
    padding: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,  // 모서리 둥글게
  },
  placeholderText: {
    color: '#666',
    fontSize: 12,
  },
});

export default AdMobBanner;
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { getAdConfig } from '../services/adConfigService';

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

  if (!isEnabled) {
    return null;
  }

  // 테스트 모드일 때는 테스트 광고 ID 사용
  const unitId = isTestMode 
    ? TestIds.BANNER 
    : Platform.select({
        ios: adUnitIds.ios,
        android: adUnitIds.android,
      }) || adUnitIds.android;

  return (
    <View style={styles.container}>
      <BannerAd
        unitId={unitId}
        size={size === 'largeBanner' ? BannerAdSize.LARGE_BANNER : BannerAdSize.BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={() => console.log('광고 로드 완료')}
        onAdFailedToLoad={(error) => console.error('광고 로드 실패:', error)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 5,
  },
});

export default AdMobBanner;
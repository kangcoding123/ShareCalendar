// components/MemoizedAdBanner.tsx
import React, { memo } from 'react';
import AdMobBanner from './AdMobBanner';

// AdMobBannerProps 타입 정의
interface AdMobBannerProps {
  size?: 'banner' | 'largeBanner';
}

// 광고는 한번 로드되면 props 변경 없이 유지
const MemoizedAdBanner = memo<AdMobBannerProps>(AdMobBanner, () => true);

export default MemoizedAdBanner;
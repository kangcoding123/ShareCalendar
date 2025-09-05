// components/ui/TabBarBackground.ios.tsx

import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function BlurTabBarBackground() {
  const colorScheme = useColorScheme();
  
  // BlurView 대신 iOS 스타일 반투명 View
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: colorScheme === 'dark' 
            ? 'rgba(28, 28, 30, 0.95)'  // iOS 다크모드
            : 'rgba(242, 242, 247, 0.94)', // iOS 라이트모드
        }
      ]}
    />
  );
}

export function useBottomTabOverflow() {
  const tabHeight = useBottomTabBarHeight();
  const { bottom } = useSafeAreaInsets();
  return tabHeight - bottom;
}
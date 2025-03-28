// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#3c66af', // 활성 아이콘 색상을 파란색으로 변경
        tabBarInactiveTintColor: '#888888', // 비활성 아이콘 색상도 명시적으로 설정
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: {
          backgroundColor: '#ffffff', // 명시적으로 흰색 배경 설정
          ...Platform.select({
            ios: {
              // iOS에서는 블러 효과를 위해 투명 배경 유지
              position: 'absolute',
            },
            android: {
              // Android에서는 명시적으로 하얀색 배경과 약간의 그림자 효과
              backgroundColor: '#ffffff',
              elevation: 8, // Android 그림자 효과
            },
          }),
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house" color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar/index"
        options={{
          title: '캘린더',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="groups/index"
        options={{
          title: '그룹',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.2.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="groups/[id]"
        options={{
          href: null, // 탭바에서 숨김
        }}
      />
    </Tabs>
  );
}
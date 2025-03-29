// app/(auth)/_layout.tsx
import React from 'react';
import { Stack } from 'expo-router';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

export default function AuthLayout() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.secondary }
      }}
    >
      <Stack.Screen name="login" options={{ title: '로그인' }} />
      <Stack.Screen name="register" options={{ title: '회원가입' }} />
    </Stack>
  );
}
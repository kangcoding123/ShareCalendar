// app/(auth)/_layout.tsx
import React from 'react';
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#f8f9fa' }
      }}
    >
      <Stack.Screen name="login" options={{ title: '로그인' }} />
      <Stack.Screen name="register" options={{ title: '회원가입' }} />
    </Stack>
  );
}
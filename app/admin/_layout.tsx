// app/admin/_layout.tsx
import React, { useEffect, useState } from 'react';
import { Stack, useRouter, Slot } from 'expo-router';
import { View, Text, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { isCurrentUserAdmin } from '@/services/adminService';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function AdminLayout() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // 색상 테마 설정
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];

  useEffect(() => {
    const checkAdminAccess = async () => {
      setLoading(true);

      // 로그인 체크
      if (!user) {
        Alert.alert('접근 제한', '관리자 기능은 로그인이 필요합니다.');
        router.replace('/(auth)/login' as any);
        return;
      }

      // 관리자 권한 체크
      const adminStatus = await isCurrentUserAdmin();
      setIsAdmin(adminStatus);

      if (!adminStatus) {
        Alert.alert('접근 제한', '관리자 권한이 필요합니다.');
        router.replace('/' as any);
      }

      setLoading(false);
    };

    checkAdminAccess();
  }, [user, router]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
        <Text style={{ marginTop: 10, color: colors.text }}>관리자 권한 확인 중...</Text>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>관리자 권한이 필요합니다.</Text>
      </View>
    );
  }

  // Stack Navigator 대신 Slot을 사용하여 기본 헤더를 완전히 제거
  return (
    <SafeAreaProvider>
      <Slot />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
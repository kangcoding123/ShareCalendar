// app/_layout.tsx
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { Platform, StatusBar as RNStatusBar, NativeModules } from 'react-native';

import { AuthProvider, useAuth } from '../context/AuthContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// 인증 상태에 따른 라우팅 처리를 위한 컴포넌트
function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // 상태바 스타일 직접 설정
    if (Platform.OS === 'android') {
      const bgColor = colorScheme === 'dark' ? colors.background : '#ffffff';
      RNStatusBar.setBackgroundColor(bgColor);
      RNStatusBar.setTranslucent(false);
      
      // JavaScript 방식으로 메서드 존재 확인 및 호출
      try {
        // 코드에서 직접 setNavigationBarColor 호출을 제거하고
        // 대신 네이티브 모듈에 액세스할 수 있는 경우 다른 방식으로 처리합니다
        if (NativeModules.StatusBarManager && Platform.Version >= 21) {
          // 안드로이드 앱 주제 설정을 통해 내비게이션 바 색상 처리
          // app.json의 안드로이드 테마 설정에 의존
          console.log('Android API 레벨 21 이상, 네비게이션 바는 앱 테마에 따라 설정됩니다');
        }
      } catch (error) {
        console.error('내비게이션 바 처리 중 오류:', error);
      }
    }
    
    // iOS와 Android 모두에 적용
    RNStatusBar.setBarStyle(colorScheme === 'dark' ? 'light-content' : 'dark-content');
  }, [colorScheme]);

  useEffect(() => {
    // 인증 상태에 따라 리다이렉트
    if (!authLoading) {
      const inAuthGroup = segments[0] === '(auth)';
      
      if (!isAuthenticated && !inAuthGroup) {
        // 인증되지 않은 상태에서 인증 화면 이외의 화면에 접근 시 로그인 화면으로 리다이렉트
        router.replace('/(auth)/login');
      } else if (isAuthenticated && inAuthGroup) {
        // 인증된 상태에서 인증 화면에 접근 시 메인 화면으로 리다이렉트
        router.replace('/(tabs)/calendar');
      }
    }
  }, [isAuthenticated, segments, authLoading]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          contentStyle: {
            backgroundColor: colors.background
          }
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
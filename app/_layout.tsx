// app/_layout.tsx
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import 'react-native-reanimated';
import { Platform, StatusBar as RNStatusBar, NativeModules, AppState, AppStateStatus, Alert } from 'react-native';
import * as Notifications from 'expo-notifications'; 
import Constants from 'expo-constants';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '../context/AuthContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { testLocalNotification } from '@/services/notificationService';

// 알림 채널 생성 함수
const createNotificationChannel = () => {
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'WE:IN',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3c66af',
    });
    
    // 테스트 알림 표시 함수 - 수정된 버전
    const sendTestNotification = async () => {
      try {
        // 방법 1: 직접 import한 경우
        const result = await testLocalNotification();
        
        // 또는 방법 2: 모듈 전체를 import한 경우
        // const result = await NotificationService.testLocalNotification();
        
        console.log("테스트 알림 전송 결과:", result);
      } catch (error) {
        console.error("테스트 알림 전송 실패:", error);
      }
    };
    
    // 앱 설치 후 첫 실행 시에만 테스트 알림 보내기
    const checkAndSendTestNotification = async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status === 'granted') {
          // 설정에서 알림 상태를 확인할 수 있도록 테스트 알림 전송
          setTimeout(() => {
            sendTestNotification();
          }, 3000); // 앱 실행 3초 후 테스트 알림 전송
        }
      } catch (error) {
        console.error("알림 권한 확인 실패:", error);
      }
    };
    
    checkAndSendTestNotification();
  }
};

// 알림 핸들러 설정 (추가)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// 인증 상태에 따른 라우팅 처리를 위한 컴포넌트
function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  
  // 알림 응답 리스너 참조 저장 (추가)
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();
  
  // 앱 상태 관리 (추가)
  const appState = useRef(AppState.currentState);

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
    
    // 알림 채널 생성
    createNotificationChannel();
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
  
  // 알림 설정 (추가)
  useEffect(() => {
    // 알림 수신 이벤트 리스너
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data;
      console.log('알림 수신됨:', data);
      
      // 여기서 알림 데이터에 따른 추가 작업을 할 수 있습니다
      // 예: 글로벌 상태 업데이트, 소리 재생 등
    });
    
    // 알림 응답 리스너 (사용자가 알림을 탭했을 때)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      console.log('알림 응답 수신됨:', data);
      
      // 알림 유형에 따라 다른 화면으로 이동
      if (data.type === 'new_event' || data.type === 'update_event') {
        if (data.groupId && data.date) {
          // 캘린더 화면으로 이동
          router.push('/(tabs)/calendar');
          
          // 일정 상세 모달 열기 위한 데이터를 전달할 수도 있음
          // (이 부분은 앱 구조에 따라 구현 방식이 다를 수 있음)
        }
      } else if (data.type === 'delete_event') {
        if (data.groupId) {
          // 그룹 상세 화면으로 이동
          router.push(`/(tabs)/groups/${data.groupId}`);
        }
      }
    });
    
    // 앱 상태 변경 리스너 (앱이 백그라운드에서 포그라운드로 돌아올 때)
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) && 
        nextAppState === 'active' &&
        isAuthenticated
      ) {
        // 앱이 활성화되면 최신 데이터 가져오기
        console.log('앱이 포그라운드로 돌아옴 - 데이터 새로고침 필요');
        // 여기서 필요한 데이터 새로고침 로직 추가
      }
      
      appState.current = nextAppState;
    });
    
    return () => {
      // 구독 해제
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
      subscription.remove();
    };
  }, [isAuthenticated, router]);

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
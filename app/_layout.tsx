// app/_layout.tsx
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import 'react-native-reanimated';
import { Platform, StatusBar as RNStatusBar, NativeModules, AppState, AppStateStatus, Alert } from 'react-native';
import * as Notifications from 'expo-notifications'; 
import Constants from 'expo-constants';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '../context/AuthContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { testLocalNotification } from '@/services/notificationService';
import UpdatePopup from '../components/UpdatePopup';
import { checkForUpdates } from '../services/updateService';
import { initializeAdConfig } from '../services/adConfigService'; // 새로 추가

// 알림 채널 생성 함수
const createNotificationChannel = () => {
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'WE:IN',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3c66af',
    });
    
    // 테스트 알림 코드 제거됨
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
  
  // 업데이트 관련 상태 추가
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [requiredUpdate, setRequiredUpdate] = useState(false);
  const [versionInfo, setVersionInfo] = useState<any>(null);
  
  // 앱 시작 시 업데이트 체크 및 광고 설정 초기화
  useEffect(() => {
    const checkAppUpdates = async () => {
      try {
        const result = await checkForUpdates();
        
        if (result.updateAvailable) {
          setUpdateAvailable(true);
          setRequiredUpdate(result.requiredUpdate);
          setVersionInfo(result.versionInfo);
          console.log('업데이트가 필요합니다:', result.versionInfo);
        } else {
          console.log('앱이 최신 버전입니다');
        }
      } catch (error) {
        console.error('업데이트 체크 오류:', error);
      }
    };
    
    // 광고 설정 초기화
    const initAds = async () => {
      try {
        const success = await initializeAdConfig();
        if (success) {
          console.log('광고 설정 초기화 완료');
        }
      } catch (error) {
        console.error('광고 설정 초기화 오류:', error);
      }
    };
    
    // 인증 완료 후 업데이트 체크 및 광고 설정 초기화
    if (!authLoading) {
      checkAppUpdates();
      initAds();
    }
  }, [authLoading]);
  
  // 함수 추가 - 업데이트 팝업 닫기
  const handleCloseUpdatePopup = () => {
    setUpdateAvailable(false);
  };

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
    // 인증 상태에 따른 리다이렉트 (수정됨)
    if (!authLoading) {
      const inAuthGroup = segments[0] === '(auth)';
      
      // 인증된 사용자가 인증 화면에 접근할 때만 리다이렉트
      if (isAuthenticated && inAuthGroup) {
        // 인증된 상태에서 인증 화면에 접근 시 메인 화면으로 리다이렉트
        router.replace('/(tabs)/calendar');
      }
      // 비인증 사용자는 자유롭게 앱을 탐색할 수 있도록 리다이렉트 제거
    }
  }, [isAuthenticated, segments, authLoading, router]);
  
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
      
      {/* 업데이트 팝업 추가 */}
      {updateAvailable && versionInfo && (
        <UpdatePopup
          visible={updateAvailable}
          versionInfo={versionInfo}
          isRequired={requiredUpdate}
          onClose={handleCloseUpdatePopup}
        />
      )}
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
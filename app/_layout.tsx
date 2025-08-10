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
import { initializeAdConfig } from '../services/adConfigService';

// 🔥 AdMob 초기화 코드 완전 제거! - AdMobBanner 컴포넌트에서 처리

// 알림 채널 생성 함수
const createNotificationChannel = () => {
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'WE:IN',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3c66af',
    });
  }
};

// 알림 핸들러 설정
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
  
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();
  const appState = useRef(AppState.currentState);
  
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
    
    if (!authLoading) {
      checkAppUpdates();
      initAds();
    }
  }, [authLoading]);
  
  const handleCloseUpdatePopup = () => {
    setUpdateAvailable(false);
  };

  useEffect(() => {
    if (Platform.OS === 'android') {
      const bgColor = colorScheme === 'dark' ? colors.background : '#ffffff';
      RNStatusBar.setBackgroundColor(bgColor);
      RNStatusBar.setTranslucent(false);
      
      try {
        if (NativeModules.StatusBarManager && Platform.Version >= 21) {
          console.log('Android API 레벨 21 이상, 네비게이션 바는 앱 테마에 따라 설정됩니다');
        }
      } catch (error) {
        console.error('내비게이션 바 처리 중 오류:', error);
      }
    }
    
    RNStatusBar.setBarStyle(colorScheme === 'dark' ? 'light-content' : 'dark-content');
    createNotificationChannel();
  }, [colorScheme]);

  useEffect(() => {
    if (!authLoading) {
      const inAuthGroup = segments[0] === '(auth)';
      
      if (isAuthenticated && inAuthGroup) {
        router.replace('/(tabs)/calendar');
      }
    }
  }, [isAuthenticated, segments, authLoading, router]);
  
  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data;
      console.log('알림 수신됨:', data);
    });
    
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      console.log('알림 응답 수신됨:', data);
      
      if (data.type === 'new_event' || data.type === 'update_event') {
        if (data.groupId && data.date) {
          router.push('/(tabs)/calendar');
        }
      } else if (data.type === 'delete_event') {
        if (data.groupId) {
          router.push(`/(tabs)/groups/${data.groupId}`);
        }
      }
    });
    
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) && 
        nextAppState === 'active' &&
        isAuthenticated
      ) {
        console.log('앱이 포그라운드로 돌아옴 - 데이터 새로고침 필요');
      }
      
      appState.current = nextAppState;
    });
    
    return () => {
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
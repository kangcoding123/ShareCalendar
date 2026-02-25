// app/_layout.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { EventProvider } from '../context/EventContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { router } from 'expo-router';
import { Platform, Alert, AppState, AppStateStatus, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  registerForPushNotificationsAsync,
  saveUserPushToken,
  syncGroupEventNotifications
} from '../services/notificationService';
import { checkForUpdates } from '../services/updateService';
import { checkAdminStatus } from '../services/adminService';
// import { initializeAnalytics } from '../services/analyticsService';
import { subscribeToUserEvents } from '../services/calendarService';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { nativeDb } from '../config/firebase';
import { logger } from '../utils/logger';

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function RootLayoutNav() {
  const { isAuthenticated, loading: isLoading, user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [appIsReady, setAppIsReady] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();
  const appStateSubscription = useRef<any>();
  const pendingNotificationRef = useRef<any>(null);  // Cold start 알림 처리용
  const lastAppStateRef = useRef(AppState.currentState);
  const [appStateVisible, setAppStateVisible] = useState(AppState.currentState);

  // 앱 준비
  useEffect(() => {
    async function prepare() {
      try {
        // 애널리틱스 초기화
        // await initializeAnalytics();

        // 네트워크 상태 확인
        const netState = await NetInfo.fetch();
        setIsConnected(netState.isConnected ?? false);

        // 🔥 Cold start 알림 응답 확인
        // 앱이 완전히 종료된 상태에서 알림 터치로 시작된 경우
        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        if (lastResponse) {
          const data = lastResponse.notification.request.content.data;
          logger.log('[Cold Start] 알림 응답 감지:', data);
          pendingNotificationRef.current = data;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (e) {
        logger.warn(String(e));
      } finally {
        setAppIsReady(true);
        await SplashScreen.hideAsync();
      }
    }
    prepare();
  }, []);

  // 알림 타입별 네비게이션 처리 함수
  const handleNotificationNavigation = (data: any) => {
    if (data.type === 'daily_summary') {
      router.replace('/(tabs)');
    } else if (data.type === 'event_reminder') {
      const eventStartDate = data.eventStartDate as string;
      if (eventStartDate) {
        router.push({
          pathname: '/(tabs)/calendar',
          params: { highlightDate: eventStartDate }
        });
      } else if (data.eventId) {
        // Firestore 조회 fallback
        nativeDb.collection('events').doc(data.eventId as string).get()
          .then((doc) => {
            if (doc.exists()) {
              const eventData = doc.data();
              const startDate = eventData?.startDate?.split('T')[0] || '';
              router.push({
                pathname: '/(tabs)/calendar',
                params: { highlightDate: startDate }
              });
            } else {
              router.push('/(tabs)/calendar');
            }
          })
          .catch(() => router.push('/(tabs)/calendar'));
      } else {
        router.push('/(tabs)/calendar');
      }
    } else if (data.type === 'new_event' || data.type === 'update_event') {
      if (data.date) {
        const dateStr = String(data.date).split('T')[0];
        router.push({
          pathname: '/(tabs)/calendar',
          params: { highlightDate: dateStr }
        });
      } else {
        router.push('/(tabs)/calendar');
      }
    } else if (data.type === 'group_invite') {
      router.push('/(tabs)/groups');
    }
  };

  // 네트워크 상태 모니터링
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected ?? false);
    });
    return unsubscribe;
  }, []);

  // 🔥 Cold start 알림 처리 (앱 준비 완료 후)
  useEffect(() => {
    if (appIsReady && !isLoading && pendingNotificationRef.current) {
      const data = pendingNotificationRef.current;
      pendingNotificationRef.current = null; // 중복 처리 방지

      logger.log('[Cold Start] pending 알림 처리:', data);
      // 약간의 딜레이 후 네비게이션 (라우터 준비 보장)
      setTimeout(() => {
        handleNotificationNavigation(data);
      }, 100);
    }
  }, [appIsReady, isLoading]);

  // 앱 상태 모니터링 (백그라운드/포그라운드)
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (
        lastAppStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        logger.log('App returned to foreground - data refresh needed');
        setAppStateVisible(nextAppState);

        // 앱이 다시 활성화되면 업데이트 체크
        if (user?.uid) {
          checkForUpdates().catch(logger.error);
        }

        // 배지 초기화
        await Notifications.setBadgeCountAsync(0);
      }

      lastAppStateRef.current = nextAppState;
    };

    appStateSubscription.current = AppState.addEventListener(
      'change',
      handleAppStateChange
    );

    return () => {
      if (appStateSubscription.current) {
        appStateSubscription.current.remove();
      }
    };
  }, [user]);

  // 사용자 로그인 시 초기 설정
  useEffect(() => {
    if (user?.uid && isAuthenticated) {
      const initializeUserData = async () => {
        try {
          // 관리자 상태 확인
          const isAdmin = await checkAdminStatus(user.uid);
          setIsAdmin(isAdmin);
          logger.log('관리자 상태 확인:', isAdmin);

          // 버전 체크
          await checkForUpdates();

          // 알림 초기화
          const token = await registerForPushNotificationsAsync();
          if (token) {
            await saveUserPushToken(user.uid, token);
            logger.log('푸시 토큰 등록 성공:', token);
          }

          // 그룹 일정 알림 동기화 (백그라운드 실행 - 앱 로딩에 영향 없음)
          syncGroupEventNotifications(user.uid).catch(logger.error);

          logger.log('알림이 초기화되었습니다');
        } catch (error) {
          logger.error('사용자 데이터 초기화 오류:', error);
        }
      };

      initializeUserData();
    }
  }, [user, isAuthenticated, setIsAdmin]);

  // 알림 리스너 설정
  useEffect(() => {
    if (!appIsReady || isLoading) return;

    // Android 알림 채널 설정
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'WE:IN',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    // 알림 수신 리스너
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      logger.log('Notification received:', notification.request.content.data);

      // 알림을 받았을 때는 로그만 남기고, 업데이트하지 않음
      // (무한 루프 방지)
    });

    // 알림 응답 리스너 (사용자가 알림을 탭했을 때)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(async response => {
      logger.log('Notification response:', response.notification.request.content.data);
      const data = response.notification.request.content.data;
      handleNotificationNavigation(data);

      // 배지 초기화
      await Notifications.setBadgeCountAsync(0);
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [appIsReady, isLoading, user]);

  // 푸시 토큰 등록 (사용자별)
  useEffect(() => {
    if (user?.uid) {
      const registerPushToken = async () => {
        try {
          const token = await registerForPushNotificationsAsync();
          if (token) {
            // Firestore에 토큰 저장
            await nativeDb.collection('users').doc(user.uid).update({
              pushToken: token,
              pushTokenUpdatedAt: new Date().toISOString(),
            });
            logger.log('푸시 토큰 등록 시도 - 사용자 ID:', user.uid);
            logger.log('푸시 토큰 생성 성공:', token);
            
            // AsyncStorage에도 백업
            await AsyncStorage.setItem('pushToken', token);
            await saveUserPushToken(user.uid, token);
            logger.log('푸시 토큰이 Firestore에 저장됨');
          }
        } catch (error) {
          logger.error('푸시 토큰 등록 오류:', error);
        }
      };
      registerPushToken();
    }
  }, [user]);

  if (!appIsReady || isLoading) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: '#fff',
        },
        animation: Platform.OS === 'android' ? 'slide_from_right' : 'default',
      }}
    >
        <Stack.Screen 
          name="(tabs)" 
          options={{ 
            headerShown: false,
            animation: 'none'
          }} 
        />
        <Stack.Screen 
          name="(auth)" 
          options={{ 
            headerShown: false,
            animation: Platform.OS === 'android' ? 'slide_from_bottom' : 'default',
            presentation: 'modal'
          }} 
        />
        <Stack.Screen 
          name="settings" 
          options={{ 
            headerShown: false,
            animation: 'slide_from_right'
          }} 
        />
        <Stack.Screen
          name="groups"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="events"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />
      </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setBackgroundColorAsync(colorScheme === 'dark' ? '#121212' : '#ffffff');
      NavigationBar.setButtonStyleAsync(colorScheme === 'dark' ? 'light' : 'dark');
    }
  }, [colorScheme]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar
          style={colorScheme === 'dark' ? 'light' : 'dark'}
          backgroundColor={colorScheme === 'dark' ? '#121212' : '#ffffff'}
        />
        <AuthProvider>
          <EventProvider>
            <RootLayoutNav />
          </EventProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
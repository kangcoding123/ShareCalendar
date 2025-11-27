// app/_layout.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { EventProvider } from '../context/EventContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { router } from 'expo-router';
import { Platform, Alert, AppState, AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  registerForPushNotificationsAsync,
  updateDailySummaryWithEvents,
  saveUserPushToken
} from '../services/notificationService';
import { checkForUpdates } from '../services/updateService';
import { checkAdminStatus } from '../services/adminService';
// import { initializeAnalytics } from '../services/analyticsService';
import { subscribeToUserEvents } from '../services/calendarService';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { nativeDb } from '../config/firebase';

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
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (e) {
        console.warn(e);
      } finally {
        setAppIsReady(true);
        await SplashScreen.hideAsync();
      }
    }
    prepare();
  }, []);

  // 네트워크 상태 모니터링
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected ?? false);
    });
    return unsubscribe;
  }, []);

  // 앱 상태 모니터링 (백그라운드/포그라운드)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        lastAppStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('App returned to foreground - data refresh needed');
        setAppStateVisible(nextAppState);
        
        // 앱이 다시 활성화되면 업데이트 체크
        if (user?.uid) {
          checkForUpdates().catch(console.error);
        }
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
          console.log('관리자 상태 확인:', isAdmin);

          // 버전 체크
          await checkForUpdates();

          // 알림 초기화
          const token = await registerForPushNotificationsAsync();
          if (token) {
            await saveUserPushToken(user.uid, token);
            console.log('푸시 토큰 등록 성공:', token);
          }

          // 일일 요약 알림 설정 (일정 내용 포함)
          await updateDailySummaryWithEvents(user.uid);

          console.log('알림이 초기화되었습니다');
        } catch (error) {
          console.error('사용자 데이터 초기화 오류:', error);
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
      console.log('Notification received:', notification.request.content.data);

      // 알림을 받았을 때는 로그만 남기고, 업데이트하지 않음
      // (무한 루프 방지)
    });

    // 알림 응답 리스너 (사용자가 알림을 탭했을 때)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response.notification.request.content.data);
      const data = response.notification.request.content.data;
      
      // 알림 타입에 따라 다른 화면으로 이동
      if (data.type === 'daily_summary') {
        // 일일 요약 알림 클릭 시 홈 화면으로
        if (router.canGoBack()) {
          router.replace('/(tabs)');
        } else {
          router.push('/(tabs)');
        }
      } else if (data.type === 'event_reminder') {
        // 일정 알림 클릭 시 캘린더 화면으로
        if (router.canGoBack()) {
          router.replace('/(tabs)/calendar');
        } else {
          router.push('/(tabs)/calendar');
        }
      } else if (data.type === 'new_event' || data.type === 'update_event') {
        // 새 일정/수정 알림 클릭 시 캘린더의 해당 날짜로 이동
        if (data.date) {
          router.push({
            pathname: '/(tabs)/calendar',
            params: { date: data.date }
          });
        } else {
          router.push('/(tabs)/calendar');
        }
      } else if (data.type === 'group_invite') {
        // 그룹 초대 알림 클릭 시 그룹 화면으로
        router.push('/(tabs)/groups');
      }
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
            console.log('푸시 토큰 등록 시도 - 사용자 ID:', user.uid);
            console.log('푸시 토큰 생성 성공:', token);
            
            // AsyncStorage에도 백업
            await AsyncStorage.setItem('pushToken', token);
            await saveUserPushToken(user.uid, token);
            console.log('푸시 토큰이 Firestore에 저장됨');
          }
        } catch (error) {
          console.error('푸시 토큰 등록 오류:', error);
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
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <EventProvider>
            <RootLayoutNav />
          </EventProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
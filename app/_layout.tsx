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
import { SafeAreaProvider } from 'react-native-safe-area-context';
import analytics from '@react-native-firebase/analytics';  // ✅ 추가

import { AuthProvider, useAuth } from '../context/AuthContext';
import { EventProvider } from '../context/EventContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { testLocalNotification } from '@/services/notificationService';
import UpdatePopup from '../components/UpdatePopup';
import { checkForUpdates } from '../services/updateService';
import { initializeAdConfig } from '../services/adConfigService';

// Create notification channel
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

// Set notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Component for handling routing based on auth state
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
  
  // ✅ Firebase Analytics 초기화
  useEffect(() => {
    // App open event
    analytics().logAppOpen();
    console.log('[Analytics] Firebase Analytics initialized');
    
    // Set user ID if logged in
    if (user?.uid) {
      analytics().setUserId(user.uid);
      console.log('[Analytics] User ID set:', user.uid);
    }
  }, [user]);
  
  // ✅ 화면 전환 추적
  useEffect(() => {
    if (segments.length > 0) {
      const screenName = segments.join('/');
      analytics().logScreenView({
        screen_name: screenName,
        screen_class: segments[0] || 'unknown'
      });
      console.log('[Analytics] Screen view tracked:', screenName);
    }
  }, [segments]);
  
  // Parallel initialization on app start
  useEffect(() => {
    if (authLoading) return;
    
    const initializeApp = async () => {
      // Version check (run independently)
      checkForUpdates().then(result => {
        if (result && result.updateAvailable) {
          setUpdateAvailable(true);
          setRequiredUpdate(result.requiredUpdate);
          setVersionInfo(result.versionInfo);
          console.log('Update required:', result.versionInfo);
        } else {
          console.log('App is up to date');
        }
      }).catch(err => {
        console.log('Version check failed (ignored):', err);
      });
      
      // Ad initialization (run independently)
      initializeAdConfig().then(success => {
        if (success) {
          console.log('Ad config initialized');
        }
      }).catch(err => {
        console.log('Ad initialization failed (ignored):', err);
      });
      
      // ✅ Analytics 세션 시작
      analytics().logEvent('session_start', {
        timestamp: new Date().toISOString()
      });
    };
    
    // Run async (don't block main thread)
    requestAnimationFrame(() => {
      initializeApp();
    });
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
          console.log('Android API level 21+, navigation bar follows app theme');
        }
      } catch (error) {
        console.error('Navigation bar error:', error);
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
      console.log('Notification received:', data);
      
      // ✅ Analytics: 알림 수신 추적
      analytics().logEvent('notification_receive', {
        type: data.type || 'unknown'
      });
    });
    
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      console.log('Notification response:', data);
      
      // ✅ Analytics: 알림 클릭 추적
      analytics().logEvent('notification_open', {
        type: data.type || 'unknown'
      });
      
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
        console.log('App returned to foreground - data refresh needed');
        
        // ✅ Analytics: 앱 포그라운드 복귀
        analytics().logEvent('app_foreground', {
          previous_state: appState.current
        });
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
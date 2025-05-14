// context/AuthContext.tsx
import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { 
  loginUser, 
  logoutUser, 
  registerUser, 
  autoLoginWithSavedCredentials,
  getSavedUserInfo
} from '../services/authService';
import { 
  registerForPushNotificationsAsync, 
  saveUserPushToken  
} from '../services/notificationService';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// calendarService에서 전역 상태 import
import { clearEventSubscriptions } from '../services/calendarService';

// 사용자 타입 정의
interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  unreadNotifications?: number; // 추가: 읽지 않은 알림 수
}

// 인증 컨텍스트 타입 정의
interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; user?: any; error?: string }>;
  logout: () => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, displayName: string) => Promise<{ success: boolean; user?: any; error?: string }>;
  isAuthenticated: boolean;
  resetNotificationCount: () => Promise<void>; // 추가: 알림 카운터 리셋 함수
}

// Props 타입 정의
interface AuthProviderProps {
  children: ReactNode;
}

// AsyncStorage 키 정의
const AUTH_CREDENTIALS_KEY = 'auth_credentials';
const AUTH_USER_KEY = 'auth_user';
const USER_SETTINGS_KEYS = [
  'user_calendar_settings',
  'recent_views',
  'app_preferences'
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 알림 카운터 초기화 함수 (추가)
  const resetNotificationCount = async () => {
    if (!user) return;
    
    try {
      // Firestore에서 사용자 알림 카운터 초기화
      await setDoc(doc(db, 'users', user.uid), 
        { unreadNotifications: 0 }, 
        { merge: true }
      );
      
      // 로컬 사용자 상태 업데이트
      setUser(prev => prev ? {...prev, unreadNotifications: 0} : null);
    } catch (error) {
      console.error('알림 카운터 초기화 오류:', error);
    }
  };

  useEffect(() => {
    let isMounted = true;
    
    // 인증 상태 초기화
    const initAuth = async () => {
      try {
        // 저장된 사용자 정보 확인
        const savedUser = await getSavedUserInfo();
        
        if (savedUser && isMounted) {
          setUser(savedUser);
          
          // 저장된 자격 증명으로 자동 로그인 시도 (세션 갱신용)
          autoLoginWithSavedCredentials().catch(error => 
            console.log('자동 로그인 갱신 실패:', error)
          );
          
          // 알림 권한 요청
          registerForPushNotificationsAsync();
          
          // 푸시 토큰 저장 (추가)
          if (savedUser.uid) {
            saveUserPushToken(savedUser.uid);
          }
        }
      } catch (error) {
        console.error('인증 초기화 오류:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    // 인증 초기화 실행
    initAuth();

    // Firebase 인증 상태 변경 이벤트 구독
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isMounted) return;
      
      if (firebaseUser) {
        // Firebase에 인증된 사용자가 있으면 상태 업데이트
        try {
          // 추가: Firestore에서 사용자 추가 정보 가져오기
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const userData = userDoc.exists() ? userDoc.data() : {};
          
          const userState: User = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            unreadNotifications: userData.unreadNotifications || 0 // 읽지 않은 알림 수 추가
          };
          
          setUser(userState);
          
          // 푸시 토큰 저장 (추가)
          saveUserPushToken(firebaseUser.uid);
          
        } catch (error) {
          console.error('사용자 데이터 가져오기 오류:', error);
          
          // 오류 발생 시 기본 정보만으로 사용자 상태 설정
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName
          });
        }
      } else {
        // Firebase에서 로그아웃 상태면 로컬 상태도 초기화
        setUser(null);
      }
      
      setLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const result = await loginUser(email, password);
    return result;
  };

  // 개선된 로그아웃 함수
  const logout = async () => {
    try {
      console.log('로그아웃 시작 - 모든 구독 및 상태 초기화');
      
      // 1. 모든 이벤트 구독 해제 - 서비스 계층에 새로 추가된 함수 호출
      clearEventSubscriptions();
      
      // 2. Firebase 로그아웃 실행
      const result = await logoutUser();
      
      if (result.success) {
        // 3. 사용자 상태 초기화
        setUser(null);
        
        // 4. AsyncStorage에서 사용자 관련 데이터 모두 제거
        const keysToRemove = [AUTH_CREDENTIALS_KEY, AUTH_USER_KEY, ...USER_SETTINGS_KEYS];
        await AsyncStorage.multiRemove(keysToRemove);
        
        console.log('로그아웃 완료 - 모든 상태와 캐시 데이터 삭제됨');
      } else {
        console.error('Firebase 로그아웃 실패:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('로그아웃 처리 중 오류 발생:', error);
      return { success: false, error: '로그아웃 처리 중 오류가 발생했습니다.' };
    }
  };

  const register = async (email: string, password: string, displayName: string) => {
    return await registerUser(email, password, displayName);
  };

  const value = {
    user,
    loading,
    login,
    logout,
    register,
    isAuthenticated: !!user,
    resetNotificationCount  // 추가: 알림 카운터 리셋 함수 포함
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
// context/AuthContext.tsx
import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';
import { 
  loginUser, 
  logoutUser, 
  registerUser, 
  autoLoginWithSavedCredentials,
  getSavedUserInfo
} from '../services/authService';

// 사용자 타입 정의
interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
}

// 인증 컨텍스트 타입 정의
interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; user?: any; error?: string }>;
  logout: () => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, displayName: string) => Promise<{ success: boolean; user?: any; error?: string }>;
  isAuthenticated: boolean;
}

// Props 타입 정의
interface AuthProviderProps {
  children: ReactNode;
}

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
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!isMounted) return;
      
      if (firebaseUser) {
        // Firebase에 인증된 사용자가 있으면 상태 업데이트
        const userData: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName
        };
        
        setUser(userData);
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

  const logout = async () => {
    const result = await logoutUser();
    if (result.success) {
      setUser(null);
    }
    return result;
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
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
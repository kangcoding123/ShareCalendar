// context/AuthContext.tsx
import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import auth from '@react-native-firebase/auth';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { nativeDb } from '../config/firebase';
import { clearEventSubscriptions } from '../services/calendarService';
import { cacheService } from '../services/cacheService';
import * as Notifications from 'expo-notifications';
import NetInfo from '@react-native-community/netinfo';

// 사용자 타입 정의
interface UserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface AuthContextType {
  user: UserData | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserProfile: (displayName: string, photoURL?: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatUserData = (firebaseUser: FirebaseAuthTypes.User): UserData => {
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
    };
  };

  const fetchUserData = async (uid: string): Promise<UserData | null> => {
    try {
      const userDoc = await nativeDb.collection('users').doc(uid).get();
      if ((userDoc as any).exists) {
        return { uid, ...userDoc.data() } as UserData;
      }
      return null;
    } catch (error) {
      console.error('사용자 정보 가져오기 오류:', error);
      return null;
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setError(null);
      setLoading(true);
      
      const userCredential = await auth().signInWithEmailAndPassword(email, password);
      const userData = await fetchUserData(userCredential.user.uid);
      
      if (userData) {
        setUser(userData);
        
        await nativeDb.collection('users').doc(userCredential.user.uid).set({
          lastLoginAt: new Date().toISOString()
        }, { merge: true });
        
        // 푸시 토큰 등록
        try {
          console.log('푸시 토큰 등록 시도 - 사용자 ID:', userCredential.user.uid);
          
          const { status: existingStatus } = await Notifications.getPermissionsAsync();
          let finalStatus = existingStatus;
          
          if (existingStatus !== 'granted') {
            console.log('알림 권한 없음 - 권한 요청 중...');
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
          }
          
          if (finalStatus === 'granted') {
            const token = await Notifications.getExpoPushTokenAsync({
              projectId: 'acfa6bea-3fb9-4677-8980-6e08d2324c51'
            });
            
            console.log('푸시 토큰 생성 성공:', token.data);
            
            const usersWithToken = await nativeDb.collection('users')
              .where('pushToken', '==', token.data)
              .get();
            
            for (const userDoc of usersWithToken.docs) {
              if (userDoc.id !== userCredential.user.uid) {
                await nativeDb.collection('users').doc(userDoc.id).update({ 
                  pushToken: null,
                  tokenRemovedAt: new Date().toISOString()
                });
                console.log(`이전 사용자(${userDoc.id})의 토큰 제거됨`);
              }
            }
            
            await nativeDb.collection('users').doc(userCredential.user.uid).update({
              pushToken: token.data,
              tokenUpdatedAt: new Date().toISOString()
            });
            
            console.log('푸시 토큰이 Firestore에 저장됨');
          } else {
            console.log('알림 권한 거부됨 - 토큰 생성 건너뜀');
          }
        } catch (tokenError) {
          console.error('푸시 토큰 등록 오류:', tokenError);
        }
        
      } else {
        setUser(formatUserData(userCredential.user));
      }
    } catch (error: any) {
      console.error('로그인 오류:', error);
      
      let errorMessage = '로그인 중 오류가 발생했습니다.';
      if (error.code === 'auth/invalid-credential') {
        errorMessage = '이메일 또는 비밀번호가 올바르지 않습니다.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = '올바른 이메일 형식이 아닙니다.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = '너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.';
      }
      
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string, displayName: string) => {
    try {
      setError(null);
      setLoading(true);
      
      const userCredential = await auth().createUserWithEmailAndPassword(email, password);
      
      await userCredential.user.updateProfile({ displayName });
      
      const userData: UserData = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await nativeDb.collection('users').doc(userCredential.user.uid).set(userData);
      
      setUser(userData);
      
      // 푸시 토큰 등록
      try {
        console.log('회원가입 - 푸시 토큰 등록 시도 - 사용자 ID:', userCredential.user.uid);
        
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        
        if (existingStatus !== 'granted') {
          console.log('알림 권한 없음 - 권한 요청 중...');
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        
        if (finalStatus === 'granted') {
          const token = await Notifications.getExpoPushTokenAsync({
            projectId: 'acfa6bea-3fb9-4677-8980-6e08d2324c51'
          });
          
          console.log('푸시 토큰 생성 성공:', token.data);
          
          const usersWithToken = await nativeDb.collection('users')
            .where('pushToken', '==', token.data)
            .get();
          
          for (const userDoc of usersWithToken.docs) {
            if (userDoc.id !== userCredential.user.uid) {
              await nativeDb.collection('users').doc(userDoc.id).update({ 
                pushToken: null,
                tokenRemovedAt: new Date().toISOString()
              });
              console.log(`이전 사용자(${userDoc.id})의 토큰 제거됨`);
            }
          }
          
          await nativeDb.collection('users').doc(userCredential.user.uid).update({
            pushToken: token.data,
            tokenUpdatedAt: new Date().toISOString()
          });
          
          console.log('회원가입 - 푸시 토큰이 Firestore에 저장됨');
        } else {
          console.log('회원가입 - 알림 권한 거부됨 - 토큰 생성 건너뜀');
        }
      } catch (tokenError) {
        console.error('회원가입 - 푸시 토큰 등록 오류:', tokenError);
      }
      
      await nativeDb.collection('groups').doc(`personal_${userCredential.user.uid}`).set({
        name: '개인 캘린더',
        type: 'personal',
        createdBy: userCredential.user.uid,
        createdAt: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('회원가입 오류:', error);
      
      let errorMessage = '회원가입 중 오류가 발생했습니다.';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = '이미 사용 중인 이메일입니다.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = '비밀번호는 최소 6자 이상이어야 합니다.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = '올바른 이메일 형식이 아닙니다.';
      }
      
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      
      if (user?.uid) {
        await nativeDb.collection('users').doc(user.uid).update({
          pushToken: null,
          tokenRemovedAt: new Date().toISOString()
        });
        console.log('로그아웃: 푸시 토큰 제거됨');
      }
      
      clearEventSubscriptions();
      
      await cacheService.clearAllCache();
      console.log('[AuthContext] 오프라인 캐시 정리 완료');
      
      cacheService.cleanup();
      
      await auth().signOut();
      
      setUser(null);
      setError(null);
    } catch (error: any) {
      console.error('로그아웃 오류:', error);
      setError('로그아웃 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      setError(null);
      await auth().sendPasswordResetEmail(email);
    } catch (error: any) {
      console.error('비밀번호 재설정 오류:', error);
      
      let errorMessage = '비밀번호 재설정 중 오류가 발생했습니다.';
      if (error.code === 'auth/invalid-email') {
        errorMessage = '올바른 이메일 형식이 아닙니다.';
      }
      
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const updateUserProfile = async (displayName: string, photoURL?: string) => {
    try {
      setError(null);
      
      const currentUser = auth().currentUser;
      if (!currentUser) {
        throw new Error('로그인이 필요합니다.');
      }
      
      const updateData: any = { displayName };
      if (photoURL !== undefined) {
        updateData.photoURL = photoURL;
      }
      
      await currentUser.updateProfile(updateData);
      
      const firestoreData: any = {
        displayName,
        updatedAt: new Date().toISOString()
      };
      
      if (photoURL !== undefined) {
        firestoreData.photoURL = photoURL;
      }
      
      await nativeDb.collection('users').doc(currentUser.uid).set(firestoreData, { merge: true });
      
      if (user) {
        setUser({
          ...user,
          displayName,
          ...(photoURL !== undefined && { photoURL })
        });
      }
    } catch (error: any) {
      console.error('프로필 업데이트 오류:', error);
      setError('프로필 업데이트 중 오류가 발생했습니다.');
      throw error;
    }
  };

  const deleteAccount = async (password: string) => {
    try {
      setError(null);
      setLoading(true);
      
      const currentUser = auth().currentUser;
      if (!currentUser || !currentUser.email) {
        throw new Error('로그인이 필요합니다.');
      }
      
      const credential = auth.EmailAuthProvider.credential(
        currentUser.email,
        password
      );
      
      await currentUser.reauthenticateWithCredential(credential);
      
      const userId = currentUser.uid;
      
      clearEventSubscriptions();
      
      await cacheService.clearAllCache();
      
      const batch = nativeDb.batch();
      
      batch.delete(nativeDb.collection('users').doc(userId));
      
      const groupsSnapshot = await nativeDb.collection('groups')
        .where('createdBy', '==', userId)
        .get();
      groupsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      const membershipsSnapshot = await nativeDb.collection('groupMembers')
        .where('userId', '==', userId)
        .get();
      membershipsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      const eventsSnapshot = await nativeDb.collection('events')
        .where('userId', '==', userId)
        .get();
      eventsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      
      await currentUser.delete();
      
      setUser(null);
    } catch (error: any) {
      console.error('계정 삭제 오류:', error);
      
      let errorMessage = '계정 삭제 중 오류가 발생했습니다.';
      if (error.code === 'auth/wrong-password') {
        errorMessage = '잘못된 비밀번호입니다.';
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = '보안을 위해 다시 로그인해주세요.';
      }
      
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => {
    setError(null);
  };

  useEffect(() => {
    let authTimeout: NodeJS.Timeout;
    let isHandled = false;
    
    const checkNetworkAndAuth = async () => {
      try {
        const netState = await NetInfo.fetch();
        console.log('[Auth] 네트워크 상태:', netState.isConnected ? '온라인' : '오프라인');
        
        if (!netState.isConnected || !netState.isInternetReachable) {
          console.log('[Auth] 오프라인 감지 - 캐시된 사용자 정보 사용');
          
          const currentUser = auth().currentUser;
          if (currentUser) {
            const cachedUser = formatUserData(currentUser);
            setUser(cachedUser);
            console.log('[Auth] 캐시된 사용자 발견:', cachedUser.email);
          } else {
            console.log('[Auth] 캐시된 사용자 없음');
            setUser(null);
          }
          
          setLoading(false);
          isHandled = true;
        }
      } catch (error) {
        console.error('[Auth] 네트워크 상태 확인 실패:', error);
      }
    };
    
    checkNetworkAndAuth();
    
    authTimeout = setTimeout(() => {
      if (!isHandled && loading) {
        console.log('[Auth] 인증 타임아웃 (3초) - 캐시 사용으로 전환');
        
        const currentUser = auth().currentUser;
        if (currentUser) {
          const cachedUser = formatUserData(currentUser);
          setUser(cachedUser);
          console.log('[Auth] 타임아웃 후 캐시 사용자:', cachedUser.email);
        } else {
          setUser(null);
        }
        
        setLoading(false);
        isHandled = true;
      }
    }, 3000);
    
    const unsubscribe = auth().onAuthStateChanged(async (firebaseUser) => {
      if (isHandled) {
        console.log('[Auth] 이미 처리됨 - onAuthStateChanged 응답 무시');
        return;
      }
      
      clearTimeout(authTimeout);
      
      try {
        if (firebaseUser) {
          console.log('[Auth] Firebase 사용자 확인:', firebaseUser.email);
          
          setUser(formatUserData(firebaseUser));
          
          fetchUserData(firebaseUser.uid)
            .then(userData => {
              if (userData) {
                setUser(userData);
                console.log('[Auth] Firestore 사용자 정보 업데이트 완료');
              }
            })
            .catch(error => {
              console.log('[Auth] Firestore 접근 실패 (오프라인?):', error);
            });
        } else {
          console.log('[Auth] 사용자 없음 - 로그아웃 상태');
          setUser(null);
        }
      } catch (error) {
        console.error('[Auth] 인증 상태 변경 처리 오류:', error);
      } finally {
        setLoading(false);
        isHandled = true;
      }
    });

    return () => {
      clearTimeout(authTimeout);
      unsubscribe();
    };
  }, []);

  const value = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    resetPassword,
    updateUserProfile,
    deleteAccount,
    clearError
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
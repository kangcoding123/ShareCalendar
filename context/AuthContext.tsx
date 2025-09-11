// context/AuthContext.tsx
import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  deleteUser as firebaseDeleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { doc, setDoc, getDoc, deleteDoc, collection, query, where, getDocs, writeBatch, updateDoc } from 'firebase/firestore';
import { clearEventSubscriptions } from '../services/calendarService';
import { cacheService } from '../services/cacheService';
import * as Notifications from 'expo-notifications';

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

  const formatUserData = (firebaseUser: User): UserData => {
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
    };
  };

  const fetchUserData = async (uid: string): Promise<UserData | null> => {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
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
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userData = await fetchUserData(userCredential.user.uid);
      
      if (userData) {
        setUser(userData);
        
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          lastLoginAt: new Date().toISOString()
        }, { merge: true });
        
        // 푸시 토큰 등록 (수정됨)
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
            
            // ✅ 새로 추가: 이 토큰을 가진 다른 사용자 찾기
            const usersWithToken = await getDocs(
              query(collection(db, 'users'), 
              where('pushToken', '==', token.data))
            );
            
            // ✅ 새로 추가: 다른 사용자의 토큰 제거
            for (const userDoc of usersWithToken.docs) {
              if (userDoc.id !== userCredential.user.uid) {
                await updateDoc(userDoc.ref, { 
                  pushToken: null,
                  tokenRemovedAt: new Date().toISOString()
                });
                console.log(`이전 사용자(${userDoc.id})의 토큰 제거됨`);
              }
            }
            
            // 현재 사용자에게 토큰 할당
            await updateDoc(doc(db, 'users', userCredential.user.uid), {
              pushToken: token.data,
              tokenUpdatedAt: new Date().toISOString()
            });
            
            console.log('푸시 토큰이 Firestore에 저장됨');
          } else {
            console.log('알림 권한 거부됨 - 토큰 생성 건너뜀');
          }
        } catch (tokenError) {
          console.error('푸시 토큰 등록 오류:', tokenError);
          // 토큰 등록 실패해도 로그인은 계속 진행
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
      
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      await updateProfile(userCredential.user, { displayName });
      
      const userData: UserData = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await setDoc(doc(db, 'users', userCredential.user.uid), userData);
      
      setUser(userData);
      
      // ✨ 새로 추가: 회원가입 직후 푸시 토큰 등록 (login 함수와 동일한 코드)
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
          
          // 이 토큰을 가진 다른 사용자 찾기
          const usersWithToken = await getDocs(
            query(collection(db, 'users'), 
            where('pushToken', '==', token.data))
          );
          
          // 다른 사용자의 토큰 제거
          for (const userDoc of usersWithToken.docs) {
            if (userDoc.id !== userCredential.user.uid) {
              await updateDoc(userDoc.ref, { 
                pushToken: null,
                tokenRemovedAt: new Date().toISOString()
              });
              console.log(`이전 사용자(${userDoc.id})의 토큰 제거됨`);
            }
          }
          
          // 현재 사용자에게 토큰 할당
          await updateDoc(doc(db, 'users', userCredential.user.uid), {
            pushToken: token.data,
            tokenUpdatedAt: new Date().toISOString()
          });
          
          console.log('회원가입 - 푸시 토큰이 Firestore에 저장됨');
        } else {
          console.log('회원가입 - 알림 권한 거부됨 - 토큰 생성 건너뜀');
        }
      } catch (tokenError) {
        console.error('회원가입 - 푸시 토큰 등록 오류:', tokenError);
        // 토큰 등록 실패해도 회원가입은 계속 진행
      }
      // ✨ 추가 끝
      
      await setDoc(doc(db, 'groups', `personal_${userCredential.user.uid}`), {
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
      
      // ✅ 새로 추가: 로그아웃 시 토큰 제거
      if (user?.uid) {
        await updateDoc(doc(db, 'users', user.uid), {
          pushToken: null,
          tokenRemovedAt: new Date().toISOString()
        });
        console.log('로그아웃: 푸시 토큰 제거됨');
      }
      
      clearEventSubscriptions();
      
      await cacheService.clearAllCache();
      console.log('[AuthContext] 오프라인 캐시 정리 완료');
      
      cacheService.cleanup();
      
      await signOut(auth);
      
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
      await sendPasswordResetEmail(auth, email);
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
      
      if (!auth.currentUser) {
        throw new Error('로그인이 필요합니다.');
      }
      
      const updateData: any = { displayName };
      if (photoURL !== undefined) {
        updateData.photoURL = photoURL;
      }
      
      await updateProfile(auth.currentUser, updateData);
      
      const firestoreData: any = {
        displayName,
        updatedAt: new Date().toISOString()
      };
      
      if (photoURL !== undefined) {
        firestoreData.photoURL = photoURL;
      }
      
      await setDoc(doc(db, 'users', auth.currentUser.uid), firestoreData, { merge: true });
      
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
      
      if (!auth.currentUser || !auth.currentUser.email) {
        throw new Error('로그인이 필요합니다.');
      }
      
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email,
        password
      );
      
      await reauthenticateWithCredential(auth.currentUser, credential);
      
      const userId = auth.currentUser.uid;
      
      clearEventSubscriptions();
      
      await cacheService.clearAllCache();
      
      const batch = writeBatch(db);
      
      batch.delete(doc(db, 'users', userId));
      
      const groupsQuery = query(collection(db, 'groups'), where('createdBy', '==', userId));
      const groupsSnapshot = await getDocs(groupsQuery);
      groupsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      const membershipsQuery = query(collection(db, 'groupMembers'), where('userId', '==', userId));
      const membershipsSnapshot = await getDocs(membershipsQuery);
      membershipsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      const eventsQuery = query(collection(db, 'events'), where('userId', '==', userId));
      const eventsSnapshot = await getDocs(eventsQuery);
      eventsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      
      await firebaseDeleteUser(auth.currentUser);
      
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
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const userData = await fetchUserData(firebaseUser.uid);
          if (userData) {
            setUser(userData);
          } else {
            const newUserData = formatUserData(firebaseUser);
            await setDoc(doc(db, 'users', firebaseUser.uid), {
              ...newUserData,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
            setUser(newUserData);
          }
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('인증 상태 변경 처리 오류:', error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
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
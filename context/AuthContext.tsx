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
import { doc, setDoc, getDoc, deleteDoc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { clearEventSubscriptions } from '../services/calendarService';
import { cacheService } from '../services/cacheService'; // 🔥 추가

// 사용자 타입 정의
interface UserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// 인증 컨텍스트 타입 정의
interface AuthContextType {
  user: UserData | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserProfile: (displayName: string, photoURL?: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  clearError: () => void;
}

// 컨텍스트 생성
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider 컴포넌트
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Firebase 사용자 정보를 UserData 형식으로 변환
  const formatUserData = (firebaseUser: User): UserData => {
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
    };
  };

  // Firestore에서 추가 사용자 정보 가져오기
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

  // 로그인
  const login = async (email: string, password: string) => {
    try {
      setError(null);
      setLoading(true);
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userData = await fetchUserData(userCredential.user.uid);
      
      if (userData) {
        setUser(userData);
        
        // 마지막 로그인 시간 업데이트
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          lastLoginAt: new Date().toISOString()
        }, { merge: true });
      } else {
        setUser(formatUserData(userCredential.user));
      }
    } catch (error: any) {
      console.error('로그인 오류:', error);
      
      // 에러 메시지 한글화
      let errorMessage = '로그인 중 오류가 발생했습니다.';
      if (error.code === 'auth/user-not-found') {
        errorMessage = '존재하지 않는 사용자입니다.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = '잘못된 비밀번호입니다.';
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

  // 회원가입
  const register = async (email: string, password: string, displayName: string) => {
    try {
      setError(null);
      setLoading(true);
      
      // Firebase Auth에 사용자 생성
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // 프로필 업데이트
      await updateProfile(userCredential.user, { displayName });
      
      // Firestore에 사용자 정보 저장
      const userData: UserData = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await setDoc(doc(db, 'users', userCredential.user.uid), userData);
      
      setUser(userData);
      
      // 기본 그룹 생성 (개인 캘린더)
      await setDoc(doc(db, 'groups', `personal_${userCredential.user.uid}`), {
        name: '개인 캘린더',
        type: 'personal',
        createdBy: userCredential.user.uid,
        createdAt: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('회원가입 오류:', error);
      
      // 에러 메시지 한글화
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

  // 로그아웃
  const logout = async () => {
    try {
      setLoading(true);
      
      // 🔥 이벤트 구독 정리
      clearEventSubscriptions();
      
      // 🔥 오프라인 캐시 정리
      await cacheService.clearAllCache();
      console.log('[AuthContext] 오프라인 캐시 정리 완료');
      
      // 🔥 캐시 서비스 정리
      cacheService.cleanup();
      
      // Firebase 로그아웃
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

  // 비밀번호 재설정
  const resetPassword = async (email: string) => {
    try {
      setError(null);
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      console.error('비밀번호 재설정 오류:', error);
      
      let errorMessage = '비밀번호 재설정 중 오류가 발생했습니다.';
      if (error.code === 'auth/user-not-found') {
        errorMessage = '존재하지 않는 사용자입니다.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = '올바른 이메일 형식이 아닙니다.';
      }
      
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  // 사용자 프로필 업데이트
  const updateUserProfile = async (displayName: string, photoURL?: string) => {
    try {
      setError(null);
      
      if (!auth.currentUser) {
        throw new Error('로그인이 필요합니다.');
      }
      
      // Firebase Auth 프로필 업데이트
      const updateData: any = { displayName };
      if (photoURL !== undefined) {
        updateData.photoURL = photoURL;
      }
      
      await updateProfile(auth.currentUser, updateData);
      
      // Firestore 업데이트
      const firestoreData: any = {
        displayName,
        updatedAt: new Date().toISOString()
      };
      
      if (photoURL !== undefined) {
        firestoreData.photoURL = photoURL;
      }
      
      await setDoc(doc(db, 'users', auth.currentUser.uid), firestoreData, { merge: true });
      
      // 로컬 상태 업데이트
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

  // 계정 삭제
  const deleteAccount = async (password: string) => {
    try {
      setError(null);
      setLoading(true);
      
      if (!auth.currentUser || !auth.currentUser.email) {
        throw new Error('로그인이 필요합니다.');
      }
      
      // 재인증
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email,
        password
      );
      
      await reauthenticateWithCredential(auth.currentUser, credential);
      
      const userId = auth.currentUser.uid;
      
      // 🔥 이벤트 구독 정리
      clearEventSubscriptions();
      
      // 🔥 오프라인 캐시 정리
      await cacheService.clearAllCache();
      
      // Firestore에서 관련 데이터 삭제
      const batch = writeBatch(db);
      
      // 사용자 문서 삭제
      batch.delete(doc(db, 'users', userId));
      
      // 사용자가 만든 그룹 삭제
      const groupsQuery = query(collection(db, 'groups'), where('createdBy', '==', userId));
      const groupsSnapshot = await getDocs(groupsQuery);
      groupsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      // 그룹 멤버십 삭제
      const membershipsQuery = query(collection(db, 'groupMembers'), where('userId', '==', userId));
      const membershipsSnapshot = await getDocs(membershipsQuery);
      membershipsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      // 개인 이벤트 삭제
      const eventsQuery = query(collection(db, 'events'), where('userId', '==', userId));
      const eventsSnapshot = await getDocs(eventsQuery);
      eventsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      
      // Firebase Auth에서 계정 삭제
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

  // 에러 초기화
  const clearError = () => {
    setError(null);
  };

  // Auth 상태 변경 감지
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // Firestore에서 추가 정보 가져오기
          const userData = await fetchUserData(firebaseUser.uid);
          if (userData) {
            setUser(userData);
          } else {
            // Firestore에 데이터가 없으면 생성
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

// Hook
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
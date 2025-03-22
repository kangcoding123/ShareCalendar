// services/authService.ts
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 인증 상태 저장을 위한 키
const AUTH_CREDENTIALS_KEY = 'auth_credentials';
const AUTH_USER_KEY = 'auth_user';

// 타입 정의
interface AuthResult {
  success: boolean;
  user?: FirebaseUser;
  error?: string;
}

/**
 * 새 사용자 등록
 * @param {string} email - 사용자 이메일
 * @param {string} password - 사용자 비밀번호
 * @param {string} displayName - 사용자 표시 이름
 * @returns {Promise<AuthResult>} 등록 결과
 */
export const registerUser = async (
  email: string, 
  password: string, 
  displayName: string
): Promise<AuthResult> => {
  try {
    // 사용자 계정 생성
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // 사용자 프로필 업데이트
    await updateProfile(user, { displayName });
    
    // Firestore에 사용자 정보 저장
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email,
      displayName,
      createdAt: new Date().toISOString(),
    });
    
    return { success: true, user };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

/**
 * 사용자 로그인
 * @param {string} email - 사용자 이메일
 * @param {string} password - 사용자 비밀번호
 * @returns {Promise<AuthResult>} 로그인 결과
 */
export const loginUser = async (
  email: string, 
  password: string
): Promise<AuthResult> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    
    // 로그인 성공 시 인증 정보 저장
    try {
      // 사용자 정보 저장
      const userData = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: userCredential.user.displayName
      };
      await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(userData));
      
      // 자격 증명 저장 (자동 로그인용)
      await AsyncStorage.setItem(AUTH_CREDENTIALS_KEY, JSON.stringify({ email, password }));
    } catch (storageError) {
      console.error('인증 정보 저장 실패:', storageError);
    }
    
    return { success: true, user: userCredential.user };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

/**
 * 사용자 로그아웃
 * @returns {Promise<AuthResult>} 로그아웃 결과
 */
export const logoutUser = async (): Promise<AuthResult> => {
  try {
    await signOut(auth);
    
    // 저장된 인증 정보 제거
    try {
      await AsyncStorage.removeItem(AUTH_CREDENTIALS_KEY);
      await AsyncStorage.removeItem(AUTH_USER_KEY);
    } catch (storageError) {
      console.error('인증 정보 제거 실패:', storageError);
    }
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

/**
 * 저장된 사용자 정보로 자동 로그인 시도
 * @returns {Promise<AuthResult>} 로그인 결과
 */
export const autoLoginWithSavedCredentials = async (): Promise<AuthResult> => {
  try {
    // 저장된 로그인 정보 확인
    const savedCredentialsJson = await AsyncStorage.getItem(AUTH_CREDENTIALS_KEY);
    
    if (!savedCredentialsJson) {
      return { success: false, error: '저장된 로그인 정보 없음' };
    }
    
    const { email, password } = JSON.parse(savedCredentialsJson);
    
    if (!email || !password) {
      return { success: false, error: '유효하지 않은 저장 정보' };
    }
    
    // 저장된 정보로 로그인 시도
    return await loginUser(email, password);
  } catch (error: any) {
    console.error('자동 로그인 오류:', error);
    
    // 오류 발생 시 저장된 정보 제거
    try {
      await AsyncStorage.removeItem(AUTH_CREDENTIALS_KEY);
      await AsyncStorage.removeItem(AUTH_USER_KEY);
    } catch (storageError) {
      console.error('인증 정보 제거 실패:', storageError);
    }
    
    return { success: false, error: '자동 로그인 실패' };
  }
};

/**
 * 현재 저장된 사용자 정보 가져오기
 * @returns {Promise<any>} 저장된 사용자 정보
 */
export const getSavedUserInfo = async (): Promise<any> => {
  try {
    const userJson = await AsyncStorage.getItem(AUTH_USER_KEY);
    return userJson ? JSON.parse(userJson) : null;
  } catch (error) {
    console.error('저장된 사용자 정보 가져오기 실패:', error);
    return null;
  }
};
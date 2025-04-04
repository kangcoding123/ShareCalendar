// services/authService.ts
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  deleteUser,
  User as FirebaseUser,
  sendPasswordResetEmail
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  updateDoc, 
  getDoc, 
  getDocs, 
  collection, 
  query, 
  where,
  deleteDoc
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications'; 

// 인증 상태 저장을 위한 키
const AUTH_CREDENTIALS_KEY = 'auth_credentials';
const AUTH_USER_KEY = 'auth_user';

// 타입 정의
interface AuthResult {
  success: boolean;
  user?: FirebaseUser;
  error?: string;
  message?: string;
}

/**
 * Firebase 인증 오류 메시지를 사용자 친화적인 메시지로 변환
 */
function getAuthErrorMessage(errorCode: string): string {
  // Firebase 오류 코드에 따른 사용자 친화적인 메시지
  const errorMessages: Record<string, string> = {
    'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
    'auth/user-not-found': '등록되지 않은 이메일입니다.',
    'auth/wrong-password': '비밀번호가 올바르지 않습니다.',
    'auth/invalid-email': '유효하지 않은 이메일 형식입니다.',
    'auth/user-disabled': '비활성화된 계정입니다. 관리자에게 문의하세요.',
    'auth/too-many-requests': '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
    'auth/network-request-failed': '네트워크 연결을 확인해주세요.',
    'auth/email-already-in-use': '이미 사용 중인 이메일입니다.',
    'auth/weak-password': '비밀번호는 6자 이상이어야 합니다.',
    'auth/requires-recent-login': '보안을 위해 다시 로그인한 후 탈퇴를 진행해주세요.'
  };

  // 오류 코드에 해당하는 메시지가 있으면 반환, 없으면 기본 메시지 반환
  return errorMessages[errorCode] || '로그인에 실패했습니다. 다시 시도해주세요.';
}

/**
 * 비밀번호 재설정 이메일 전송 함수
 */
export const sendPasswordReset = async (email: string): Promise<AuthResult> => {
  try {
    await sendPasswordResetEmail(auth, email);
    return { 
      success: true, 
      message: '비밀번호 재설정 링크가 이메일로 전송되었습니다. 메일함을 확인해주세요.' 
    };
  } catch (error: any) {
    const errorCode = error.code || '';
    let errorMessage;
    
    // 오류 코드에 따른 사용자 친화적 메시지
    switch (errorCode) {
      case 'auth/invalid-email':
        errorMessage = '유효하지 않은 이메일 주소입니다.';
        break;
      case 'auth/user-not-found':
        errorMessage = '등록되지 않은 이메일 주소입니다.';
        break;
      case 'auth/too-many-requests':
        errorMessage = '너무 많은 요청이 있었습니다. 잠시 후 다시 시도해주세요.';
        break;
      case 'auth/network-request-failed':
        errorMessage = '네트워크 연결을 확인해주세요.';
        break;
      default:
        errorMessage = '비밀번호 재설정 이메일을 보내는 중 오류가 발생했습니다.';
    }
    
    console.error('비밀번호 재설정 오류:', error);
    return { success: false, error: errorMessage };
  }
};

/**
 * 회원 탈퇴 (계정 삭제)
 * @returns {Promise<AuthResult>} 탈퇴 결과
 */
export const deleteAccount = async (): Promise<AuthResult> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: '로그인된 사용자가 없습니다.' };
    }

    const userId = currentUser.uid;

    // 1. 사용자가 속한 그룹 멤버십 삭제
    const membershipQuery = query(
      collection(db, 'groupMembers'),
      where('userId', '==', userId)
    );
    
    const membershipSnapshot = await getDocs(membershipQuery);
    const deletePromises: Promise<void>[] = [];
    
    membershipSnapshot.forEach((doc) => {
      deletePromises.push(deleteDoc(doc.ref));
    });
    
    // 2. 사용자의 개인 일정 삭제
    const eventsQuery = query(
      collection(db, 'events'),
      where('userId', '==', userId),
      where('groupId', '==', 'personal')
    );
    
    const eventsSnapshot = await getDocs(eventsQuery);
    
    eventsSnapshot.forEach((doc) => {
      deletePromises.push(deleteDoc(doc.ref));
    });
    
    // 3. 사용자의 Firestore 데이터 삭제
    deletePromises.push(deleteDoc(doc(db, 'users', userId)));
    
    // 4. 모든 데이터 삭제 작업 실행
    await Promise.all(deletePromises);
    
    // 5. Firebase Auth에서 사용자 계정 삭제
    await deleteUser(currentUser);
    
    // 6. 로컬 저장소에서 인증 정보 제거
    try {
      await AsyncStorage.removeItem(AUTH_CREDENTIALS_KEY);
      await AsyncStorage.removeItem(AUTH_USER_KEY);
    } catch (storageError) {
      console.error('인증 정보 제거 실패:', storageError);
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('회원 탈퇴 오류:', error);
    
    // 재인증이 필요한 경우 특별히 처리
    if (error.code === 'auth/requires-recent-login') {
      return { 
        success: false, 
        error: '보안을 위해 다시 로그인한 후 탈퇴를 진행해주세요. 로그아웃 후 다시 로그인해주세요.' 
      };
    }
    
    return { success: false, error: error.message };
  }
};

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
    
    // Firestore에 사용자 정보 저장 (새 필드 포함)
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email,
      displayName,
      createdAt: new Date().toISOString(),
      // 새 필드 추가
      pushToken: null,
      tokenUpdatedAt: null,
      unreadNotifications: 0
    });
    
    return { success: true, user };
  } catch (error: any) {
    const errorCode = error.code || '';
    const friendlyMessage = getAuthErrorMessage(errorCode);
    
    console.error('회원가입 오류:', error.code, error.message);
    return { success: false, error: friendlyMessage };
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
      
      // 푸시 토큰 등록 시도 (추가된 부분)
      try {
        console.log('푸시 토큰 등록 시도 - 사용자 ID:', userCredential.user.uid);
        
        const { status } = await Notifications.getPermissionsAsync();
        if (status === 'granted') {
          const token = await Notifications.getExpoPushTokenAsync({
            projectId: 'acfa6bea-3fb9-4677-8980-6e08d2324c51'
          });
          
          console.log('푸시 토큰 생성 성공:', token.data);
          
          // Firestore에 토큰 저장
          await updateDoc(doc(db, 'users', userCredential.user.uid), {
            pushToken: token.data,
            tokenUpdatedAt: new Date().toISOString()
          });
          
          console.log('푸시 토큰이 Firestore에 저장됨');
        }
      } catch (tokenError) {
        console.error('푸시 토큰 등록 오류:', tokenError);
      }
      
      // Firestore에 새 필드 추가
      const userRef = doc(db, 'users', userCredential.user.uid);
      
      try {
        // 먼저 사용자 문서가 존재하는지 확인
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          // 기존 문서에 새 필드 추가 (updateDoc 사용)
          const userData = userDoc.data();
          const fieldsToUpdate: Record<string, any> = {};
          
          // 필드가 없는 경우에만 추가
          if (userData.pushToken === undefined) {
            fieldsToUpdate.pushToken = null;
          }
          
          if (userData.tokenUpdatedAt === undefined) {
            fieldsToUpdate.tokenUpdatedAt = null;
          }
          
          if (userData.unreadNotifications === undefined) {
            fieldsToUpdate.unreadNotifications = 0;
          }
          
          // 업데이트할 필드가 있는 경우만 실행
          if (Object.keys(fieldsToUpdate).length > 0) {
            await updateDoc(userRef, fieldsToUpdate);
            console.log(`사용자 ${userCredential.user.uid}의 문서에 새 필드 추가 완료`);
          }
        } else {
          // 사용자 문서가 없으면 새로 생성
          await setDoc(userRef, {
            uid: userCredential.user.uid,
            email: userCredential.user.email,
            displayName: userCredential.user.displayName,
            createdAt: new Date().toISOString(),
            pushToken: null,
            tokenUpdatedAt: null,
            unreadNotifications: 0
          });
          console.log(`사용자 ${userCredential.user.uid}의 문서 새로 생성 완료`);
        }
      } catch (firestoreError) {
        console.error('Firestore 사용자 문서 업데이트 실패:', firestoreError);
      }
      
    } catch (storageError) {
      console.error('인증 정보 저장 실패:', storageError);
    }
    
    return { success: true, user: userCredential.user };
  } catch (error: any) {
    const errorCode = error.code || '';
    const friendlyMessage = getAuthErrorMessage(errorCode);
    
    console.error('로그인 오류:', error.code, error.message);
    return { success: false, error: friendlyMessage };
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
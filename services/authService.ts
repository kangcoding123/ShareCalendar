// services/authService.ts
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { nativeDb } from '../config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

// 인증 상태 저장을 위한 키
const AUTH_CREDENTIALS_KEY = 'auth_credentials';
const AUTH_USER_KEY = 'auth_user';

// 타입 정의
interface AuthResult {
  success: boolean;
  user?: any; // Firebase Native SDK User 타입
  error?: string;
  message?: string;
}

/**
 * Firebase 인증 오류 메시지를 사용자 친화적인 메시지로 변환
 */
function getAuthErrorMessage(errorCode: string): string {
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

  return errorMessages[errorCode] || '로그인에 실패했습니다. 다시 시도해주세요.';
}

/**
 * 비밀번호 재설정 이메일 전송 함수
 */
export const sendPasswordReset = async (email: string): Promise<AuthResult> => {
  try {
    await auth().sendPasswordResetEmail(email);
    return { 
      success: true, 
      message: '비밀번호 재설정 링크가 이메일로 전송되었습니다. 메일함을 확인해주세요.' 
    };
  } catch (error: any) {
    const errorCode = error.code || '';
    let errorMessage;
    
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
 * @param password 재인증을 위한 비밀번호
 */
export const deleteAccount = async (password: string): Promise<AuthResult> => {
  try {
    const currentUser = auth().currentUser;
    if (!currentUser || !currentUser.email) {
      return { success: false, error: '로그인된 사용자가 없습니다.' };
    }

    const userId = currentUser.uid;

    // 1. 먼저 재인증 수행 (Firebase 보안 정책)
    try {
      const credential = auth.EmailAuthProvider.credential(
        currentUser.email,
        password
      );
      await currentUser.reauthenticateWithCredential(credential);
      console.log('[deleteAccount] 재인증 성공');
    } catch (reauthError: any) {
      console.error('[deleteAccount] 재인증 실패:', reauthError.code);
      if (reauthError.code === 'auth/wrong-password' || reauthError.code === 'auth/invalid-credential') {
        return { success: false, error: '비밀번호가 올바르지 않습니다.' };
      }
      return { success: false, error: '인증에 실패했습니다. 다시 시도해주세요.' };
    }

    // 2. Firestore 데이터 삭제 (배치 사용)
    const batch = nativeDb.batch();

    // 2-1. 사용자가 속한 그룹 멤버십 삭제 + 그룹 memberCount 감소
    const membershipSnapshot = await nativeDb
      .collection('groupMembers')
      .where('userId', '==', userId)
      .get();

    membershipSnapshot.forEach((doc) => {
      const memberData = doc.data();
      const groupId = memberData.groupId;

      // 그룹 memberCount 감소
      if (groupId && groupId !== 'personal') {
        const groupRef = nativeDb.collection('groups').doc(groupId);
        batch.update(groupRef, {
          memberCount: firestore.FieldValue.increment(-1)
        });
      }

      // groupMembers 문서 삭제
      batch.delete(doc.ref);
    });

    // 2-2. 사용자가 생성한 모든 일정 삭제 (개인 + 그룹)
    const eventsSnapshot = await nativeDb
      .collection('events')
      .where('userId', '==', userId)
      .get();

    eventsSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // 2-3. 사용자의 Firestore 데이터 삭제
    batch.delete(nativeDb.collection('users').doc(userId));

    // 2-4. 배치 커밋
    await batch.commit();
    console.log('[deleteAccount] Firestore 데이터 삭제 완료');

    // 3. Firebase Auth에서 사용자 계정 삭제
    await currentUser.delete();
    console.log('[deleteAccount] Firebase Auth 계정 삭제 완료');

    // 4. 로컬 저장소에서 인증 정보 제거
    try {
      await AsyncStorage.removeItem(AUTH_CREDENTIALS_KEY);
      await AsyncStorage.removeItem(AUTH_USER_KEY);
    } catch (storageError) {
      console.error('인증 정보 제거 실패:', storageError);
    }

    return { success: true };
  } catch (error: any) {
    console.error('회원 탈퇴 오류:', error);

    if (error.code === 'auth/requires-recent-login') {
      return {
        success: false,
        error: '보안을 위해 다시 로그인한 후 탈퇴를 진행해주세요.'
      };
    }

    return { success: false, error: error.message || '회원 탈퇴 중 오류가 발생했습니다.' };
  }
};

/**
 * 새 사용자 등록
 */
export const registerUser = async (
  email: string, 
  password: string, 
  displayName: string
): Promise<AuthResult> => {
  try {
    // Native SDK로 사용자 계정 생성
    const userCredential = await auth().createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    // 사용자 프로필 업데이트
    await user.updateProfile({ displayName });
    
    // Firestore에 사용자 정보 저장
    await nativeDb.collection('users').doc(user.uid).set({
      uid: user.uid,
      email,
      displayName,
      createdAt: new Date().toISOString(),
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
 */
export const loginUser = async (
  email: string, 
  password: string
): Promise<AuthResult> => {
  try {
    // Native SDK로 로그인
    const userCredential = await auth().signInWithEmailAndPassword(email, password);
    
    try {
      const userData = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: userCredential.user.displayName
      };
      await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(userData));
      await AsyncStorage.setItem(AUTH_CREDENTIALS_KEY, JSON.stringify({ email, password }));
      
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
          
          await nativeDb.collection('users').doc(userCredential.user.uid).update({
            pushToken: token.data,
            tokenUpdatedAt: new Date().toISOString()
          });
          
          console.log('푸시 토큰이 Firestore에 저장됨');
        } else {
          console.log('알림 권한 거부됨 - 토큰 생성 건너뜀');
        }
      } catch (tokenError: any) {
        console.error('푸시 토큰 등록 오류:', tokenError);
      }
      
      // Firestore 사용자 문서 확인 및 업데이트
      const userDoc = await nativeDb.collection('users').doc(userCredential.user.uid).get();
      
      if ((userDoc as any).exists) {
        const userData = userDoc.data();
        const fieldsToUpdate: Record<string, any> = {};
        
        if (userData?.pushToken === undefined) {
          fieldsToUpdate.pushToken = null;
        }
        
        if (userData?.tokenUpdatedAt === undefined) {
          fieldsToUpdate.tokenUpdatedAt = null;
        }
        
        if (userData?.unreadNotifications === undefined) {
          fieldsToUpdate.unreadNotifications = 0;
        }
        
        if (Object.keys(fieldsToUpdate).length > 0) {
          await nativeDb.collection('users').doc(userCredential.user.uid).update(fieldsToUpdate);
          console.log(`사용자 ${userCredential.user.uid}의 문서에 새 필드 추가 완료`);
        }
      } else {
        await nativeDb.collection('users').doc(userCredential.user.uid).set({
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
 */
export const logoutUser = async (): Promise<AuthResult> => {
  try {
    await auth().signOut();
    
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
 */
export const autoLoginWithSavedCredentials = async (): Promise<AuthResult> => {
  try {
    const savedCredentialsJson = await AsyncStorage.getItem(AUTH_CREDENTIALS_KEY);
    
    if (!savedCredentialsJson) {
      return { success: false, error: '저장된 로그인 정보 없음' };
    }
    
    const { email, password } = JSON.parse(savedCredentialsJson);
    
    if (!email || !password) {
      return { success: false, error: '유효하지 않은 저장 정보' };
    }
    
    return await loginUser(email, password);
  } catch (error: any) {
    console.error('자동 로그인 오류:', error);
    
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
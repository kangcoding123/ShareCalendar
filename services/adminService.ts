// services/adminService.ts
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../config/firebase';

/**
 * 현재 로그인한 사용자가 관리자인지 확인
 * @returns {Promise<boolean>} 관리자 여부
 */
export const isCurrentUserAdmin = async (): Promise<boolean> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return false;
    }
    
    return await isUserAdmin(currentUser.uid);
  } catch (error) {
    console.error('관리자 확인 오류:', error);
    return false;
  }
};

/**
 * 특정 사용자 ID가 관리자인지 확인
 * @param {string} userId - 사용자 ID
 * @returns {Promise<boolean>} 관리자 여부
 */
export const isUserAdmin = async (userId: string): Promise<boolean> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return false;
    }
    
    const userData = userDoc.data();
    return userData.isAdmin === true;
  } catch (error) {
    console.error('사용자 관리자 확인 오류:', error);
    return false;
  }
};

/**
 * 앱 비밀번호를 사용한 관리자 인증
 * @param {string} password - 앱 관리자 비밀번호
 * @returns {Promise<boolean>} 인증 성공 여부
 */
export const authenticateWithAdminPassword = async (password: string): Promise<boolean> => {
  try {
    // 앱 설정에서 관리자 비밀번호 가져오기
    const configDoc = await getDoc(doc(db, 'app_config', 'admin_settings'));
    if (!configDoc.exists()) {
      return false;
    }
    
    const configData = configDoc.data();
    const adminPassword = configData.adminPassword;
    
    // 비밀번호 비교
    return adminPassword === password;
  } catch (error) {
    console.error('관리자 비밀번호 확인 오류:', error);
    return false;
  }
};
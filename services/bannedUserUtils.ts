// services/bannedUserUtils.ts
import { query, collection, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * 사용자가 그룹에서 차단되었는지 확인
 * (순환 참조 해결을 위해 분리)
 */
export const isUserBannedFromGroup = async (
  groupId: string,
  userId: string,
  email: string
): Promise<boolean> => {
  try {
    // userId로 확인
    const bannedByIdQuery = query(
      collection(db, 'groupBannedMembers'),
      where('groupId', '==', groupId),
      where('userId', '==', userId)
    );
    
    const bannedByIdSnapshot = await getDocs(bannedByIdQuery);
    if (!bannedByIdSnapshot.empty) {
      return true;
    }
    
    // email로도 확인 (계정을 다시 만든 경우 대비)
    const bannedByEmailQuery = query(
      collection(db, 'groupBannedMembers'),
      where('groupId', '==', groupId),
      where('email', '==', email)
    );
    
    const bannedByEmailSnapshot = await getDocs(bannedByEmailQuery);
    return !bannedByEmailSnapshot.empty;
  } catch (error) {
    console.error('차단 확인 오류:', error);
    return false;
  }
};
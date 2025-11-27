// services/bannedUserUtils.ts
import { nativeDb } from '../config/firebase';

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
    const bannedByIdSnapshot = await nativeDb
      .collection('groupBannedMembers')
      .where('groupId', '==', groupId)
      .where('userId', '==', userId)
      .get();
    
    if (!bannedByIdSnapshot.empty) {
      return true;
    }
    
    // email로도 확인 (계정을 다시 만든 경우 대비)
    const bannedByEmailSnapshot = await nativeDb
      .collection('groupBannedMembers')
      .where('groupId', '==', groupId)
      .where('email', '==', email)
      .get();
    
    return !bannedByEmailSnapshot.empty;
  } catch (error) {
    console.error('차단 확인 오류:', error);
    return false;
  }
};
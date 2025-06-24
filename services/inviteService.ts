// services/inviteService.ts
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  getDoc,
  addDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Group } from './groupService';
import { isUserBannedFromGroup } from './groupService';

// 초대 관련 타입 정의
export interface InviteInfo {
  groupId: string;
  inviteCode: string;
  inviteLink: string;
  createdAt: string;
  usageCount?: number;
}

interface InviteResult {
  success: boolean;
  inviteCode?: string;
  inviteLink?: string;
  group?: Group;
  error?: string;
}

/**
 * 6자리 랜덤 초대 코드 생성
 * 읽기 쉽도록 비슷한 문자 제외 (0, O, I, l 등)
 */
const generateInviteCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  
  // 현재 시간을 밀리초로 변환하여 활용
  const timestamp = Date.now();
  const timeString = timestamp.toString(36).toUpperCase(); // 36진수로 변환
  
  // 시간 기반 2자리 + 랜덤 4자리
  code = timeString.slice(-2);
  
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return code;
};

/**
 * 초대 코드 중복 확인
 * @param code 확인할 초대 코드
 * @returns 중복 여부
 */
const isInviteCodeExists = async (code: string): Promise<boolean> => {
  try {
    const groupsQuery = query(
      collection(db, 'groups'),
      where('inviteCode', '==', code)
    );
    
    const snapshot = await getDocs(groupsQuery);
    return !snapshot.empty;
  } catch (error) {
    console.error('초대 코드 중복 확인 오류:', error);
    return true; // 오류 시 중복으로 간주
  }
};

/**
 * 고유한 초대 코드 생성 (중복 확인 포함)
 * @returns 고유한 초대 코드
 */
export const createUniqueInviteCode = async (): Promise<string> => {
  let code = '';
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    code = generateInviteCode();
    const exists = await isInviteCodeExists(code);
    
    if (!exists) {
      return code;
    }
    
    attempts++;
  }
  
  // 10번 시도 후에도 실패하면 타임스탬프 추가
  return code + Date.now().toString().slice(-3);
};

/**
 * 그룹에 초대 코드 생성 및 저장
 * @param groupId 그룹 ID
 * @returns 초대 정보
 */
export const generateInviteForGroup = async (groupId: string): Promise<InviteResult> => {
  try {
    // 그룹 존재 확인
    const groupRef = doc(db, 'groups', groupId);
    const groupDoc = await getDoc(groupRef);
    
    if (!groupDoc.exists()) {
      return { success: false, error: '그룹을 찾을 수 없습니다.' };
    }
    
    const groupData = groupDoc.data();
    
    // 이미 초대 코드가 있는지 확인
    if (groupData.inviteCode) {
      return {
        success: true,
        inviteCode: groupData.inviteCode,
        inviteLink: groupData.inviteLink || `weincalendar://invite/${groupData.inviteCode}`
      };
    }
    
    // 새 초대 코드 생성
    const inviteCode = await createUniqueInviteCode();
    const inviteLink = `weincalendar://invite/${inviteCode}`;
    
    // 그룹 문서 업데이트
    await updateDoc(groupRef, {
      inviteCode,
      inviteLink,
      inviteCreatedAt: new Date().toISOString()
    });
    
    console.log(`그룹 ${groupId}에 초대 코드 생성: ${inviteCode}`);
    
    return {
      success: true,
      inviteCode,
      inviteLink
    };
  } catch (error: any) {
    console.error('초대 코드 생성 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 초대 코드로 그룹 찾기
 * @param inviteCode 초대 코드
 * @returns 그룹 정보
 */
export const findGroupByInviteCode = async (inviteCode: string): Promise<InviteResult> => {
  try {
    // 대소문자 구분 없이 검색하기 위해 대문자로 변환
    const normalizedCode = inviteCode.toUpperCase().trim();
    
    const groupsQuery = query(
      collection(db, 'groups'),
      where('inviteCode', '==', normalizedCode)
    );
    
    const snapshot = await getDocs(groupsQuery);
    
    if (snapshot.empty) {
      return { success: false, error: '유효하지 않은 초대 코드입니다.' };
    }
    
    const groupDoc = snapshot.docs[0];
    const groupData = groupDoc.data();
    
    return {
      success: true,
      group: {
        id: groupDoc.id,
        name: groupData.name,
        description: groupData.description,
        createdBy: groupData.createdBy,
        memberCount: groupData.memberCount,
        ...groupData
      } as Group
    };
  } catch (error: any) {
    console.error('초대 코드로 그룹 찾기 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 초대 코드를 사용하여 그룹에 가입
 * @param inviteCode 초대 코드
 * @param userId 사용자 ID
 * @param userEmail 사용자 이메일
 * @returns 가입 결과
 */
export const joinGroupWithInviteCode = async (
  inviteCode: string,
  userId: string,
  userEmail: string
): Promise<InviteResult> => {
  try {
    // 초대 코드로 그룹 찾기
    const findResult = await findGroupByInviteCode(inviteCode);
    
    if (!findResult.success || !findResult.group) {
      return { success: false, error: findResult.error };
    }
    
    const group = findResult.group;
    
    // 차단된 사용자인지 확인
    const isBanned = await isUserBannedFromGroup(group.id, userId, userEmail);
    if (isBanned) {
      return { success: false, error: '이 그룹에 가입할 수 없습니다.' };
    }
    
    // 이미 멤버인지 확인
    const membersQuery = query(
      collection(db, 'groupMembers'),
      where('groupId', '==', group.id),
      where('userId', '==', userId)
    );
    
    const memberSnapshot = await getDocs(membersQuery);
    
    if (!memberSnapshot.empty) {
      return { success: false, error: '이미 이 그룹의 멤버입니다.' };
    }
    
    // 그룹 멤버로 추가
    await addDoc(collection(db, 'groupMembers'), {
      groupId: group.id,
      userId,
      email: userEmail,
      role: 'member',
      joinedAt: new Date().toISOString(),
      joinMethod: 'invite_code',
      color: '#4CAF50' // 기본 색상
    });
    
    // 멤버 수 업데이트
    const groupRef = doc(db, 'groups', group.id);
    const currentCount = group.memberCount || 0;
    
    await updateDoc(groupRef, {
      memberCount: currentCount + 1,
      lastJoinedAt: new Date().toISOString()
    });
    
    // 초대 사용 횟수 업데이트 (선택사항)
    const usageCount = (await getDoc(groupRef)).data()?.inviteUsageCount || 0;
    await updateDoc(groupRef, {
      inviteUsageCount: usageCount + 1
    });
    
    console.log(`사용자 ${userId}가 초대 코드 ${inviteCode}로 그룹 ${group.id}에 가입`);
    
    return {
      success: true,
      group
    };
  } catch (error: any) {
    console.error('초대 코드로 그룹 가입 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 공유용 초대 메시지 생성
 * @param groupName 그룹 이름
 * @param inviteCode 초대 코드
 * @param inviteLink 초대 링크
 * @returns 공유 메시지
 */
export const createInviteMessage = (
  groupName: string,
  inviteCode: string,
  inviteLink?: string
): string => {
  return `WE:IN 캘린더 초대\n` +  // \n 하나 = 줄바꿈 1번
         `${groupName} 그룹에 초대합니다.\n` +  // \n\n = 줄바꿈 2번 (빈 줄 하나)
         `초대 코드: ${inviteCode}\n` +
         `앱에서 [그룹] → [초대 코드로 가입]\n` +
         `위 코드를 입력해주세요.\n\n` +
         `앱 다운로드\n` +
         `━━━━━━━━━━━━━━━\n` +
         ` iPhone\n` +
         `https://apps.apple.com/app/id6744455915\n` +
         `━━━━━━━━━━━━━━━\n` +
         ` Android\n` +
         `https://play.google.com/store/apps/details?id=com.kangcoding.sharecalendar`;
};

/**
 * 초대 통계 가져오기 (선택 기능)
 * @param groupId 그룹 ID
 * @returns 초대 통계
 */
export const getInviteStats = async (groupId: string): Promise<{
  inviteCode?: string;
  usageCount: number;
  createdAt?: string;
}> => {
  try {
    const groupRef = doc(db, 'groups', groupId);
    const groupDoc = await getDoc(groupRef);
    
    if (!groupDoc.exists()) {
      return { usageCount: 0 };
    }
    
    const data = groupDoc.data();
    
    return {
      inviteCode: data.inviteCode,
      usageCount: data.inviteUsageCount || 0,
      createdAt: data.inviteCreatedAt
    };
  } catch (error) {
    console.error('초대 통계 조회 오류:', error);
    return { usageCount: 0 };
  }
};
// services/groupService.ts
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  getDocs,
  getDoc,
  DocumentData,
  writeBatch  // 추가
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { createUniqueInviteCode } from './inviteService';

// 타입 정의 수정
export interface Group {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
  memberCount?: number;
  role?: string;
  color?: string; // 사용자가 선택한 그룹 색상
  [key: string]: any;
}

// 부분적인 Group 타입 정의 추가
export type PartialGroup = Partial<Group> & { id: string };

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  role: string;
  joinedAt: string;
  displayName?: string;
  email?: string;
  color?: string; // 사용자별 그룹 색상
}

interface GroupResult {
  success: boolean;
  group?: Group | PartialGroup; 
  groups?: (Group | PartialGroup)[]; 
  error?: string;
  groupId?: string;
}

interface MemberResult {
  success: boolean;
  members?: GroupMember[];
  error?: string;
}

/**
 * 그룹 관리자 권한 위임
 * @param {string} groupId - 그룹 ID
 * @param {string} currentOwnerId - 현재 관리자 ID
 * @param {string} newOwnerId - 새 관리자 ID
 * @returns {Promise<GroupResult>} 위임 결과
 */
export const transferOwnership = async (
  groupId: string,
  currentOwnerId: string,
  newOwnerId: string
): Promise<GroupResult> => {
  try {
    // 1. 현재 관리자 확인
    const currentOwnerQuery = query(
      collection(db, 'groupMembers'),
      where('groupId', '==', groupId),
      where('userId', '==', currentOwnerId),
      where('role', '==', 'owner')
    );
    
    const currentOwnerSnapshot = await getDocs(currentOwnerQuery);
    
    if (currentOwnerSnapshot.empty) {
      return { success: false, error: '현재 사용자가 관리자가 아닙니다.' };
    }
    
    // 2. 새 관리자가 멤버인지 확인
    const newOwnerQuery = query(
      collection(db, 'groupMembers'),
      where('groupId', '==', groupId),
      where('userId', '==', newOwnerId)
    );
    
    const newOwnerSnapshot = await getDocs(newOwnerQuery);
    
    if (newOwnerSnapshot.empty) {
      return { success: false, error: '선택한 사용자가 그룹 멤버가 아닙니다.' };
    }
    
    // 3. 트랜잭션으로 권한 변경
    const batch = writeBatch(db);
    
    // 현재 관리자를 일반 멤버로 변경
    const currentOwnerDoc = currentOwnerSnapshot.docs[0];
    batch.update(doc(db, 'groupMembers', currentOwnerDoc.id), {
      role: 'member',
      updatedAt: new Date().toISOString()
    });
    
    // 새 관리자로 변경
    const newOwnerDoc = newOwnerSnapshot.docs[0];
    batch.update(doc(db, 'groupMembers', newOwnerDoc.id), {
      role: 'owner',
      updatedAt: new Date().toISOString()
    });
    
    // 그룹 문서에도 소유자 변경 기록
    batch.update(doc(db, 'groups', groupId), {
      createdBy: newOwnerId,
      ownershipTransferredAt: new Date().toISOString(),
      ownershipTransferredFrom: currentOwnerId,
      updatedAt: new Date().toISOString()
    });
    
    await batch.commit();
    
    return { success: true };
  } catch (error: any) {
    console.error('권한 위임 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 그룹 탈퇴 함수
 * @param {string} groupId - 그룹 ID
 * @param {string} userId - 사용자 ID
 * @returns {Promise<GroupResult>} 탈퇴 결과
 */
export const leaveGroup = async (
  groupId: string,
  userId: string
): Promise<GroupResult> => {
  try {
    // 해당 사용자의 그룹 멤버십 찾기
    const membersQuery = query(
      collection(db, 'groupMembers'),
      where('userId', '==', userId),
      where('groupId', '==', groupId)
    );
    
    const snapshot = await getDocs(membersQuery);
    
    if (snapshot.empty) {
      return { success: false, error: '그룹 멤버십을 찾을 수 없습니다.' };
    }
    
    // 사용자가 그룹의 소유자인지 확인
    const memberDoc = snapshot.docs[0];
    const memberData = memberDoc.data();
    
    if (memberData.role === 'owner') {
      return { success: false, error: '그룹의 관리자는 탈퇴할 수 없습니다. 그룹을 삭제하거나 다른 멤버에게 관리자 권한을 이전하세요.' };
    }
    
    // 멤버십 문서 삭제
    await deleteDoc(doc(db, 'groupMembers', memberDoc.id));
    
    // 그룹의 memberCount 업데이트
    const groupRef = doc(db, 'groups', groupId);
    const groupDoc = await getDoc(groupRef);
    
    if (groupDoc.exists()) {
      const groupData = groupDoc.data();
      const currentCount = groupData.memberCount || 0;
      
      if (currentCount > 0) {
        await updateDoc(groupRef, {
          memberCount: currentCount - 1
        });
      }
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('그룹 탈퇴 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 그룹에서 멤버 강퇴 (관리자 권한 필요)
 * @param {string} groupId - 그룹 ID
 * @param {string} targetUserId - 강퇴할 사용자 ID
 * @param {string} adminUserId - 관리자 사용자 ID
 * @returns {Promise<GroupResult>} 강퇴 결과
 */
export const removeMemberFromGroup = async (
  groupId: string,
  targetUserId: string,
  adminUserId: string
): Promise<GroupResult> => {
  try {
    // 관리자 권한 확인
    const adminQuery = query(
      collection(db, 'groupMembers'),
      where('groupId', '==', groupId),
      where('userId', '==', adminUserId),
      where('role', '==', 'owner')
    );
    
    const adminSnapshot = await getDocs(adminQuery);
    
    if (adminSnapshot.empty) {
      return { success: false, error: '관리자 권한이 없습니다.' };
    }
    
    // 강퇴할 멤버 찾기
    const memberQuery = query(
      collection(db, 'groupMembers'),
      where('groupId', '==', groupId),
      where('userId', '==', targetUserId)
    );
    
    const memberSnapshot = await getDocs(memberQuery);
    
    if (memberSnapshot.empty) {
      return { success: false, error: '해당 멤버를 찾을 수 없습니다.' };
    }
    
    const memberDoc = memberSnapshot.docs[0];
    const memberData = memberDoc.data();
    
    // 관리자는 강퇴할 수 없음
    if (memberData.role === 'owner') {
      return { success: false, error: '관리자는 강퇴할 수 없습니다.' };
    }
    
    // 멤버 삭제
    await deleteDoc(doc(db, 'groupMembers', memberDoc.id));
    
    // 차단 목록에 추가
    await addDoc(collection(db, 'groupBannedMembers'), {
      groupId,
      userId: targetUserId,
      bannedBy: adminUserId,
      bannedAt: new Date().toISOString(),
      email: memberData.email // 이메일도 저장 (이메일로도 차단 확인)
    });

    // 그룹의 memberCount 업데이트
    const groupRef = doc(db, 'groups', groupId);
    const groupDoc = await getDoc(groupRef);
    
    if (groupDoc.exists()) {
      const groupData = groupDoc.data();
      const currentCount = groupData.memberCount || 0;
      
      if (currentCount > 0) {
        await updateDoc(groupRef, {
          memberCount: currentCount - 1
        });
      }
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('멤버 강퇴 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 사용자가 그룹에서 차단되었는지 확인
 * @param {string} groupId - 그룹 ID
 * @param {string} userId - 사용자 ID
 * @param {string} email - 사용자 이메일
 * @returns {Promise<boolean>} 차단 여부
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

/**
 * 사용자별 그룹 색상 설정
 * @param userId 사용자 ID
 * @param groupId 그룹 ID
 * @param color 선택한 색상
 */
export const setUserGroupColor = async (
  userId: string,
  groupId: string,
  color: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // 해당 사용자의 그룹 멤버십 찾기
    const membersQuery = query(
      collection(db, 'groupMembers'),
      where('userId', '==', userId),
      where('groupId', '==', groupId)
    );
    
    const snapshot = await getDocs(membersQuery);
    
    if (snapshot.empty) {
      return { success: false, error: '그룹 멤버십을 찾을 수 없습니다.' };
    }
    
    // 멤버십 문서 업데이트
    const memberDoc = snapshot.docs[0];
    await updateDoc(doc(db, 'groupMembers', memberDoc.id), {
      color: color
    });
    
    return { success: true };
  } catch (error: any) {
    console.error('그룹 색상 설정 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 새 그룹 생성
 * @param {Omit<Group, 'id'>} groupData - 그룹 데이터
 * @returns {Promise<GroupResult>} 생성 결과
 */
export const createGroup = async (groupData: Omit<Group, 'id'>): Promise<GroupResult> => {
  try {
    // ⭐ 초대 코드 생성
    const inviteCode = await createUniqueInviteCode();
    const inviteLink = `weincalendar://invite/${inviteCode}`;
    
    const docRef = await addDoc(collection(db, 'groups'), {
      ...groupData,
      createdAt: new Date().toISOString(),
      // ⭐ 초대 정보 추가
      inviteCode,
      inviteLink,
      inviteCreatedAt: new Date().toISOString(),
      inviteUsageCount: 0
    });
    
    // 그룹 생성자를 첫 번째 멤버로 추가
    await addDoc(collection(db, 'groupMembers'), {
      groupId: docRef.id,
      userId: groupData.createdBy,
      role: 'owner',
      joinedAt: new Date().toISOString(),
      color: '#4CAF50' // 기본 색상
    });
    
    return { success: true, groupId: docRef.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

/**
 * 그룹 정보 업데이트
 * @param {string} groupId - 그룹 ID
 * @param {Partial<Group>} groupData - 그룹 데이터
 * @returns {Promise<GroupResult>} 업데이트 결과
 */
export const updateGroup = async (
  groupId: string, 
  groupData: Partial<Group>
): Promise<GroupResult> => {
  try {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
      ...groupData,
      updatedAt: new Date().toISOString()
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

/**
 * 그룹에 멤버 초대
 * @param {string} groupId - 그룹 ID
 * @param {string} email - 초대할 사용자 이메일
 * @returns {Promise<GroupResult>} 초대 결과
 */
export const inviteToGroup = async (
  groupId: string, 
  email: string
): Promise<GroupResult> => {
  try {
    console.log(`[inviteToGroup] 초대 시작. 그룹 ID: ${groupId}, 이메일: ${email}`);
    
    // 입력값 검증
    if (!groupId || !email) {
      console.error(`[inviteToGroup] 유효하지 않은 입력값: groupId=${groupId}, email=${email}`);
      return { success: false, error: '그룹 ID 또는 이메일이 유효하지 않습니다.' };
    }
    
     // 사용자 찾기
    const usersQuery = query(
      collection(db, 'users'),
      where('email', '==', email)
    );
    
    const usersSnapshot = await getDocs(usersQuery);
    
    if (usersSnapshot.empty) {
      console.log(`[inviteToGroup] 사용자를 찾을 수 없음: ${email}`);
      return { success: false, error: '해당 이메일의 사용자를 찾을 수 없습니다.' };
    }
    
    const userData = usersSnapshot.docs[0].data();
    const userId = usersSnapshot.docs[0].id;
    
    // 차단된 사용자인지 확인
    const isBanned = await isUserBannedFromGroup(groupId, userId, email);
    if (isBanned) {
      return { success: false, error: '이 사용자는 그룹에 초대할 수 없습니다.' };
    }

    // 이미 그룹 멤버인지 확인
    const existingMemberQuery = query(
      collection(db, 'groupMembers'),
      where('groupId', '==', groupId),
      where('email', '==', email)
    );
    
    const existingMemberSnapshot = await getDocs(existingMemberQuery);
    if (!existingMemberSnapshot.empty) {
      console.log(`[inviteToGroup] 이미 멤버로 존재함: ${email}`);
      return { success: false, error: '이미 그룹에 속해 있는 사용자입니다.' };
    }
    

    // 멤버로 추가
    const memberData = {
      groupId,
      userId,
      email, // 이메일도 저장
      role: 'member',
      joinedAt: new Date().toISOString(),
      color: '#4CAF50' // 기본 색상
    };
    
    const docRef = await addDoc(collection(db, 'groupMembers'), memberData);
    console.log(`[inviteToGroup] 멤버 추가 완료. 문서 ID: ${docRef.id}`);
    
    // 그룹의 memberCount 업데이트
    try {
      const groupRef = doc(db, 'groups', groupId);
      const groupDoc = await getDoc(groupRef);
      
      if (groupDoc.exists()) {
        const groupData = groupDoc.data();
        const currentCount = groupData.memberCount || 0;
        
        await updateDoc(groupRef, {
          memberCount: currentCount + 1
        });
        
        console.log(`[inviteToGroup] 그룹 멤버 수 업데이트: ${currentCount} -> ${currentCount + 1}`);
      }
    } catch (updateError) {
      console.warn(`[inviteToGroup] 멤버 수 업데이트 실패:`, updateError);
      // 멤버 수 업데이트 실패해도 초대 자체는 성공으로 처리
    }
    
    return { success: true };
  } catch (error: any) {
    console.error(`[inviteToGroup] 오류:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * 사용자가 속한 그룹 목록 가져오기
 * @param {string} userId - 사용자 ID
 * @returns {Promise<GroupResult>} 그룹 목록
 */
export const getUserGroups = async (userId: string): Promise<GroupResult> => {
  try {
    console.log(`[getUserGroups] 사용자 ID: ${userId}의 그룹 조회 시작`);
    
    // 사용자가 속한 그룹 ID 가져오기
    const membersQuery = query(
      collection(db, 'groupMembers'),
      where('userId', '==', userId)
    );
    
    const membersSnapshot = await getDocs(membersQuery);
    const groups: Group[] = [];
    
    console.log(`[getUserGroups] 사용자가 속한 그룹 멤버십 개수: ${membersSnapshot.size}`);
    
    // 각 그룹의 상세 정보 가져오기
    for (const memberDoc of membersSnapshot.docs) {
      const memberData = memberDoc.data();
      console.log(`[getUserGroups] 멤버십 데이터:`, {
        groupId: memberData.groupId,
        role: memberData.role,
        color: memberData.color
      });
      
      const groupDoc = await getDoc(doc(db, 'groups', memberData.groupId));
      
      if (groupDoc.exists()) {
        const groupData = groupDoc.data();
        
        // 명시적으로 그룹 객체 생성 및 역할 추가
        const group: Group = {
          id: groupDoc.id,
          name: groupData.name || '',
          createdBy: groupData.createdBy || '',
          description: groupData.description || '',
          memberCount: groupData.memberCount || 0,
          createdAt: groupData.createdAt || '',
          role: memberData.role || 'member',
          color: memberData.color || '#4CAF50', // 사용자가 선택한 색상 또는 기본값
        };
        
        console.log(`[getUserGroups] 로드된 그룹:`, {
          id: group.id,
          name: group.name,
          role: group.role,
          color: group.color
        });
        
        groups.push(group);
      } else {
        console.log(`[getUserGroups] 그룹 문서 없음: ${memberData.groupId}`);
      }
    }
    
    return { success: true, groups };
  } catch (error: any) {
    console.error('[getUserGroups] 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 그룹 상세 정보 가져오기
 * @param {string} groupId - 그룹 ID
 * @returns {Promise<GroupResult>} 그룹 정보
 */
export const getGroupById = async (groupId: string): Promise<GroupResult> => {
  try {
    const groupDoc = await getDoc(doc(db, 'groups', groupId));
    
    if (!groupDoc.exists()) {
      return { success: false, error: '그룹을 찾을 수 없습니다.' };
    }
    
    const groupData = groupDoc.data();
    
    return { 
      success: true, 
      group: {
        id: groupDoc.id,
        name: groupData.name || '',
        createdBy: groupData.createdBy || '',
        ...groupData
      } as Group
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

/**
 * 그룹의 멤버 목록 가져오기
 * @param {string} groupId - 그룹 ID
 * @returns {Promise<MemberResult>} 멤버 목록
 */
export const getGroupMembers = async (groupId: string): Promise<MemberResult> => {
  try {
    const membersQuery = query(
      collection(db, 'groupMembers'),
      where('groupId', '==', groupId)
    );
    
    const membersSnapshot = await getDocs(membersQuery);
    const members: GroupMember[] = [];
    
    // 각 멤버의 상세 정보 가져오기
    for (const memberDoc of membersSnapshot.docs) {
      const memberData = memberDoc.data();
      const userDoc = await getDoc(doc(db, 'users', memberData.userId));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        members.push({
          id: memberDoc.id,
          userId: userDoc.id,
          displayName: userData.displayName,
          email: userData.email,
          role: memberData.role,
          joinedAt: memberData.joinedAt,
          groupId,
          color: memberData.color // 색상 정보 포함
        });
      }
    }
    
    return { success: true, members };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

/**
 * 그룹 삭제
 * @param {string} groupId - 그룹 ID
 * @returns {Promise<GroupResult>} 삭제 결과
 */
export const deleteGroup = async (groupId: string): Promise<GroupResult> => {
  try {
    // 그룹 멤버 삭제
    const membersQuery = query(
      collection(db, 'groupMembers'),
      where('groupId', '==', groupId)
    );
    
    const membersSnapshot = await getDocs(membersQuery);
    const deletePromises: Promise<void>[] = [];
    
    membersSnapshot.forEach((doc) => {
      deletePromises.push(deleteDoc(doc.ref));
    });
    
    // 그룹 이벤트 삭제
    const eventsQuery = query(
      collection(db, 'events'),
      where('groupId', '==', groupId)
    );
    
    const eventsSnapshot = await getDocs(eventsQuery);
    
    eventsSnapshot.forEach((doc) => {
      deletePromises.push(deleteDoc(doc.ref));
    });
    
    // 모든 삭제 작업 완료 후 그룹 삭제
    await Promise.all(deletePromises);
    await deleteDoc(doc(db, 'groups', groupId));
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

// services/groupService.ts에 추가
/**
 * 차단된 사용자 목록 가져오기
 */
export const getBannedMembers = async (groupId: string): Promise<{
  success: boolean;
  bannedMembers?: Array<{
    id: string;
    userId: string;
    email: string;
    bannedAt: string;
    bannedBy: string;
  }>;
  error?: string;
}> => {
  try {
    const bannedQuery = query(
      collection(db, 'groupBannedMembers'),
      where('groupId', '==', groupId)
    );
    
    const snapshot = await getDocs(bannedQuery);
    const bannedMembers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];
    
    return { success: true, bannedMembers };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

/**
 * 차단 해제
 */
export const unbanMember = async (
  groupId: string,
  userId: string
): Promise<GroupResult> => {
  try {
    const bannedQuery = query(
      collection(db, 'groupBannedMembers'),
      where('groupId', '==', groupId),
      where('userId', '==', userId)
    );
    
    const snapshot = await getDocs(bannedQuery);
    
    if (snapshot.empty) {
      return { success: false, error: '차단된 사용자를 찾을 수 없습니다.' };
    }
    
    // 차단 기록 삭제
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};
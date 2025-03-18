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
  DocumentData
} from 'firebase/firestore';
import { db } from '../config/firebase';

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
}

interface GroupResult {
  success: boolean;
  group?: Group | PartialGroup; // PartialGroup도 허용하도록 수정
  groups?: (Group | PartialGroup)[]; // 배열 타입도 수정
  error?: string;
  groupId?: string;
}

interface MemberResult {
  success: boolean;
  members?: GroupMember[];
  error?: string;
}

/**
 * 새 그룹 생성
 * @param {Omit<Group, 'id'>} groupData - 그룹 데이터
 * @returns {Promise<GroupResult>} 생성 결과
 */
export const createGroup = async (groupData: Omit<Group, 'id'>): Promise<GroupResult> => {
  try {
    const docRef = await addDoc(collection(db, 'groups'), {
      ...groupData,
      createdAt: new Date().toISOString()
    });
    
    // 그룹 생성자를 첫 번째 멤버로 추가
    await addDoc(collection(db, 'groupMembers'), {
      groupId: docRef.id,
      userId: groupData.createdBy,
      role: 'owner',
      joinedAt: new Date().toISOString()
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
    // 사용자 이메일로 사용자 찾기
    const usersQuery = query(
      collection(db, 'users'),
      where('email', '==', email)
    );
    
    const usersSnapshot = await getDocs(usersQuery);
    
    if (usersSnapshot.empty) {
      return { success: false, error: '해당 이메일의 사용자를 찾을 수 없습니다.' };
    }
    
    const userData = usersSnapshot.docs[0].data();
    const userId = usersSnapshot.docs[0].id;
    
    // 멤버로 추가
    await addDoc(collection(db, 'groupMembers'), {
      groupId,
      userId,
      role: 'member',
      joinedAt: new Date().toISOString()
    });
    
    return { success: true };
  } catch (error: any) {
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
    // 사용자가 속한 그룹 ID 가져오기
    const membersQuery = query(
      collection(db, 'groupMembers'),
      where('userId', '==', userId)
    );
    
    const membersSnapshot = await getDocs(membersQuery);
    const groups: Group[] = [];
    
    // 각 그룹의 상세 정보 가져오기
    for (const memberDoc of membersSnapshot.docs) {
      const memberData = memberDoc.data();
      const groupDoc = await getDoc(doc(db, 'groups', memberData.groupId));
      
      if (groupDoc.exists()) {
        const groupData = groupDoc.data();
        // 타입 단언 사용하여 Group 인터페이스 요구사항 충족
        groups.push({
          id: groupDoc.id,
          name: groupData.name || '',
          createdBy: groupData.createdBy || '',
          ...groupData,
          role: memberData.role
        } as Group);
      }
    }
    
    return { success: true, groups };
  } catch (error: any) {
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
          groupId
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
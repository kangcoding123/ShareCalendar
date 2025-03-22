// services/calendarService.ts
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  getDocs,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { db } from '../config/firebase';

// 타입 정의 단순화 - 모든 필드를 옵션으로 만들기
export interface CalendarEvent {
  id?: string;
  title: string;
  description?: string;
  date: string;
  time?: string;
  userId?: string;
  groupId: string;
  groupName?: string;
  color?: string;
  createdAt?: string;
  updatedAt?: string;
  createdByName?: string | null;  // null 타입 추가
}

// 결과 인터페이스
interface EventResult {
  success: boolean;
  events?: CalendarEvent[];
  error?: string;
  eventId?: string;
}

// 실시간 구독을 관리하기 위한 Map
const eventListeners: Map<string, Unsubscribe> = new Map();

/**
 * 새 이벤트 추가
 * @param eventData - 이벤트 데이터 (id 제외)
 * @returns 추가 결과
 */
export const addEvent = async (eventData: Omit<CalendarEvent, 'id'>): Promise<EventResult> => {
  try {
    console.log('Adding event to Firebase:', eventData);
    
    // 필수 필드 확인
    if (!eventData.title) {
      return { success: false, error: 'title is required' };
    }
    if (!eventData.date) {
      return { success: false, error: 'date is required' };
    }
    if (!eventData.groupId) {
      return { success: false, error: 'groupId is required' };
    }
    
    // id 필드가 있으면 제거
    const { id, ...dataToSave } = eventData as any;
    
    const docRef = await addDoc(collection(db, 'events'), dataToSave);
    
    console.log('Event added with ID:', docRef.id);
    return { success: true, eventId: docRef.id };
  } catch (error: any) {
    console.error('Error adding event:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 이벤트 업데이트
 * @param eventId - 이벤트 ID
 * @param eventData - 이벤트 데이터
 * @returns 업데이트 결과
 */
export const updateEvent = async (eventId: string, eventData: CalendarEvent): Promise<EventResult> => {
  try {
    const eventRef = doc(db, 'events', eventId);
    
    // id 필드 제거
    const { id, ...dataToUpdate } = eventData;
    
    await updateDoc(eventRef, {
      ...dataToUpdate,
      updatedAt: new Date().toISOString()
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

/**
 * 이벤트 삭제
 * @param eventId - 이벤트 ID
 * @returns 삭제 결과
 */
export const deleteEvent = async (eventId: string): Promise<EventResult> => {
  try {
    await deleteDoc(doc(db, 'events', eventId));
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

/**
 * 사용자가 속한 그룹의 모든 이벤트 가져오기
 * @param userId - 사용자 ID
 * @returns 이벤트 목록
 */
export const getUserEvents = async (userId: string): Promise<EventResult> => {
  try {
    // 개인 일정 쿼리
    const personalQuery = query(
      collection(db, 'events'),
      where('userId', '==', userId)
    );
    
    const personalSnapshot = await getDocs(personalQuery);
    const events: CalendarEvent[] = [];
    
    personalSnapshot.forEach((doc) => {
      const data = doc.data();
      // 필수 필드 기본값 제공
      events.push({
        id: doc.id,
        title: data.title || '',
        date: data.date || '',
        groupId: data.groupId || 'personal',
        ...data
      } as CalendarEvent);
    });
    
    // 사용자가 속한 그룹 ID 가져오기
    const membersQuery = query(
      collection(db, 'groupMembers'),
      where('userId', '==', userId)
    );
    
    const membersSnapshot = await getDocs(membersQuery);
    const groupIds: string[] = [];
    const groupColors: Record<string, string> = {}; // 그룹 ID별 색상 저장
    
    membersSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.groupId) {
        groupIds.push(data.groupId);
        // 사용자가 설정한 그룹 색상 저장
        if (data.color) {
          groupColors[data.groupId] = data.color;
        }
      }
    });
    
    console.log(`[getUserEvents] 사용자(${userId})가 속한 그룹 IDs:`, groupIds);
    console.log(`[getUserEvents] 사용자의 그룹 색상:`, groupColors);
    
    // 각 그룹의 일정 가져오기
    if (groupIds.length > 0) {
      for (const groupId of groupIds) {
        // 그룹 일정 쿼리 - groupId가 정확히 일치하는 이벤트만 가져옴
        const groupEventsQuery = query(
          collection(db, 'events'),
          where('groupId', '==', groupId)
        );
        
        const groupEventsSnapshot = await getDocs(groupEventsQuery);
        console.log(`[getUserEvents] 그룹(${groupId}) 일정 개수: ${groupEventsSnapshot.size}`);
        
        groupEventsSnapshot.forEach((doc) => {
          const data = doc.data();
          
          // 이미 동일한 ID의 이벤트가 있는지 확인 (중복 방지)
          if (!events.some(e => e.id === doc.id)) {
            // 그룹 색상 업데이트 - 사용자가 설정한 색상이 있으면 사용
            const color = groupColors[groupId] || data.color || '#4CAF50';
            
            events.push({
              id: doc.id,
              title: data.title || '',
              date: data.date || '',
              groupId: data.groupId || 'personal',
              ...data,
              color // 사용자가 설정한 그룹 색상으로 업데이트
            } as CalendarEvent);
          }
        });
      }
    }
    
    console.log(`[getUserEvents] 총 불러온 일정 개수: ${events.length}`);
    return { success: true, events };
  } catch (error: any) {
    console.error('이벤트 가져오기 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 실시간으로 사용자 이벤트 구독
 * @param userId - 사용자 ID
 * @param callback - 이벤트 목록이 변경될 때마다 호출될 콜백 함수
 * @returns 구독 해제 함수
 */
export const subscribeToUserEvents = (
  userId: string, 
  callback: (events: CalendarEvent[]) => void
): (() => void) => {
  // 기존 구독이 있으면 해제
  if (eventListeners.has(userId)) {
    eventListeners.get(userId)!();
    eventListeners.delete(userId);
  }
  
  console.log(`[subscribeToUserEvents] 사용자 ID: ${userId}에 대한 이벤트 구독 시작`);
  
  // 개인 이벤트에 대한 구독
  const personalQuery = query(
    collection(db, 'events'),
    where('userId', '==', userId)
  );
  
  // 개인 이벤트 리스너
  const personalUnsubscribe = onSnapshot(personalQuery, async (snapshot) => {
    console.log(`[subscribeToUserEvents] 개인 이벤트 변경 감지`);
    
    // 다시 전체 이벤트 로드
    try {
      const result = await getUserEvents(userId);
      if (result.success && result.events) {
        callback(result.events);
      }
    } catch (error) {
      console.error('[subscribeToUserEvents] 이벤트 로드 오류:', error);
    }
  }, (error) => {
    console.error('[subscribeToUserEvents] 리스너 오류:', error);
  });
  
  // 사용자가 속한 그룹 ID 가져오기
  getUserGroupIds(userId).then((groupIds) => {
    console.log(`[subscribeToUserEvents] 사용자가 속한 그룹 IDs:`, groupIds);
    
    if (groupIds.length > 0) {
      // 각 그룹의 이벤트에 대한 구독 설정
      groupIds.forEach(groupId => {
        const groupEventQuery = query(
          collection(db, 'events'),
          where('groupId', '==', groupId)
        );
        
        // 그룹 이벤트 리스너
        const groupUnsubscribe = onSnapshot(groupEventQuery, async (snapshot) => {
          console.log(`[subscribeToUserEvents] 그룹 ${groupId} 이벤트 변경 감지`);
          
          // 다시 전체 이벤트 로드
          try {
            const result = await getUserEvents(userId);
            if (result.success && result.events) {
              callback(result.events);
            }
          } catch (error) {
            console.error('[subscribeToUserEvents] 이벤트 로드 오류:', error);
          }
        });
        
        // 기존 구독 해제 함수에 추가
        const existingUnsubscribe = eventListeners.get(userId);
        if (existingUnsubscribe) {
          eventListeners.set(userId, () => {
            existingUnsubscribe();
            groupUnsubscribe();
          });
        } else {
          eventListeners.set(userId, () => {
            personalUnsubscribe();
            groupUnsubscribe();
          });
        }
      });
    }
  });
  
  // 초기에는 개인 이벤트 리스너만 등록
  eventListeners.set(userId, personalUnsubscribe);
  
  // 그룹 멤버십 변경을 구독하여 색상 변경 시 이벤트 업데이트
  subscribeToGroupMembership(userId, async () => {
    console.log(`[subscribeToUserEvents] 그룹 멤버십 변경 감지`);
    try {
      const result = await getUserEvents(userId);
      if (result.success && result.events) {
        callback(result.events);
      }
    } catch (error) {
      console.error('[subscribeToUserEvents] 이벤트 로드 오류:', error);
    }
  });
  
  // 구독 해제 함수 반환
  return () => {
    if (eventListeners.has(userId)) {
      console.log(`[subscribeToUserEvents] 사용자 ID: ${userId}에 대한 구독 해제`);
      eventListeners.get(userId)!();
      eventListeners.delete(userId);
    }
  };
};

/**
 * 그룹 멤버십 변경 구독
 * @param userId - 사용자 ID 
 * @param callback - 변경 시 호출될 콜백
 */
function subscribeToGroupMembership(userId: string, callback: () => void) {
  const membershipQuery = query(
    collection(db, 'groupMembers'),
    where('userId', '==', userId)
  );
  
  // 변경사항 모니터링
  return onSnapshot(membershipQuery, callback, (error) => {
    console.error('[subscribeToGroupMembership] 오류:', error);
  });
}

/**
 * 사용자가 속한 그룹 ID 목록 가져오기
 * @param userId - 사용자 ID
 * @returns 그룹 ID 목록
 */
async function getUserGroupIds(userId: string): Promise<string[]> {
  try {
    const membersQuery = query(
      collection(db, 'groupMembers'),
      where('userId', '==', userId)
    );
    
    const snapshot = await getDocs(membersQuery);
    const groupIds: string[] = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.groupId) {
        groupIds.push(data.groupId);
      }
    });
    
    return groupIds;
  } catch (error) {
    console.error('그룹 ID 가져오기 오류:', error);
    return [];
  }
}
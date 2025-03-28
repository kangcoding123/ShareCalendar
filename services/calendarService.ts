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

// 전역 이벤트 관리 상태
const globalEventState = {
  events: [] as CalendarEvent[],
  callbacks: new Set<(events: CalendarEvent[]) => void>(),
  subscription: null as Unsubscribe | null,
  lastUserId: null as string | null,
};

/**
 * 중앙 이벤트 구독 시스템
 * @param userId 사용자 ID
 * @param callback 이벤트 업데이트 콜백
 * @returns 구독 해제 함수
 */
export const subscribeToEvents = (
  userId: string, 
  callback: (events: CalendarEvent[]) => void
): (() => void) => {
  // 사용자 ID가 변경되었거나 구독이 없으면
  if (userId !== globalEventState.lastUserId || !globalEventState.subscription) {
    // 기존 구독 해제
    if (globalEventState.subscription) {
      console.log(`[GlobalEvents] 사용자 변경으로 구독 재설정 (${globalEventState.lastUserId} -> ${userId})`);
      globalEventState.subscription();
      globalEventState.subscription = null;
    }
    
    globalEventState.lastUserId = userId;
    
    // Firebase Firestore 구독 설정
    const eventsQuery = collection(db, 'events');
    const eventsUnsubscribe = onSnapshot(
      eventsQuery,
      async () => {
        if (!globalEventState.lastUserId) return;
        
        console.log(`[GlobalEvents] Firestore 이벤트 변경 감지`);
        const result = await getUserEvents(globalEventState.lastUserId);
        
        if (result.success && Array.isArray(result.events)) {
          globalEventState.events = result.events;
          
          // 등록된 모든 콜백에 새 이벤트 전달
          globalEventState.callbacks.forEach(cb => {
            try {
              cb(globalEventState.events);
            } catch (error) {
              console.error('[GlobalEvents] 콜백 실행 오류:', error);
            }
          });
        }
      },
      (error) => {
        console.error('[GlobalEvents] Firestore 구독 오류:', error);
      }
    );
    
    // 멤버십 변경 구독
    const membershipQuery = query(
      collection(db, 'groupMembers'),
      where('userId', '==', userId)
    );
    
    const membershipUnsubscribe = onSnapshot(
      membershipQuery,
      async () => {
        if (!globalEventState.lastUserId) return;
        
        console.log(`[GlobalEvents] 그룹 멤버십 변경 감지`);
        const result = await getUserEvents(globalEventState.lastUserId);
        
        if (result.success && Array.isArray(result.events)) {
          globalEventState.events = result.events;
          globalEventState.callbacks.forEach(cb => {
            try {
              cb(globalEventState.events);
            } catch (error) {
              console.error('[GlobalEvents] 콜백 실행 오류:', error);
            }
          });
        }
      },
      (error) => {
        console.error('[GlobalEvents] 멤버십 구독 오류:', error);
      }
    );
    
    // 구독 해제 함수 저장
    globalEventState.subscription = () => {
      eventsUnsubscribe();
      membershipUnsubscribe();
    };
  }
  
  // 콜백 등록
  globalEventState.callbacks.add(callback);
  
  // 이미 데이터가 있으면 즉시 콜백 실행
  if (globalEventState.events.length > 0) {
    setTimeout(() => callback(globalEventState.events), 0);
  }
  
  // 구독 해제 함수 반환
  return () => {
    globalEventState.callbacks.delete(callback);
    
    // 마지막 콜백이 제거되면 구독도 해제
    if (globalEventState.callbacks.size === 0 && globalEventState.subscription) {
      console.log(`[GlobalEvents] 마지막 콜백 제거로 구독 해제`);
      globalEventState.subscription();
      globalEventState.subscription = null;
      globalEventState.lastUserId = null;
    }
  };
};

// 실시간 구독을 관리하기 위한 Map (이전 코드 유지, 하위 호환성 위해)
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
    const events: CalendarEvent[] = [];
    
    // 사용자가 속한 그룹 ID와 색상 먼저 가져오기
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
    
    // 모든 이벤트 ID를 저장할 맵 (중복 방지용)
    const eventMap: Record<string, CalendarEvent> = {};
    
    // 1. 그룹 이벤트 먼저 가져오기
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
          const eventId = doc.id;
          
          // 그룹 색상 적용 - 사용자별 설정 색상 사용
          const color = groupColors[groupId] || data.color || '#4CAF50';
          
          eventMap[eventId] = {
            id: eventId,
            title: data.title || '',
            date: data.date || '',
            groupId: data.groupId || 'personal',
            ...data,
            color // 사용자가 설정한 그룹 색상으로 덮어쓰기
          } as CalendarEvent;
        });
      }
    }
    
    // 2. 개인 일정 가져오기
    const personalQuery = query(
      collection(db, 'events'),
      where('userId', '==', userId),
      where('groupId', '==', 'personal')
    );
    
    const personalSnapshot = await getDocs(personalQuery);
    
    personalSnapshot.forEach((doc) => {
      const data = doc.data();
      const eventId = doc.id;
      
      // 개인 일정은 그룹 일정과 중복되지 않음
      if (!eventMap[eventId]) {
        eventMap[eventId] = {
          id: eventId,
          title: data.title || '',
          date: data.date || '',
          groupId: data.groupId || 'personal',
          ...data
        } as CalendarEvent;
      }
    });
    
    // 맵에서 이벤트 배열로 변환
    const allEvents = Object.values(eventMap);
    
    console.log(`[getUserEvents] 총 불러온 일정 개수: ${allEvents.length}`);
    return { success: true, events: allEvents };
  } catch (error: any) {
    console.error('이벤트 가져오기 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 실시간으로 사용자 이벤트 구독 (이제 중앙 구독 시스템 사용)
 * @param userId - 사용자 ID
 * @param callback - 이벤트 목록이 변경될 때마다 호출될 콜백 함수
 * @returns 구독 해제 함수
 */
export const subscribeToUserEvents = (
  userId: string, 
  callback: (events: CalendarEvent[]) => void
): (() => void) => {
  console.log(`[subscribeToUserEvents] 사용자 ID: ${userId}에 대한 이벤트 구독 시작`);
  
  // 이전 코드 호환성을 위해 eventListeners 맵에도 등록
  // 다만 실제로는 중앙 구독 시스템이 처리
  const unsubscribe = subscribeToEvents(userId, callback);
  eventListeners.set(userId, () => unsubscribe());
  
  return () => {
    console.log('이벤트 구독 해제');
    if (eventListeners.has(userId)) {
      eventListeners.delete(userId);
    }
    unsubscribe();
  };
};

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
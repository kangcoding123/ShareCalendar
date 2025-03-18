// services/calendarService.ts
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  getDocs 
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
    // 개인 이벤트 쿼리
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
    
    // 그룹 이벤트도 가져오기
    // 사용자가 속한 그룹 ID 가져오기
    const membersQuery = query(
      collection(db, 'groupMembers'),
      where('userId', '==', userId)
    );
    
    const membersSnapshot = await getDocs(membersQuery);
    const groupIds: string[] = [];
    
    membersSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.groupId) {
        groupIds.push(data.groupId);
      }
    });
    
    // 각 그룹의 일정 가져오기
    if (groupIds.length > 0) {
      for (const groupId of groupIds) {
        // 그룹 일정 쿼리
        const groupEventsQuery = query(
          collection(db, 'events'),
          where('groupId', '==', groupId)
        );
        
        const groupEventsSnapshot = await getDocs(groupEventsQuery);
        
        groupEventsSnapshot.forEach((doc) => {
          const data = doc.data();
          
          // 이미 동일한 ID의 이벤트가 있는지 확인 (중복 방지)
          if (!events.some(e => e.id === doc.id)) {
            events.push({
              id: doc.id,
              title: data.title || '',
              date: data.date || '',
              groupId: data.groupId || 'personal',
              ...data
            } as CalendarEvent);
          }
        });
      }
    }
    
    return { success: true, events };
  } catch (error: any) {
    console.error('이벤트 가져오기 오류:', error);
    return { success: false, error: error.message };
  }
};
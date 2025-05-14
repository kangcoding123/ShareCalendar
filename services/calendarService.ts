// services/calendarService.ts (다일 일정 지원 버전)
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
  Unsubscribe,
  getDoc
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { sendGroupNotification } from './notificationService';
import { getDatesBetween } from '../utils/dateUtils';

// 타입 정의 수정 - 다일 일정 지원을 위한 필드 추가
export interface CalendarEvent {
  id?: string;
  title: string;
  description?: string | null;
  // 다일 일정을 위한 변경
  startDate: string;           // 시작일 (YYYY-MM-DD 형식)
  endDate: string;             // 종료일 (YYYY-MM-DD 형식)
  isMultiDay?: boolean;        // 다일 일정 여부
  // 기존 필드는 그대로 유지
  time?: string | null;
  userId?: string;
  groupId: string;
  groupName?: string | null;
  color?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdByName?: string | null;
  // 알림 관련 필드
  notificationEnabled?: boolean | null;
  notificationMinutesBefore?: number | null;
  notificationId?: string | null;
  // 다중 그룹 지원 필드
  targetGroupIds?: string[];    // 이벤트가 공유된 모든 그룹 ID
  isSharedEvent?: boolean;      // 여러 그룹에 공유된 이벤트인지 여부
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

// 최근 제출 이벤트 캐시 (메모리 캐시)
const recentSubmissions = new Map<string, number>();

// 모든 이벤트 구독 해제 함수 추가
export const clearEventSubscriptions = () => {
  console.log('[GlobalEvents] 모든 이벤트 구독 및 상태 초기화 시작');
  
  // globalEventState 초기화
  if (globalEventState.subscription) {
    globalEventState.subscription();
    globalEventState.subscription = null;
  }
  
  globalEventState.events = [];
  globalEventState.lastUserId = null;
  globalEventState.callbacks.clear();
  
  // 기존 eventListeners도 모두 해제
  eventListeners.forEach(unsubscribe => {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  });
  eventListeners.clear();
  
  // recentSubmissions 캐시 초기화
  recentSubmissions.clear();
  
  console.log('[GlobalEvents] 모든 이벤트 구독 및 상태 초기화 완료');
};

// 중복 이벤트 제출 감지 함수
function isDuplicateSubmission(eventData: any): boolean {
  // 필수 필드가 없으면 중복 체크 수행하지 않음
  if (!eventData.userId || !eventData.groupId || !eventData.title || !eventData.startDate) {
    return false;
  }
  
  // 이벤트 데이터의 핵심 필드로 고유 키 생성
  const key = `${eventData.userId}-${eventData.groupId}-${eventData.title}-${eventData.startDate}`;
  const now = Date.now();
  
  // 최근 3초 이내 동일 키 제출 확인
  if (recentSubmissions.has(key)) {
    const lastSubmitTime = recentSubmissions.get(key) || 0;
    if (now - lastSubmitTime < 3000) { // 3초 이내
      console.log('중복 이벤트 감지, 제출 취소됨:', key);
      return true;
    }
  }
  
  // 키 저장 및 오래된 항목 제거
  recentSubmissions.set(key, now);
  
  // 맵 크기 제한 (메모리 사용량 관리)
  if (recentSubmissions.size > 100) {
    const oldestKey = recentSubmissions.keys().next().value;
    // undefined 체크 추가
    if (oldestKey !== undefined) {
      recentSubmissions.delete(oldestKey);
    }
  }
  
  return false;
}

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
 * undefined 값을 필터링하여 Firestore에 저장 가능한 객체로 변환
 * @param data 필터링할 객체
 * @returns undefined 값이 제거된 객체
 */
function removeUndefinedValues(data: Record<string, any>): Record<string, any> {
  return Object.entries(data).reduce((acc, [key, value]) => {
    // undefined가 아닌 값만 포함 (null은 Firestore에서 허용됨)
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, any>);
}

// 알림 전송을 별도 비동기 함수로 분리
async function sendEventNotificationsAsync(eventId: string, eventData: any) {
  try {
    // 필수 필드 확인
    if (!eventData.groupId || !eventData.title) {
      console.log('알림 전송에 필요한 필드가 없습니다:', { 
        groupId: eventData.groupId, 
        title: eventData.title 
      });
      return;
    }
    
    // 그룹 정보 가져오기
    const groupDoc = await getDoc(doc(db, 'groups', eventData.groupId));
    if (groupDoc.exists()) {
      const groupName = groupDoc.data().name || '그룹';
      
      // 작성자 정보 가져오기
      let creatorName = "회원";
      if (eventData.userId) {
        try {
          const userDoc = await getDoc(doc(db, 'users', eventData.userId));
          if (userDoc.exists()) {
            creatorName = userDoc.data().displayName || creatorName;
          }
        } catch (error) {
          console.error('사용자 정보 가져오기 오류:', error);
        }
      }
      
      // 알림 메시지 구성
      let notificationTitle = `새 일정: ${eventData.title}`;
      let notificationBody = `${creatorName}님이 ${groupName} 그룹에 새 일정을 추가했습니다.`;
      
      // 다일 일정인 경우 메시지에 표시
      if (eventData.isMultiDay && eventData.startDate && eventData.endDate) {
        notificationBody += ` (${eventData.startDate} ~ ${eventData.endDate})`;
      }
      
      // 다중 그룹 공유 메시지 추가
      if (eventData.isSharedEvent && eventData.targetGroupIds && eventData.targetGroupIds.length > 1) {
        notificationBody += ` (${eventData.targetGroupIds.length}개 그룹에 공유됨)`;
      }
      
      // 알림 전송
      await sendGroupNotification(
        eventData.groupId,
        notificationTitle,
        notificationBody,
        { 
          type: 'new_event',
          eventId: eventId,
          groupId: eventData.groupId,
          date: eventData.startDate || ''
        },
        eventData.userId // 작성자는 알림에서 제외
      );
      
      console.log('그룹 멤버들에게 새 일정 알림 전송 완료');
    }
  } catch (error) {
    console.error('알림 전송 중 오류:', error);
    // 알림 전송 실패해도 이벤트 추가는 성공한 것으로 간주
  }
}

/**
 * 새 이벤트 추가
 * @param eventData - 이벤트 데이터 (id 제외)
 * @returns 추가 결과
 */
export const addEvent = async (eventData: Omit<CalendarEvent, 'id'>): Promise<EventResult> => {
  try {
    console.log('Adding event to Firebase:', eventData);
    
    // 필수 필드 확인 및 기본값 설정
    const safeData = {
      ...eventData,
      title: eventData.title || '제목 없음',
      startDate: eventData.startDate || new Date().toISOString().split('T')[0],
      groupId: eventData.groupId || 'personal'
    };
    
    // 중복 제출 감지
    if (isDuplicateSubmission(safeData)) {
      return { success: false, error: 'DUPLICATE_SUBMISSION' };
    }
    
    // 다일 일정 확인 및 endDate 설정
    if (!safeData.endDate) {
      safeData.endDate = safeData.startDate;
      safeData.isMultiDay = false;
    }
    
    // 종료일이 시작일보다 빠른 경우 시작일로 설정
    if (new Date(safeData.endDate) < new Date(safeData.startDate)) {
      safeData.endDate = safeData.startDate;
      safeData.isMultiDay = false;
    }
    
    // 다일 일정 여부 설정
    if (safeData.startDate !== safeData.endDate) {
      safeData.isMultiDay = true;
    }
    
    
    // id 필드가 있으면 제거
    const { id, ...dataWithoutId } = safeData as any;
    
    // undefined 값 제거 (Firestore에서 오류 방지)
    const cleanData = removeUndefinedValues(dataWithoutId);
    
    // 알림 관련 필드가 undefined인 경우 명시적으로 null로 설정
    if (!cleanData.notificationEnabled) {
      cleanData.notificationMinutesBefore = null;
      cleanData.notificationId = null;
    } else if (cleanData.notificationEnabled && !cleanData.notificationId) {
      // 알림은 활성화되었지만 ID가 없는 경우
      cleanData.notificationId = null;
    }
    
    // 작성자 이름이 없는 경우 현재 사용자의 이름으로 설정 (저장 전에 실행)
    if (!cleanData.createdByName && auth.currentUser) {
      cleanData.createdByName = auth.currentUser.displayName || '사용자';
    }
    
    // Firestore에 저장
    const docRef = await addDoc(collection(db, 'events'), cleanData);
    console.log('Event added with ID:', docRef.id);
    
    // 그룹 일정인 경우 알림 처리를 비동기로 실행
    if (safeData.groupId && safeData.groupId !== 'personal') {
      // 알림 전송을 별도 비동기 함수로 실행하고 기다리지 않음
      sendEventNotificationsAsync(docRef.id, safeData);
    }
    
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
    
    // 이전 이벤트 데이터 가져오기 (변경 내용 알림용)
    const eventDoc = await getDoc(eventRef);
    const oldEventData = eventDoc.exists() ? eventDoc.data() : null;
    
    // 다일 일정 처리
    if (!eventData.endDate) {
      eventData.endDate = eventData.startDate;
      eventData.isMultiDay = false;
    }
    
    // 종료일이 시작일보다 빠른 경우 시작일로 설정
    if (new Date(eventData.endDate) < new Date(eventData.startDate)) {
      eventData.endDate = eventData.startDate;
      eventData.isMultiDay = false;
    }
    
    // 다일 일정 여부 설정
    if (eventData.startDate !== eventData.endDate) {
      eventData.isMultiDay = true;
    } else {
      eventData.isMultiDay = false;
    }
    
    // id 필드 제거
    const { id, ...dataToUpdate } = eventData;
    
    // undefined 값 제거 (Firestore에서 오류 방지)
    const cleanData = removeUndefinedValues(dataToUpdate);
    
    // 알림 관련 필드 처리
    if (!cleanData.notificationEnabled) {
      cleanData.notificationMinutesBefore = null;
      cleanData.notificationId = null;
    }
    
    // 업데이트 시간 추가
    cleanData.updatedAt = new Date().toISOString();
    
    await updateDoc(eventRef, cleanData);
    
    // 그룹 일정인 경우 멤버들에게 알림 전송 (비동기 처리)
    if (eventData.groupId && eventData.groupId !== 'personal') {
      // 비동기로 알림 처리를 위한 함수
      (async () => {
        try {
          // 그룹 정보 가져오기
          const groupDoc = await getDoc(doc(db, 'groups', eventData.groupId));
          if (groupDoc.exists()) {
            const groupName = groupDoc.data().name || '그룹';
            
            // 수정: 작성자 정보 가져오기 개선
            let updaterName = "회원";
            if (eventData.userId) {
              try {
                const userDoc = await getDoc(doc(db, 'users', eventData.userId));
                if (userDoc.exists()) {
                  updaterName = userDoc.data().displayName || "회원";
                }
              } catch (error) {
                console.error('사용자 정보 가져오기 오류:', error);
              }
            } else if (eventData.createdByName) {
              updaterName = eventData.createdByName;
            }
            
            // 변경된 내용 확인
            let changeDescription = "";
            if (oldEventData) {
              if (eventData.title !== oldEventData.title) {
                changeDescription = "제목이 변경되었습니다.";
              } else if (eventData.startDate !== oldEventData.startDate || eventData.endDate !== oldEventData.endDate) {
                // 다일 일정 변경 설명 개선
                if (eventData.isMultiDay) {
                  changeDescription = `기간이 변경되었습니다. (${eventData.startDate} ~ ${eventData.endDate})`;
                } else {
                  changeDescription = `날짜가 변경되었습니다. (${eventData.startDate})`;
                }
              } else if (eventData.time !== oldEventData.time) {
                changeDescription = "시간이 변경되었습니다.";
              } else if (eventData.description !== oldEventData.description) {
                changeDescription = "내용이 변경되었습니다.";
              } else {
                changeDescription = "일정이 수정되었습니다.";
              }
            }
            
            // 다중 그룹 정보 표시
            let groupInfo = "";
            if (eventData.isSharedEvent && eventData.targetGroupIds && eventData.targetGroupIds.length > 1) {
              groupInfo = ` (${eventData.targetGroupIds.length}개 그룹에 공유됨)`;
            }
            
            // 알림 전송
            await sendGroupNotification(
              eventData.groupId,
              `일정 수정: ${eventData.title}`,
              `${updaterName}님이 ${groupName} 그룹의 일정을 수정했습니다.${groupInfo} ${changeDescription}`,
              { 
                type: 'update_event',
                eventId: eventId,
                groupId: eventData.groupId,
                date: eventData.startDate || ''
              },
              eventData.userId // 수정한 사용자는 알림에서 제외
            );
          }
        } catch (error) {
          console.error('알림 전송 중 오류:', error);
          // 알림 실패해도 이벤트 업데이트는 성공으로 간주
        }
      })();
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('Event update error:', error);
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
    // 삭제 전 이벤트 데이터 가져오기
    const eventRef = doc(db, 'events', eventId);
    const eventDoc = await getDoc(eventRef);
    const eventData = eventDoc.exists() ? eventDoc.data() as CalendarEvent : null;
    
    // 삭제 실행
    await deleteDoc(eventRef);
    
    // 그룹 일정인 경우 멤버들에게 알림 전송 (비동기 처리)
    if (eventData && eventData.groupId && eventData.groupId !== 'personal') {
      // 비동기로 알림 처리
      (async () => {
        try {
          // 그룹 정보 가져오기
          const groupDoc = await getDoc(doc(db, 'groups', eventData.groupId));
          if (groupDoc.exists()) {
            const groupName = groupDoc.data().name || '그룹';
            
            // 삭제자 정보 가져오기
            let deleterName = "회원";
            if (eventData.userId) {
              try {
                const userDoc = await getDoc(doc(db, 'users', eventData.userId));
                if (userDoc.exists()) {
                  deleterName = userDoc.data().displayName || "회원";
                }
              } catch (error) {
                console.error('사용자 정보 가져오기 오류:', error);
              }
            } else if (eventData.createdByName) {
              deleterName = eventData.createdByName;
            }
            
            // 다일 일정 정보 추가
            let dateInfo = '';
            if (eventData.isMultiDay) {
              dateInfo = ` (${eventData.startDate} ~ ${eventData.endDate})`;
            }
            
            // 알림 전송
            await sendGroupNotification(
              eventData.groupId,
              `일정 삭제: ${eventData.title}`,
              `${deleterName}님이 ${groupName} 그룹의 일정을 삭제했습니다.${dateInfo}`,
              { 
                type: 'delete_event',
                groupId: eventData.groupId,
                date: eventData.startDate || ''
              },
              eventData.userId // 삭제한 사용자는 알림에서 제외
            );
          }
        } catch (error) {
          console.error('알림 전송 중 오류:', error);
          // 알림 실패해도 이벤트 삭제는 성공으로 간주
        }
      })();
    }
    
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
          
          // 다일 일정 데이터 검증 및 수정
          let startDate = data.startDate || data.date || '';  // 이전 버전 호환성 (date 필드)
          let endDate = data.endDate || startDate;
          let isMultiDay = data.isMultiDay || startDate !== endDate;
          
          // 잘못된 날짜 데이터 수정
          if (!startDate) startDate = endDate;
          if (!endDate) endDate = startDate;
          if (new Date(endDate) < new Date(startDate)) endDate = startDate;
          
          eventMap[eventId] = {
            id: eventId,
            title: data.title || '',
            startDate,
            endDate,
            isMultiDay,
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
        // 다일 일정 데이터 검증 및 수정
        let startDate = data.startDate || data.date || '';  // 이전 버전 호환성 (date 필드)
        let endDate = data.endDate || startDate;
        let isMultiDay = data.isMultiDay || startDate !== endDate;
        
        // 잘못된 날짜 데이터 수정
        if (!startDate) startDate = endDate;
        if (!endDate) endDate = startDate;
        if (new Date(endDate) < new Date(startDate)) endDate = startDate;
        
        eventMap[eventId] = {
          id: eventId,
          title: data.title || '',
          startDate,
          endDate,
          isMultiDay,
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
  
  // 안전장치: 10초 후에도 이벤트가 업데이트되지 않으면 빈 배열로 콜백 호출
  const timeoutId = setTimeout(() => {
    console.log('[subscribeToUserEvents] 타임아웃 발생 - 빈 이벤트 배열로 콜백 호출');
    callback([]);
  }, 3000);
  
  // 이전 코드 호환성을 위해 eventListeners 맵에도 등록
  // 다만 실제로는 중앙 구독 시스템이 처리
  const unsubscribe = subscribeToEvents(userId, (events) => {
    // 타임아웃 취소
    clearTimeout(timeoutId);
    callback(events);
  });
  
  eventListeners.set(userId, () => {
    clearTimeout(timeoutId); // 구독 해제 시 타임아웃도 취소
    unsubscribe();
  });
  
  return () => {
    console.log('이벤트 구독 해제');
    clearTimeout(timeoutId);
    if (eventListeners.has(userId)) {
      eventListeners.delete(userId);
    }
    unsubscribe();
  };
};

/**
 * 다일 일정에 대한 각 날짜별 이벤트 데이터 생성
 * @param event 원본 이벤트
 * @returns 날짜별 이벤트 배열
 */
export const expandMultiDayEvent = (event: CalendarEvent): Record<string, CalendarEvent> => {
  const result: Record<string, CalendarEvent> = {};
  
  if (!event.isMultiDay || !event.startDate || !event.endDate || event.startDate === event.endDate) {
    // 단일 일정은 그대로 반환
    result[event.startDate] = { ...event };
    return result;
  }
  
  // 시작일과 종료일 사이의 모든 날짜 가져오기
  const dates = getDatesBetween(event.startDate, event.endDate);
  
  // 각 날짜에 대해 이벤트 복사본 생성
  dates.forEach((date, index) => {
    const position = 
      index === 0 ? 'start' : 
      index === dates.length - 1 ? 'end' : 'middle';
    
    result[date] = {
      ...event,
      // 각 날짜별 위치 정보 추가
      multiDayPosition: position
    } as CalendarEvent;
  });
  
  return result;
};
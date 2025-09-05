// services/calendarService.ts (최적화 버전)
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
import { cacheService } from './cacheService';
import { Platform } from 'react-native';

// 타입 정의 - 다일 일정 지원
export interface CalendarEvent {
  id?: string;
  title: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  isMultiDay?: boolean;
  time?: string | null;
  userId?: string;
  groupId: string;
  groupName?: string | null;
  color?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdByName?: string | null;
  notificationEnabled?: boolean | null;
  notificationMinutesBefore?: number | null;
  notificationId?: string | null;
  targetGroupIds?: string[];
  isSharedEvent?: boolean;
  isOfflineCreated?: boolean;
  offlineId?: string;
}

interface EventResult {
  success: boolean;
  events?: CalendarEvent[];
  error?: string;
  eventId?: string;
  isFromCache?: boolean;
}

// 전역 이벤트 관리 상태
const globalEventState = {
  events: [] as CalendarEvent[],
  callbacks: new Set<(events: CalendarEvent[]) => void>(),
  subscription: null as Unsubscribe | null,
  lastUserId: null as string | null,
  groupColors: new Map<string, string>(),
};

// 메모리 캐시 추가
const eventCache = new Map<string, {
  data: EventResult;
  timestamp: number;
}>();

const CACHE_DURATION = 5 * 60 * 1000; // 5분

// 캐시 관리 함수들
const clearMonthCache = (userId: string, year: number, month: number) => {
  const monthKey = `user_${userId}_${year}_${month}`;
  eventCache.delete(monthKey);
  console.log(`[Cache] ${year}년 ${month + 1}월 캐시 삭제됨`);
};

const clearUserCache = (userId: string) => {
  const keysToDelete: string[] = [];
  eventCache.forEach((_, key) => {
    if (key.includes(`user_${userId}`)) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => eventCache.delete(key));
};

const clearAllCache = () => {
  eventCache.clear();
  globalEventState.groupColors.clear();
  console.log('[Cache] 모든 캐시가 삭제되었습니다');
};

// 최근 제출 이벤트 캐시
const recentSubmissions = new Map<string, number>();

// 모든 이벤트 구독 해제 함수
export const clearEventSubscriptions = () => {
  console.log('[GlobalEvents] 모든 이벤트 구독 및 상태 초기화 시작');
  
  if (globalEventState.subscription) {
    globalEventState.subscription();
    globalEventState.subscription = null;
  }
  
  globalEventState.events = [];
  globalEventState.lastUserId = null;
  globalEventState.callbacks.clear();
  globalEventState.groupColors.clear();
  
  eventListeners.forEach(unsubscribe => {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  });
  eventListeners.clear();
  
  recentSubmissions.clear();
  clearAllCache();
  
  console.log('[GlobalEvents] 모든 이벤트 구독 및 상태 초기화 완료');
};

// 그룹 색상 업데이트 함수
export const updateGroupColorInMemory = (groupId: string, newColor: string) => {
  console.log(`[updateGroupColorInMemory] 그룹 ${groupId} 색상을 ${newColor}로 변경`);
  
  globalEventState.groupColors.set(groupId, newColor);
  
  globalEventState.events = globalEventState.events.map(event => {
    if (event.groupId === groupId) {
      return { ...event, color: newColor };
    }
    return event;
  });
  
  globalEventState.callbacks.forEach(cb => {
    try {
      cb(globalEventState.events);
    } catch (error) {
      console.error('[updateGroupColorInMemory] 콜백 실행 오류:', error);
    }
  });
};

// 중복 이벤트 제출 감지 함수
function isDuplicateSubmission(eventData: any): boolean {
  if (!eventData.userId || !eventData.groupId || !eventData.title || !eventData.startDate) {
    return false;
  }
  
  const key = `${eventData.userId}-${eventData.groupId}-${eventData.title}-${eventData.startDate}`;
  const now = Date.now();
  
  if (recentSubmissions.has(key)) {
    const lastSubmitTime = recentSubmissions.get(key) || 0;
    if (now - lastSubmitTime < 3000) {
      console.log('중복 이벤트 감지, 제출 취소됨:', key);
      return true;
    }
  }
  
  recentSubmissions.set(key, now);
  
  if (recentSubmissions.size > 100) {
    const oldestKey = recentSubmissions.keys().next().value;
    if (oldestKey !== undefined) {
      recentSubmissions.delete(oldestKey);
    }
  }
  
  return false;
}

/**
 * 중앙 이벤트 구독 시스템
 */
export const subscribeToEvents = (
  userId: string, 
  callback: (events: CalendarEvent[]) => void
): (() => void) => {
  if (!cacheService.getIsOnline()) {
    console.log('[GlobalEvents] 오프라인 모드 - 캐시에서 데이터 로드');
    cacheService.loadEventsFromCache(userId).then(cachedEvents => {
      callback(cachedEvents);
    });
  }

  if (userId !== globalEventState.lastUserId || !globalEventState.subscription) {
    if (globalEventState.subscription) {
      console.log(`[GlobalEvents] 사용자 변경으로 구독 재설정 (${globalEventState.lastUserId} -> ${userId})`);
      globalEventState.subscription();
      globalEventState.subscription = null;
    }
    
    globalEventState.lastUserId = userId;
    
    loadUserGroupColors(userId);
    
    const eventsQuery = collection(db, 'events');
    const eventsUnsubscribe = onSnapshot(
      eventsQuery,
      async (snapshot) => {
        if (!globalEventState.lastUserId) return;
        
        // 초기 로드 시 개별 로그 대신 요약만 표시
        const isInitialLoad = snapshot.docChanges().length > 10;
        
        if (isInitialLoad) {
          console.log(`[GlobalEvents] Firestore 초기 로드: ${snapshot.docChanges().length}개 이벤트`);
        } else {
          console.log(`[GlobalEvents] Firestore 이벤트 변경 감지`);
          
          let hasRelevantChanges = false;
          const userGroupIds = Array.from(globalEventState.groupColors.keys());
          
          snapshot.docChanges().forEach((change) => {
            const eventData = change.doc.data();
            if (userGroupIds.includes(eventData.groupId) || 
                (eventData.userId === globalEventState.lastUserId && eventData.groupId === 'personal')) {
              hasRelevantChanges = true;
              if (!isInitialLoad) {
                console.log(`[GlobalEvents] 관련 이벤트 변경 감지: ${change.type}`, eventData.title);
              }
            }
          });
          
          if (hasRelevantChanges) {
            clearUserCache(globalEventState.lastUserId);
            const result = await getUserEvents(globalEventState.lastUserId, true);
            
            if (result.success && Array.isArray(result.events)) {
              globalEventState.events = result.events;
              await cacheService.saveEventsToCache(globalEventState.lastUserId, result.events);
              
              globalEventState.callbacks.forEach(cb => {
                try {
                  cb(globalEventState.events);
                } catch (error) {
                  console.error('[GlobalEvents] 콜백 실행 오류:', error);
                }
              });
            }
          }
        }
      },
      (error) => {
        console.error('[GlobalEvents] Firestore 구독 오류:', error);
        cacheService.loadEventsFromCache(userId).then(cachedEvents => {
          callback(cachedEvents);
        });
      }
    );
    
    const membershipQuery = query(
      collection(db, 'groupMembers'),
      where('userId', '==', userId)
    );
    
    const membershipUnsubscribe = onSnapshot(
      membershipQuery,
      async (snapshot) => {
        if (!globalEventState.lastUserId) return;
        
        console.log(`[GlobalEvents] 그룹 멤버십 변경 감지`);
        
        let colorChanged = false;
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'modified') {
            const data = change.doc.data();
            if (data.color && globalEventState.groupColors.get(data.groupId) !== data.color) {
              colorChanged = true;
              updateGroupColorInMemory(data.groupId, data.color);
            }
          }
        });
        
        const result = await getUserEvents(globalEventState.lastUserId, true);
        
        if (result.success && Array.isArray(result.events)) {
          globalEventState.events = result.events;
          await cacheService.saveEventsToCache(globalEventState.lastUserId, result.events);
          
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
    
    globalEventState.subscription = () => {
      eventsUnsubscribe();
      membershipUnsubscribe();
    };
  }
  
  globalEventState.callbacks.add(callback);
  
  if (globalEventState.events.length > 0) {
    setTimeout(() => callback(globalEventState.events), 0);
  }
  
  return () => {
    globalEventState.callbacks.delete(callback);
    
    if (globalEventState.callbacks.size === 0 && globalEventState.subscription) {
      console.log(`[GlobalEvents] 마지막 콜백 제거로 구독 해제`);
      globalEventState.subscription();
      globalEventState.subscription = null;
      globalEventState.lastUserId = null;
    }
  };
};

// 사용자의 그룹 색상 정보 로드
async function loadUserGroupColors(userId: string) {
  try {
    const membersQuery = query(
      collection(db, 'groupMembers'),
      where('userId', '==', userId)
    );
    
    const snapshot = await getDocs(membersQuery);
    globalEventState.groupColors.clear();
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.groupId && data.color) {
        globalEventState.groupColors.set(data.groupId, data.color);
      }
    });
    
    console.log('[loadUserGroupColors] 그룹 색상 로드 완료:', globalEventState.groupColors.size);
  } catch (error) {
    console.error('[loadUserGroupColors] 오류:', error);
  }
}

// 실시간 구독을 관리하기 위한 Map
const eventListeners: Map<string, Unsubscribe> = new Map();

// undefined 값을 필터링하여 Firestore에 저장 가능한 객체로 변환
function removeUndefinedValues(data: Record<string, any>): Record<string, any> {
  return Object.entries(data).reduce((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, any>);
}

// 알림 전송을 별도 비동기 함수로 분리
async function sendEventNotificationsAsync(eventId: string, eventData: any) {
  try {
    if (!eventData.groupId || !eventData.title) {
      console.log('알림 전송에 필요한 필드가 없습니다');
      return;
    }
    
    const groupDoc = await getDoc(doc(db, 'groups', eventData.groupId));
    if (groupDoc.exists()) {
      const groupName = groupDoc.data().name || '그룹';
      
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
      
      let notificationTitle = `새 일정: ${eventData.title}`;
      let notificationBody = `${creatorName}님이 ${groupName} 그룹에 새 일정을 추가했습니다.`;
      
      if (eventData.isMultiDay && eventData.startDate && eventData.endDate) {
        notificationBody += ` (${eventData.startDate} ~ ${eventData.endDate})`;
      }
      
      if (eventData.isSharedEvent && eventData.targetGroupIds && eventData.targetGroupIds.length > 1) {
        notificationBody += ` (${eventData.targetGroupIds.length}개 그룹에 공유됨)`;
      }
      
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
        eventData.userId
      );
      
      console.log('그룹 멤버들에게 새 일정 알림 전송 완료');
    }
  } catch (error) {
    console.error('알림 전송 중 오류:', error);
  }
}

// 일정 수정 알림 함수 (새로 추가)
async function sendEventUpdateNotificationAsync(eventId: string, eventData: any, oldEventData: any) {
  try {
    if (!eventData.groupId || !eventData.title) return;
    
    const groupDoc = await getDoc(doc(db, 'groups', eventData.groupId));
    if (groupDoc.exists()) {
      const groupName = groupDoc.data().name || '그룹';
      
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
      
      let notificationTitle = `일정 수정: ${eventData.title}`;
      let notificationBody = `${creatorName}님이 ${groupName} 그룹의 일정을 수정했습니다.`;
      
      // 날짜 변경된 경우 추가 정보
      if (oldEventData && oldEventData.startDate !== eventData.startDate) {
        notificationBody += ` (${oldEventData.startDate} → ${eventData.startDate})`;
      }
      
      await sendGroupNotification(
        eventData.groupId,
        notificationTitle,
        notificationBody,
        { 
          type: 'event_updated',
          eventId: eventId,
          groupId: eventData.groupId,
          date: eventData.startDate || ''
        },
        eventData.userId
      );
      
      console.log('그룹 멤버들에게 일정 수정 알림 전송 완료');
    }
  } catch (error) {
    console.error('수정 알림 전송 중 오류:', error);
  }
}

// 일정 삭제 알림 함수 (새로 추가)
async function sendEventDeleteNotificationAsync(eventId: string, eventData: any) {
  try {
    if (!eventData.groupId || !eventData.title) return;
    
    const groupDoc = await getDoc(doc(db, 'groups', eventData.groupId));
    if (groupDoc.exists()) {
      const groupName = groupDoc.data().name || '그룹';
      
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
      
      let notificationTitle = `일정 삭제: ${eventData.title}`;
      let notificationBody = `${creatorName}님이 ${groupName} 그룹의 일정을 삭제했습니다.`;
      
      if (eventData.startDate) {
        notificationBody += ` (${eventData.startDate})`;
      }
      
      await sendGroupNotification(
        eventData.groupId,
        notificationTitle,
        notificationBody,
        { 
          type: 'event_deleted',
          eventId: eventId,
          groupId: eventData.groupId
        },
        eventData.userId
      );
      
      console.log('그룹 멤버들에게 일정 삭제 알림 전송 완료');
    }
  } catch (error) {
    console.error('삭제 알림 전송 중 오류:', error);
  }
}

/**
 * 새 이벤트 추가
 */
export const addEvent = async (eventData: Omit<CalendarEvent, 'id'>): Promise<EventResult> => {
  try {
    console.log('Adding event to Firebase:', eventData);
    
    const safeData = {
      ...eventData,
      title: eventData.title || '제목 없음',
      startDate: eventData.startDate || new Date().toISOString().split('T')[0],
      groupId: eventData.groupId || 'personal'
    };
    
    if (isDuplicateSubmission(safeData)) {
      return { success: false, error: 'DUPLICATE_SUBMISSION' };
    }
    
    if (!safeData.endDate) {
      safeData.endDate = safeData.startDate;
      safeData.isMultiDay = false;
    }
    
    if (new Date(safeData.endDate) < new Date(safeData.startDate)) {
      safeData.endDate = safeData.startDate;
      safeData.isMultiDay = false;
    }
    
    if (safeData.startDate !== safeData.endDate) {
      safeData.isMultiDay = true;
    }
    
    const tempId = `temp_${Date.now()}_${Math.random()}`;
    const optimisticEvent = {
      ...safeData,
      id: tempId,
      color: globalEventState.groupColors.get(safeData.groupId) || safeData.color || '#4CAF50'
    };
    
    globalEventState.events.push(optimisticEvent as CalendarEvent);
    
    globalEventState.callbacks.forEach(cb => {
      try {
        cb(globalEventState.events);
      } catch (error) {
        console.error('[addEvent] 낙관적 업데이트 콜백 오류:', error);
      }
    });
    
    if (!cacheService.getIsOnline()) {
      const offlineId = `offline_${Date.now()}_${Math.random()}`;
      const offlineEvent = {
        ...safeData,
        id: offlineId,
        isOfflineCreated: true,
        offlineId: offlineId
      };
      
      await cacheService.addToOfflineQueue({
        type: 'add',
        collection: 'events',
        data: offlineEvent
      });
      
      if (safeData.userId) {
        const eventDate = new Date(safeData.startDate);
        clearMonthCache(safeData.userId, eventDate.getFullYear(), eventDate.getMonth());
      }
      
      return { success: true, eventId: offlineId };
    }
    
    const { id, ...dataWithoutId } = safeData as any;
    const cleanData = removeUndefinedValues(dataWithoutId);
    
    if (!cleanData.notificationEnabled) {
      cleanData.notificationMinutesBefore = null;
      cleanData.notificationId = null;
    } else if (cleanData.notificationEnabled && !cleanData.notificationId) {
      cleanData.notificationId = null;
    }
    
    if (!cleanData.createdByName && auth.currentUser) {
      cleanData.createdByName = auth.currentUser.displayName || '사용자';
    }
    
    const docRef = await addDoc(collection(db, 'events'), cleanData);
    console.log('Event added with ID:', docRef.id);
    
    globalEventState.events = globalEventState.events.map(event => 
      event.id === tempId ? { ...event, id: docRef.id } : event
    );
    
    if (safeData.userId) {
      const eventDate = new Date(safeData.startDate);
      clearMonthCache(safeData.userId, eventDate.getFullYear(), eventDate.getMonth());
    }
    
    if (safeData.groupId && safeData.groupId !== 'personal') {
      sendEventNotificationsAsync(docRef.id, safeData);
    }
    
    return { success: true, eventId: docRef.id };
  } catch (error: any) {
    console.error('Error adding event:', error);
    
    globalEventState.events = globalEventState.events.filter(event => 
      !event.id?.startsWith('temp_')
    );
    
    globalEventState.callbacks.forEach(cb => {
      try {
        cb(globalEventState.events);
      } catch (error) {
        console.error('[addEvent] 롤백 콜백 오류:', error);
      }
    });
    
    return { success: false, error: error.message };
  }
};

/**
 * 이벤트 업데이트
 */
export const updateEvent = async (eventId: string, eventData: CalendarEvent): Promise<EventResult> => {
  let originalEvent: CalendarEvent | undefined;
  
  try {
    originalEvent = globalEventState.events.find(e => e.id === eventId);
    if (originalEvent) {
      globalEventState.events = globalEventState.events.map(event => 
        event.id === eventId ? { 
          ...event, 
          ...eventData,
          color: globalEventState.groupColors.get(eventData.groupId) || eventData.color || event.color
        } : event
      );
      
      globalEventState.callbacks.forEach(cb => {
        try {
          cb(globalEventState.events);
        } catch (error) {
          console.error('[updateEvent] 낙관적 업데이트 콜백 오류:', error);
        }
      });
    }
    
    if (!cacheService.getIsOnline()) {
      await cacheService.addToOfflineQueue({
        type: 'update',
        collection: 'events',
        data: { id: eventId, ...eventData }
      });
      
      if (eventData.userId) {
        const eventDate = new Date(eventData.startDate);
        clearMonthCache(eventData.userId, eventDate.getFullYear(), eventDate.getMonth());
      }
      
      return { success: true };
    }

    const eventRef = doc(db, 'events', eventId);
    const eventDoc = await getDoc(eventRef);
    const oldEventData = eventDoc.exists() ? eventDoc.data() : null;
    
    if (!eventData.endDate) {
      eventData.endDate = eventData.startDate;
      eventData.isMultiDay = false;
    }
    
    if (new Date(eventData.endDate) < new Date(eventData.startDate)) {
      eventData.endDate = eventData.startDate;
      eventData.isMultiDay = false;
    }
    
    if (eventData.startDate !== eventData.endDate) {
      eventData.isMultiDay = true;
    } else {
      eventData.isMultiDay = false;
    }
    
    const { id, ...dataToUpdate } = eventData;
    const cleanData = removeUndefinedValues(dataToUpdate);
    
    if (!cleanData.notificationEnabled) {
      cleanData.notificationMinutesBefore = null;
      cleanData.notificationId = null;
    }
    
    cleanData.updatedAt = new Date().toISOString();
    
    await updateDoc(eventRef, cleanData);
    
    if (eventData.userId) {
      const eventDate = new Date(eventData.startDate);
      clearMonthCache(eventData.userId, eventDate.getFullYear(), eventDate.getMonth());
      
      if (oldEventData && oldEventData.startDate !== eventData.startDate) {
        const oldDate = new Date(oldEventData.startDate);
        clearMonthCache(eventData.userId, oldDate.getFullYear(), oldDate.getMonth());
      }
    }
    
    // 알림 처리는 비동기로 (수정됨)
    if (eventData.groupId && eventData.groupId !== 'personal') {
      sendEventUpdateNotificationAsync(eventId, eventData, oldEventData);
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('Event update error:', error);
    
    if (originalEvent) {
      globalEventState.events = globalEventState.events.map(event => 
        event.id === eventId ? originalEvent! : event
      );
      
      globalEventState.callbacks.forEach(cb => {
        try {
          cb(globalEventState.events);
        } catch (error) {
          console.error('[updateEvent] 롤백 콜백 오류:', error);
        }
      });
    }
    
    return { success: false, error: error.message };
  }
};

/**
 * 이벤트 삭제
 */
export const deleteEvent = async (eventId: string): Promise<EventResult> => {
  let deletedEvent: CalendarEvent | undefined;
  
  try {
    deletedEvent = globalEventState.events.find(e => e.id === eventId);
    if (deletedEvent) {
      globalEventState.events = globalEventState.events.filter(event => event.id !== eventId);
      
      globalEventState.callbacks.forEach(cb => {
        try {
          cb(globalEventState.events);
        } catch (error) {
          console.error('[deleteEvent] 낙관적 업데이트 콜백 오류:', error);
        }
      });
    }
    
    if (!cacheService.getIsOnline()) {
      await cacheService.addToOfflineQueue({
        type: 'delete',
        collection: 'events',
        data: { id: eventId }
      });
      
      return { success: true };
    }

    const eventRef = doc(db, 'events', eventId);
    const eventDoc = await getDoc(eventRef);
    const eventData = eventDoc.exists() ? eventDoc.data() as CalendarEvent : null;
    
    await deleteDoc(eventRef);
    
    if (eventData && eventData.userId) {
      const eventDate = new Date(eventData.startDate);
      clearMonthCache(eventData.userId, eventDate.getFullYear(), eventDate.getMonth());
    }
    
    // 알림 처리는 비동기로 (수정됨)
    if (eventData && eventData.groupId && eventData.groupId !== 'personal') {
      sendEventDeleteNotificationAsync(eventId, eventData);
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('Event deletion error:', error);
    
    if (deletedEvent) {
      globalEventState.events.push(deletedEvent);
      
      globalEventState.callbacks.forEach(cb => {
        try {
          cb(globalEventState.events);
        } catch (error) {
          console.error('[deleteEvent] 롤백 콜백 오류:', error);
        }
      });
    }
    
    return { success: false, error: error.message };
  }
};

/**
 * 사용자가 속한 그룹의 모든 이벤트 가져오기
 */
export const getUserEvents = async (userId: string, forceRefresh: boolean = false): Promise<EventResult> => {
  const cacheKey = `user_${userId}_all`;
  
  // 중복 요청 방지
  if (!forceRefresh && eventCache.get(`${cacheKey}_loading`)) {
    console.log('[getUserEvents] 이미 로드 중 - 대기');
    const cached = eventCache.get(cacheKey);
    if (cached) return cached.data;
    return { success: true, events: [] };
  }
  
  const cached = eventCache.get(cacheKey);
  
  if (!forceRefresh && cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
    console.log('[getUserEvents] 캐시에서 데이터 반환');
    return cached.data;
  }
  
  if (!cacheService.getIsOnline()) {
    console.log('[getUserEvents] 오프라인 모드 - 영구 캐시에서 데이터 로드');
    const cachedEvents = await cacheService.loadEventsFromCache(userId);
    return { success: true, events: cachedEvents, isFromCache: true };
  }
  
  eventCache.set(`${cacheKey}_loading`, { data: { success: true }, timestamp: Date.now() });
  
  try {
    const events: CalendarEvent[] = [];
    
    // ✅ 완전 자동화: 현재 날짜 기준 전후 12개월
    const now = new Date();
    const startDate = new Date(now);
    const endDate = new Date(now);
    
    // 12개월 전부터
    startDate.setMonth(now.getMonth() - 12);
    startDate.setDate(1); // 월 첫날로 설정
    
    // 12개월 후까지
    endDate.setMonth(now.getMonth() + 12);
    endDate.setMonth(endDate.getMonth() + 1); // 다음달로
    endDate.setDate(0); // 이전달 마지막 날 = 12개월 후 마지막 날
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    console.log(`[getUserEvents] 자동 기간 설정: ${startDateStr} ~ ${endDateStr} (전후 12개월)`);
    
    // 그룹 멤버십 조회
    const membersQuery = query(
      collection(db, 'groupMembers'),
      where('userId', '==', userId)
    );
    
    const membersSnapshot = await getDocs(membersQuery);
    const groupIds: string[] = [];
    const groupColors: Record<string, string> = {};
    
    membersSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.groupId) {
        groupIds.push(data.groupId);
        if (data.color) {
          groupColors[data.groupId] = data.color;
          globalEventState.groupColors.set(data.groupId, data.color);
        }
      }
    });
    
    console.log(`[getUserEvents] 사용자(${userId})가 속한 그룹 IDs:`, groupIds);
    console.log(`[getUserEvents] 사용자의 그룹 색상:`, groupColors);
    
    const eventMap: Record<string, CalendarEvent> = {};
    
    // 그룹 이벤트 조회
    if (groupIds.length > 0) {
      const groupChunks = [];
      for (let i = 0; i < groupIds.length; i += 10) {
        groupChunks.push(groupIds.slice(i, i + 10));
      }
      
      for (const groupChunk of groupChunks) {
        const groupEventsQuery = query(
          collection(db, 'events'),
          where('groupId', 'in', groupChunk),
          where('startDate', '>=', startDateStr),
          where('startDate', '<=', endDateStr)
        );
        
        const groupEventsSnapshot = await getDocs(groupEventsQuery);
        console.log(`[getUserEvents] ${groupChunk.length}개 그룹의 일정 개수: ${groupEventsSnapshot.size}`);
        
        groupEventsSnapshot.forEach((doc) => {
          const data = doc.data();
          const eventId = doc.id;
          
          const color = groupColors[data.groupId] || data.color || '#4CAF50';
          
          let startDate = data.startDate || data.date || '';
          let endDate = data.endDate || startDate;
          let isMultiDay = data.isMultiDay || startDate !== endDate;
          
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
            color
          } as CalendarEvent;
        });
      }
      
      // 진행 중인 다일 일정 체크
      for (const groupChunk of groupChunks) {
        const ongoingEventsQuery = query(
          collection(db, 'events'),
          where('groupId', 'in', groupChunk),
          where('isMultiDay', '==', true),
          where('startDate', '<', startDateStr),
          where('endDate', '>=', startDateStr)
        );
        
        const ongoingSnapshot = await getDocs(ongoingEventsQuery);
        console.log(`[getUserEvents] 진행 중인 다일 일정: ${ongoingSnapshot.size}개`);
        
        ongoingSnapshot.forEach((doc) => {
          const data = doc.data();
          const eventId = doc.id;
          
          if (!eventMap[eventId]) {
            const color = groupColors[data.groupId] || data.color || '#4CAF50';
            
            eventMap[eventId] = {
              id: eventId,
              title: data.title || '',
              startDate: data.startDate || '',
              endDate: data.endDate || '',
              isMultiDay: true,
              groupId: data.groupId || 'personal',
              ...data,
              color
            } as CalendarEvent;
          }
        });
      }
    }
    
    // 개인 일정 조회
    const personalQuery = query(
      collection(db, 'events'),
      where('userId', '==', userId),
      where('groupId', '==', 'personal'),
      where('startDate', '>=', startDateStr),
      where('startDate', '<=', endDateStr)
    );
    
    const personalSnapshot = await getDocs(personalQuery);
    
    personalSnapshot.forEach((doc) => {
      const data = doc.data();
      const eventId = doc.id;
      
      if (!eventMap[eventId]) {
        let startDate = data.startDate || data.date || '';
        let endDate = data.endDate || startDate;
        let isMultiDay = data.isMultiDay || startDate !== endDate;
        
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
    
    const allEvents = Object.values(eventMap);
    
    console.log(`[getUserEvents] 총 불러온 일정 개수: ${allEvents.length} (자동 기간 적용)`);
    
    const result = { success: true, events: allEvents };
    eventCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    await cacheService.saveEventsToCache(userId, allEvents);
    
    return result;
  } catch (error: any) {
    console.error('이벤트 가져오기 오류:', error);
    
    console.log('[getUserEvents] 오류 발생 - 캐시 데이터 사용');
    const cachedEvents = await cacheService.loadEventsFromCache(userId);
    return { success: true, events: cachedEvents, isFromCache: true };
  } finally {
    eventCache.delete(`${cacheKey}_loading`);
  }
};

/**
 * 특정 월의 이벤트만 가져오기
 */
export const getEventsForMonth = async (
  userId: string, 
  year: number, 
  month: number
): Promise<EventResult> => {
  const cacheKey = `user_${userId}_${year}_${month}`;
  const cached = eventCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
    console.log(`[getEventsForMonth] ${year}년 ${month + 1}월 캐시 데이터 반환`);
    return cached.data;
  }
  
  if (!cacheService.getIsOnline()) {
    console.log(`[getEventsForMonth] 오프라인 모드 - ${year}년 ${month + 1}월 캐시 데이터 로드`);
    const cachedEvents = await cacheService.loadMonthEventsFromCache(userId, year, month);
    return { success: true, events: cachedEvents, isFromCache: true };
  }
  
  try {
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    
    const startDateStr = startOfMonth.toISOString().split('T')[0];
    const endDateStr = endOfMonth.toISOString().split('T')[0];
    
    console.log(`[getEventsForMonth] ${startDateStr} ~ ${endDateStr} 기간 조회`);
    
    const allEventsResult = await getUserEvents(userId);
    
    if (!allEventsResult.success || !allEventsResult.events) {
      return allEventsResult;
    }
    
    const monthEvents = allEventsResult.events.filter(event => {
      if (event.isMultiDay) {
        return (event.startDate <= endDateStr && event.endDate >= startDateStr);
      } else {
        return event.startDate >= startDateStr && event.startDate <= endDateStr;
      }
    });
    
    console.log(`[getEventsForMonth] ${year}년 ${month + 1}월 일정 개수: ${monthEvents.length}`);
    
    const result = { success: true, events: monthEvents };
    eventCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    return result;
  } catch (error: any) {
    console.error('월별 이벤트 가져오기 오류:', error);
    
    const cachedEvents = await cacheService.loadMonthEventsFromCache(userId, year, month);
    return { success: true, events: cachedEvents, isFromCache: true };
  }
};

/**
 * 실시간으로 사용자 이벤트 구독 (최적화 버전)
 */
export const subscribeToUserEvents = (
  userId: string, 
  callback: (events: CalendarEvent[]) => void
): (() => void) => {
  console.log(`[subscribeToUserEvents] 사용자 ID: ${userId}에 대한 이벤트 구독 시작`);
  
  // 1. 캐시에서 먼저 데이터 로드하여 즉시 표시
  let hasInitialDataLoaded = false;
  
  cacheService.loadEventsFromCache(userId).then(cachedEvents => {
    if (!hasInitialDataLoaded) {
      if (cachedEvents.length > 0) {
        console.log(`[subscribeToUserEvents] 캐시에서 ${cachedEvents.length}개 이벤트 즉시 표시`);
        callback(cachedEvents);
        hasInitialDataLoaded = true;
      } else {
        console.log('[subscribeToUserEvents] 캐시 없음 - 빈 배열로 시작');
        callback([]);
        hasInitialDataLoaded = true;
      }
    }
  }).catch(error => {
    console.error('[subscribeToUserEvents] 캐시 로드 실패:', error);
    if (!hasInitialDataLoaded) {
      callback([]);
      hasInitialDataLoaded = true;
    }
  });
  
  // 2. 실시간 구독 설정 (타임아웃 제거)
  const unsubscribe = subscribeToEvents(userId, (events) => {
    console.log(`[subscribeToUserEvents] 실시간 업데이트: ${events.length}개 이벤트`);
    callback(events);
    hasInitialDataLoaded = true;
  });
  
  eventListeners.set(userId, () => {
    unsubscribe();
  });
  
  return () => {
    console.log('이벤트 구독 해제');
    if (eventListeners.has(userId)) {
      eventListeners.delete(userId);
    }
    unsubscribe();
  };
};

/**
 * 다일 일정에 대한 각 날짜별 이벤트 데이터 생성
 */
export const expandMultiDayEvent = (event: CalendarEvent): Record<string, CalendarEvent> => {
  const result: Record<string, CalendarEvent> = {};
  
  if (!event.isMultiDay || !event.startDate || !event.endDate || event.startDate === event.endDate) {
    result[event.startDate] = { ...event };
    return result;
  }
  
  const dates = getDatesBetween(event.startDate, event.endDate);
  
  dates.forEach((date, index) => {
    const position = 
      index === 0 ? 'start' : 
      index === dates.length - 1 ? 'end' : 'middle';
    
    result[date] = {
      ...event,
      multiDayPosition: position
    } as CalendarEvent;
  });
  
  return result;
};
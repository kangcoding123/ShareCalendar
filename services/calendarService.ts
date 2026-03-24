// services/calendarService.ts (최적화 버전)
import { nativeDb, auth } from '../config/firebase';
import { sendGroupNotification } from './notificationService';
import { Attachment } from '../types/board';
import { deleteFiles } from './fileService';
// 🌟 알림 관련 함수들 import 추가
import {
  scheduleEventNotification,
  cancelEventNotification,
  rescheduleEventNotification
} from './notificationService';
import { getDatesBetween } from '../utils/dateUtils';
import { cacheService } from './cacheService';
import { Platform } from 'react-native';
import { incrementEventCreatedCount } from './reviewService';
import { logger } from '../utils/logger';
import { updateWidgetData } from './widgetService';

// 반복 유형 정의
export type RecurrenceType = 'none' | 'weekly' | 'monthly' | 'yearly';
export type RecurrenceEndType = 'never' | 'until';

// 반복 설정 인터페이스
export interface RecurrenceSettings {
  type: RecurrenceType;
  endType: RecurrenceEndType;
  endDate?: string;  // endType이 'until'일 때만 사용 (YYYY-MM-DD)
}

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
  // 반복 일정 관련 필드
  recurrence?: RecurrenceSettings;
  isRecurringInstance?: boolean;  // 가상 인스턴스 여부 (UI 표시용)
  masterEventId?: string;         // 마스터 이벤트 ID (가상 인스턴스인 경우)
  // 첨부파일
  attachments?: Attachment[];
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
  subscription: null as (() => void) | null,
  lastUserId: null as string | null,
  groupColors: new Map<string, string>(),
  callbackDebounceTimer: null as ReturnType<typeof setTimeout> | null,
  isClearing: false, // 로그아웃/구독 해제 중인지 플래그
};

// 콜백 호출을 debounce 처리하는 함수
const notifyCallbacksDebounced = () => {
  // 이전 타이머가 있으면 취소
  if (globalEventState.callbackDebounceTimer) {
    clearTimeout(globalEventState.callbackDebounceTimer);
  }

  // 500ms 후에 콜백 호출 (짧은 시간 내의 여러 호출을 하나로 합침)
  globalEventState.callbackDebounceTimer = setTimeout(() => {
    globalEventState.callbacks.forEach(cb => {
      try {
        cb(globalEventState.events);
      } catch (error) {
        logger.error('[GlobalEvents] 콜백 오류:', error);
      }
    });
    // iOS 위젯 데이터 갱신
    updateWidgetData(globalEventState.events);
    globalEventState.callbackDebounceTimer = null;
  }, 500);
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
  logger.log(`[Cache] ${year}년 ${month + 1}월 캐시 삭제됨`);
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
  logger.log('[Cache] 모든 캐시가 삭제되었습니다');
};

// 최근 제출 이벤트 캐시
const recentSubmissions = new Map<string, number>();

// 모든 이벤트 구독 해제 함수
export const clearEventSubscriptions = () => {
  logger.log('[GlobalEvents] 모든 이벤트 구독 및 상태 초기화 시작');

  // 구독 해제 중 플래그 설정 (에러 로깅 방지)
  globalEventState.isClearing = true;

  // 구독 해제를 먼저 수행
  if (globalEventState.subscription) {
    try {
      globalEventState.subscription();
    } catch (error) {
      // 로그아웃 중 발생하는 오류는 무시
    }
    globalEventState.subscription = null;
  }

  // 모든 콜백 제거
  globalEventState.callbacks.clear();

  // 상태 초기화
  globalEventState.events = [];
  globalEventState.lastUserId = null;
  globalEventState.groupColors.clear();

  // 이벤트 리스너 모두 해제
  eventListeners.forEach(unsubscribe => {
    if (typeof unsubscribe === 'function') {
      try {
        unsubscribe();
      } catch (error) {
        // 로그아웃 중 발생하는 오류는 무시
      }
    }
  });
  eventListeners.clear();

  // 캐시 삭제
  clearAllCache();

  logger.log('[GlobalEvents] 구독 및 캐시 초기화 완료');

  // 플래그 해제는 약간의 지연 후 (비동기 리스너 정리 완료 대기)
  setTimeout(() => {
    globalEventState.isClearing = false;
  }, 1000);
};

// 그룹 색상 메모리 업데이트
export const updateGroupColorInMemory = (groupId: string, color: string) => {
  globalEventState.groupColors.set(groupId, color);
  logger.log(`[GroupColor] 그룹 ${groupId}의 색상이 ${color}로 메모리에 업데이트되었습니다`);

  // 해당 그룹의 모든 이벤트 색상 업데이트
  globalEventState.events = globalEventState.events.map(event =>
    event.groupId === groupId ? { ...event, color } : event
  );

  // UI 업데이트를 위해 콜백 호출
  globalEventState.callbacks.forEach(cb => {
    try {
      cb(globalEventState.events);
    } catch (error) {
      logger.error('[GroupColor] 콜백 호출 오류:', error);
    }
  });

  logger.log(`[GroupColor] ${groupId} 그룹의 이벤트 색상이 실시간으로 업데이트되었습니다`);
};

// 중복 이벤트 제거 함수
const removeDuplicateEvents = (events: CalendarEvent[]): CalendarEvent[] => {
  const seen = new Map<string, CalendarEvent>();
  events.forEach(event => {
    if (event.id && !seen.has(event.id)) {
      seen.set(event.id, event);
    }
  });
  return Array.from(seen.values());
};

// 이벤트 리스너 관리
const eventListeners = new Map<string, () => void>();

// 글로벌 이벤트 등록
export const registerGlobalEventCallback = (callback: (events: CalendarEvent[]) => void) => {
  globalEventState.callbacks.add(callback);
  if (globalEventState.events.length > 0) {
    callback(globalEventState.events);
  }
  
  return () => {
    globalEventState.callbacks.delete(callback);
  };
};

// undefined 값 제거 헬퍼 함수
const removeUndefinedValues = (obj: any): any => {
  const cleanObj: any = {};
  for (const key in obj) {
    if (obj[key] !== undefined && obj[key] !== null) {
      if (typeof obj[key] === 'object' && !Array.isArray(obj[key]) && obj[key] !== null) {
        cleanObj[key] = removeUndefinedValues(obj[key]);
      } else {
        cleanObj[key] = obj[key];
      }
    }
  }
  return cleanObj;
};

// 그룹 멤버 색상 로드
const loadUserGroupColors = async (userId: string, groupIds: string[]) => {
  try {
    const membershipsSnapshot = await nativeDb
      .collection('groupMembers')
      .where('userId', '==', userId)
      .where('groupId', 'in', groupIds)
      .get();
    
    membershipsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.groupId && data.color) {
        globalEventState.groupColors.set(data.groupId, data.color);
      }
    });
    
    logger.log('[loadUserGroupColors] 그룹 색상 로드 완료:', globalEventState.groupColors.size);
  } catch (error) {
    logger.error('[loadUserGroupColors] 그룹 색상 로드 실패:', error);
  }
};

// 현재 이벤트 데이터로 위젯 즉시 갱신 (포그라운드 복귀 시 사용)
export const refreshWidgetData = () => {
  updateWidgetData(globalEventState.events);
};

// 사용자가 속한 그룹의 모든 이벤트를 실시간으로 구독
export const subscribeToUserEvents = async (userId: string, forceRefresh: boolean = false) => {
  logger.log(`[subscribeToUserEvents] 사용자 ID: ${userId}에 대한 이벤트 구독 시작`);
  
  if (!forceRefresh && globalEventState.lastUserId === userId && globalEventState.subscription) {
    logger.log('[subscribeToUserEvents] 이미 동일한 사용자에 대해 구독 중');
    return () => {};
  }
  
  if (globalEventState.subscription) {
    logger.log('[subscribeToUserEvents] 기존 구독 해제');
    globalEventState.subscription();
    globalEventState.subscription = null;
  }
  
  globalEventState.lastUserId = userId;
  globalEventState.events = [];
  
  if (!cacheService.getIsOnline()) {
    const cachedEvents = await cacheService.loadEventsFromCache(userId);
    logger.log(`[subscribeToUserEvents] 캐시에서 ${cachedEvents.length}개 이벤트 즉시 표시`);
    
    globalEventState.events = cachedEvents;
    globalEventState.callbacks.forEach(cb => cb(cachedEvents));
    return () => {};
  }
  
  const userGroupIds: string[] = [];
  
  try {
    const membershipsSnapshot = await nativeDb
      .collection('groupMembers')
      .where('userId', '==', userId)
      .get();
    
    for (const doc of membershipsSnapshot.docs) {
      const data = doc.data();
      if (data.groupId) {
        userGroupIds.push(data.groupId);
        if (data.color) {
          globalEventState.groupColors.set(data.groupId, data.color);
        }
      }
    }
    
    logger.log('[subscribeToUserEvents] 사용자가 속한 그룹:', userGroupIds);
  } catch (error) {
    logger.error('[subscribeToUserEvents] 그룹 멤버십 조회 오류:', error);
  }
  
  if (userGroupIds.length === 0) {
    logger.log('[subscribeToUserEvents] 사용자가 속한 그룹이 없음');
    return () => {};
  }
  
  const [query1, query2] = createEventQueries(userGroupIds, userId);

  // 캐시 저장을 debounce 처리
  let cacheDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const saveCacheDebounced = () => {
    if (cacheDebounceTimer) {
      clearTimeout(cacheDebounceTimer);
    }
    cacheDebounceTimer = setTimeout(() => {
      if (userId) {
        cacheService.saveEventsToCache(userId, globalEventState.events).catch(err =>
          logger.error('[subscribeToUserEvents] 이벤트 캐시 저장 실패:', err)
        );
      }
      cacheDebounceTimer = null;
    }, 1000); // 1초 후 캐시 저장
  };
  
  const unsubscribe1 = query1.onSnapshot(
    (snapshot: any) => {
      const groupEvents: CalendarEvent[] = [];
      snapshot.docs.forEach((doc: any) => {
        const data = doc.data();
        const groupColor = globalEventState.groupColors.get(data.groupId);
        // 반복 일정 디버깅 로그
        if (data.recurrence) {
          logger.log('[subscribeToUserEvents] 그룹 반복 일정:', data.title, 'recurrence:', JSON.stringify(data.recurrence));
        }
        groupEvents.push({
          ...data,
          id: doc.id,
          color: groupColor || data.color || '#4A90E2'
        } as CalendarEvent);
      });

      // 개인 이벤트만 유지 (그룹 이벤트는 새로 가져온 것으로 대체)
      const personalEvents = globalEventState.events.filter(e => e.groupId === 'personal');
      globalEventState.events = removeDuplicateEvents([...groupEvents, ...personalEvents]);

      // debounce된 콜백 호출 (중복 호출 방지)
      notifyCallbacksDebounced();
      saveCacheDebounced();
    },
    (error: any) => {
      // 로그아웃/탈퇴 시 발생하는 권한 오류는 무시
      if (error?.code !== 'firestore/permission-denied') {
        logger.error('[GlobalEvents] Firestore 구독 오류:', error);
      }
    }
  );

  const unsubscribe2 = query2.onSnapshot(
    (snapshot: any) => {
      const personalEvents: CalendarEvent[] = [];
      snapshot.docs.forEach((doc: any) => {
        const data = doc.data();
        personalEvents.push({
          ...data,
          id: doc.id,
          color: data.color || '#4A90E2'  // Firestore에 저장된 색상 사용, 없으면 기본값
        } as CalendarEvent);
      });

      // 그룹 이벤트만 유지 (개인 이벤트는 새로 가져온 것으로 대체)
      const groupEvents = globalEventState.events.filter(e => e.groupId !== 'personal');
      globalEventState.events = removeDuplicateEvents([...groupEvents, ...personalEvents]);

      // debounce된 콜백 호출 (중복 호출 방지)
      notifyCallbacksDebounced();
      saveCacheDebounced();
    },
    (error: any) => {
      // 로그아웃/탈퇴 시 발생하는 권한 오류는 무시
      if (error?.code !== 'firestore/permission-denied') {
        logger.error('[GlobalEvents] 개인 이벤트 구독 오류:', error);
      }
    }
  );

  globalEventState.subscription = () => {
    logger.log('[GlobalEvents] 이벤트 구독 해제');
    unsubscribe1();
    unsubscribe2();
  };
  
  return globalEventState.subscription;
};

// 이벤트 쿼리 생성
const createEventQueries = (groupIds: string[], userId: string) => {
  const query1 = nativeDb
    .collection('events')
    .where('groupId', 'in', groupIds);
  
  const query2 = nativeDb
    .collection('events')
    .where('userId', '==', userId)
    .where('groupId', '==', 'personal');
  
  return [query1, query2];
};

// 중복 제출 체크
const isDuplicateSubmission = (eventData: Partial<CalendarEvent>): boolean => {
  const key = `${eventData.title}_${eventData.startDate}_${eventData.groupId}`;
  const now = Date.now();
  const lastSubmit = recentSubmissions.get(key);
  
  if (lastSubmit && (now - lastSubmit) < 2000) {
    logger.log('Duplicate submission detected');
    return true;
  }
  
  recentSubmissions.set(key, now);
  setTimeout(() => recentSubmissions.delete(key), 5000);
  
  return false;
};

// 알림 전송 함수들
const sendEventNotificationsAsync = async (eventId: string, eventData: any) => {
  try {
    if (!eventData.groupId || eventData.groupId === 'personal') return;
    
    const currentUser = auth().currentUser;
    if (!currentUser) return;
    
    const creatorName = currentUser.displayName || currentUser.email || '멤버';
    const title = '새로운 일정';
    const body = `${creatorName}님이 일정을 추가했습니다: ${eventData.title}`;
    const notificationData = {
      type: 'new_event',
      eventId,
      groupId: eventData.groupId,
      date: eventData.startDate
    };
    
    await sendGroupNotification(
      eventData.groupId,
      title,
      body,
      notificationData,
      currentUser.uid
    );
  } catch (error) {
    logger.error('[sendEventNotifications] 알림 전송 오류:', error);
  }
};

const sendEventUpdateNotificationAsync = async (eventId: string, eventData: any, oldEventData: any) => {
  try {
    if (!eventData.groupId || eventData.groupId === 'personal') return;
    
    const currentUser = auth().currentUser;
    if (!currentUser) return;
    
    const updaterName = currentUser.displayName || currentUser.email || '멤버';
    const changes: string[] = [];
    
    if (oldEventData?.title !== eventData.title) changes.push('제목');
    if (oldEventData?.startDate !== eventData.startDate) changes.push('날짜');
    if (oldEventData?.time !== eventData.time) changes.push('시간');
    
    if (changes.length === 0) return;
    
    const title = '일정 수정';
    const body = `${updaterName}님이 일정을 수정했습니다: ${eventData.title} (${changes.join(', ')})`;
    const notificationData = {
      type: 'update_event',
      eventId,
      groupId: eventData.groupId,
      date: eventData.startDate
    };
    
    await sendGroupNotification(
      eventData.groupId,
      title,
      body,
      notificationData,
      currentUser.uid
    );
  } catch (error) {
    logger.error('[sendEventUpdateNotification] 알림 전송 오류:', error);
  }
};

const sendEventDeleteNotificationAsync = async (eventId: string, eventData: any) => {
  try {
    if (!eventData.groupId || eventData.groupId === 'personal') return;
    
    const currentUser = auth().currentUser;
    if (!currentUser) return;
    
    const deleterName = currentUser.displayName || currentUser.email || '멤버';
    const title = '일정 삭제';
    const body = `${deleterName}님이 일정을 삭제했습니다: ${eventData.title}`;
    const notificationData = {
      type: 'delete_event',
      eventId,
      groupId: eventData.groupId
    };
    
    await sendGroupNotification(
      eventData.groupId,
      title,
      body,
      notificationData,
      currentUser.uid
    );
  } catch (error) {
    logger.error('[sendEventDeleteNotification] 알림 전송 오류:', error);
  }
};

/**
 * 이벤트 추가
 */
export const addEvent = async (eventData: Partial<CalendarEvent>): Promise<EventResult> => {
  try {
    const safeData = {
      ...eventData,
      title: eventData.title || '새 이벤트',
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
      color: globalEventState.groupColors.get(safeData.groupId) || safeData.color || '#4A90E2'
    };
    
    globalEventState.events.push(optimisticEvent as CalendarEvent);
    
    globalEventState.callbacks.forEach(cb => {
      try {
        cb(globalEventState.events);
      } catch (error) {
        logger.error('[addEvent] 낙관적 업데이트 콜백 오류:', error);
      }
    });
    updateWidgetData(globalEventState.events);

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
    
    if (!cleanData.createdByName) {
      const currentUser = auth().currentUser;
      if (currentUser) {
        cleanData.createdByName = currentUser.displayName || '사용자';
      }
    }
    
    const docRef = await nativeDb.collection('events').add(cleanData);
    logger.log('Event added with ID:', docRef.id);
    
    // 🌟 알림 예약 추가
    const eventWithId = {
      ...cleanData,
      id: docRef.id
    } as CalendarEvent;
    await scheduleEventNotification(eventWithId);
    
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

    // 리뷰 요청을 위한 일정 등록 카운트 증가 (백그라운드에서 처리)
    incrementEventCreatedCount().catch(() => {});

    return { success: true, eventId: docRef.id };
  } catch (error: any) {
    logger.error('Error adding event:', error);
    
    globalEventState.events = globalEventState.events.filter(event => 
      !event.id?.startsWith('temp_')
    );
    
    globalEventState.callbacks.forEach(cb => {
      try {
        cb(globalEventState.events);
      } catch (error) {
        logger.error('[addEvent] 롤백 콜백 오류:', error);
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
          logger.error('[updateEvent] 낙관적 업데이트 콜백 오류:', error);
        }
      });
      updateWidgetData(globalEventState.events);
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

    const eventRef = nativeDb.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();
    const oldEventData = (eventDoc as any).exists ? eventDoc.data() : null;
    
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
    
    await eventRef.update(cleanData);
    
    // 🌟 알림 재예약 추가
    const updatedEventWithId = {
      ...cleanData,
      id: eventId
    } as CalendarEvent;
    await rescheduleEventNotification(updatedEventWithId);
    
    if (eventData.userId) {
      const eventDate = new Date(eventData.startDate);
      clearMonthCache(eventData.userId, eventDate.getFullYear(), eventDate.getMonth());
      
      if (oldEventData && oldEventData.startDate !== eventData.startDate) {
        const oldDate = new Date(oldEventData.startDate);
        clearMonthCache(eventData.userId, oldDate.getFullYear(), oldDate.getMonth());
      }
    }
    
    if (eventData.groupId && eventData.groupId !== 'personal') {
      sendEventUpdateNotificationAsync(eventId, eventData, oldEventData);
    }
    
    return { success: true };
  } catch (error: any) {
    logger.error('Event update error:', error);
    
    if (originalEvent) {
      globalEventState.events = globalEventState.events.map(event => 
        event.id === eventId ? originalEvent! : event
      );
      
      globalEventState.callbacks.forEach(cb => {
        try {
          cb(globalEventState.events);
        } catch (error) {
          logger.error('[updateEvent] 롤백 콜백 오류:', error);
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
          logger.error('[deleteEvent] 낙관적 업데이트 콜백 오류:', error);
        }
      });
      updateWidgetData(globalEventState.events);
    }

    if (!cacheService.getIsOnline()) {
      await cacheService.addToOfflineQueue({
        type: 'delete',
        collection: 'events',
        data: { id: eventId }
      });
      
      return { success: true };
    }

    const eventRef = nativeDb.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();
    const eventData = (eventDoc as any).exists ? eventDoc.data() as CalendarEvent : null;

    // 🌟 알림 취소 추가
    await cancelEventNotification(eventId);

    // 첨부파일이 있으면 Storage에서 삭제
    if (eventData?.attachments && eventData.attachments.length > 0) {
      try {
        const storagePaths = eventData.attachments.map((att: Attachment) => att.storagePath);
        await deleteFiles(storagePaths);
        logger.log('[deleteEvent] 첨부파일 삭제 완료:', storagePaths.length, '개');
      } catch (storageError) {
        logger.error('[deleteEvent] 첨부파일 삭제 오류 (이벤트 삭제는 계속):', storageError);
        // Storage 삭제 실패해도 이벤트 삭제는 진행
      }
    }

    await eventRef.delete();
    
    if (eventData && eventData.userId) {
      const eventDate = new Date(eventData.startDate);
      clearMonthCache(eventData.userId, eventDate.getFullYear(), eventDate.getMonth());
    }
    
    if (eventData && eventData.groupId && eventData.groupId !== 'personal') {
      sendEventDeleteNotificationAsync(eventId, eventData);
    }
    
    return { success: true };
  } catch (error: any) {
    logger.error('Event deletion error:', error);
    
    if (deletedEvent) {
      globalEventState.events.push(deletedEvent);
      
      globalEventState.callbacks.forEach(cb => {
        try {
          cb(globalEventState.events);
        } catch (error) {
          logger.error('[deleteEvent] 롤백 콜백 오류:', error);
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
  
  if (!forceRefresh && eventCache.get(`${cacheKey}_loading`)) {
    logger.log('[getUserEvents] 이미 로드 중 - 대기');
    const cached = eventCache.get(cacheKey);
    if (cached) return cached.data;
    return { success: true, events: [] };
  }
  
  if (!forceRefresh) {
    const cached = eventCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
      logger.log('[getUserEvents] 캐시에서 데이터 반환');
      return cached.data;
    }
  }
  
  eventCache.set(`${cacheKey}_loading`, { data: { success: true }, timestamp: Date.now() });
  
  try {
    if (!cacheService.getIsOnline()) {
      logger.log('[getUserEvents] 오프라인 모드 - 캐시 데이터 사용');
      const cachedEvents = await cacheService.loadEventsFromCache(userId);
      return { success: true, events: cachedEvents, isFromCache: true };
    }
    
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth() - 12, 1);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 12, 31);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    logger.log(`[getUserEvents] 자동 기간 설정: ${startDateStr} ~ ${endDateStr} (전후 12개월)`);
    
    const groups = await getUserGroups(userId);
    
    if (!groups || groups.length === 0) {
      logger.log('[getUserEvents] 사용자가 속한 그룹이 없음');
      return { success: true, events: [] };
    }
    
    const groupIds = groups.map((g: any) => g.id);
    logger.log(`[getUserEvents] 사용자(${userId})가 속한 그룹 IDs:`, groupIds);
    
    const groupColors: { [key: string]: string } = {};
    groups.forEach((g: any) => {
      if (g.color) groupColors[g.id] = g.color;
    });
    logger.log(`[loadUserGroupColors] 그룹 색상 로드 완료:`, Object.keys(groupColors).length);
    
    const eventMap: { [key: string]: CalendarEvent } = {};
    
    // 그룹 이벤트 조회 (10개씩 나누어 조회)
    const groupChunks: string[][] = [];
    for (let i = 0; i < groupIds.length; i += 10) {
      groupChunks.push(groupIds.slice(i, i + 10));
    }
    
    for (const groupChunk of groupChunks) {
      const groupSnapshot = await nativeDb.collection('events')
        .where('groupId', 'in', groupChunk)
        .where('startDate', '>=', startDateStr)
        .where('startDate', '<=', endDateStr)
        .get();
      
      groupSnapshot.forEach((doc) => {
        const data = doc.data();
        const eventId = doc.id;
        const color = groupColors[data.groupId] || data.color || '#4A90E2';
        
        let startDate = data.startDate || data.date || '';
        let endDate = data.endDate || startDate;
        let isMultiDay = data.isMultiDay || startDate !== endDate;
        
        if (!startDate) {
          logger.warn(`[getUserEvents] 이벤트 ${eventId}에 날짜가 없음`);
          startDate = new Date().toISOString().split('T')[0];
        }
        
        if (!endDate) endDate = startDate;
        if (new Date(endDate) < new Date(startDate)) {
          logger.warn(`[getUserEvents] 이벤트 ${eventId}의 종료일이 시작일보다 이전`);
          endDate = startDate;
        }
        
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
    
    // 다중일 이벤트 체크
    if (groupIds.length > 0) {
      for (const groupChunk of groupChunks) {
        const multiDaySnapshot = await nativeDb.collection('events')
          .where('groupId', 'in', groupChunk)
          .where('isMultiDay', '==', true)
          .where('endDate', '>=', startDateStr)
          .get();
        
        logger.log(`[getUserEvents] 다중일 이벤트: ${multiDaySnapshot.size}개`);
        
        multiDaySnapshot.forEach((doc) => {
          const data = doc.data();
          const eventId = doc.id;
          
          if (data.startDate <= endDateStr && !eventMap[eventId]) {
            const color = groupColors[data.groupId] || data.color || '#4A90E2';
            
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
      
      // 진행 중인 다일 일정 체크
      for (const groupChunk of groupChunks) {
        const ongoingSnapshot = await nativeDb.collection('events')
          .where('groupId', 'in', groupChunk)
          .where('isMultiDay', '==', true)
          .where('startDate', '<', startDateStr)
          .where('endDate', '>=', startDateStr)
          .get();
        
        logger.log(`[getUserEvents] 진행 중인 다일 일정: ${ongoingSnapshot.size}개`);
        
        ongoingSnapshot.forEach((doc) => {
          const data = doc.data();
          const eventId = doc.id;
          
          if (!eventMap[eventId]) {
            const color = groupColors[data.groupId] || data.color || '#4A90E2';
            
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
    const personalSnapshot = await nativeDb.collection('events')
      .where('userId', '==', userId)
      .where('groupId', '==', 'personal')
      .where('startDate', '>=', startDateStr)
      .where('startDate', '<=', endDateStr)
      .get();
    
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
    
    logger.log(`[getUserEvents] 총 불러온 일정 개수: ${allEvents.length} (자동 기간 적용)`);
    
    const result = { success: true, events: allEvents };
    eventCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    await cacheService.saveEventsToCache(userId, allEvents);
    
    return result;
  } catch (error: any) {
    logger.error('이벤트 가져오기 오류:', error);
    
    logger.log('[getUserEvents] 오류 발생 - 캐시 데이터 사용');
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
  const monthKey = `user_${userId}_${year}_${month}`;
  
  if (eventCache.get(`${monthKey}_loading`)) {
    logger.log(`[getEventsForMonth] ${year}년 ${month + 1}월 이미 로드 중`);
    const cached = eventCache.get(monthKey);
    if (cached) return cached.data;
    return { success: true, events: [], isFromCache: true };
  }
  
  const cached = eventCache.get(monthKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
    logger.log(`[getEventsForMonth] ${year}년 ${month + 1}월 캐시 데이터 반환`);
    return { ...cached.data, isFromCache: true };
  }
  
  eventCache.set(`${monthKey}_loading`, { data: { success: true }, timestamp: Date.now() });
  
  try {
    const startDate = new Date(year, month, 0);
    const endDate = new Date(year, month + 1, 1);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    logger.log(`[getEventsForMonth] ${startDateStr} ~ ${endDateStr} 기간 조회`);
    
    const result = await getUserEvents(userId);
    
    if (!result.success || !result.events) {
      eventCache.delete(`${monthKey}_loading`);
      return result;
    }
    
    const monthEvents = result.events.filter(event => {
      const eventStartDate = event.startDate;
      const eventEndDate = event.endDate || event.startDate;
      
      if (event.isMultiDay) {
        return eventStartDate <= endDateStr && eventEndDate >= startDateStr;
      } else {
        return eventStartDate >= startDateStr && eventStartDate <= endDateStr;
      }
    });
    
    logger.log(`[getEventsForMonth] ${year}년 ${month + 1}월 일정 개수: ${monthEvents.length}`);
    
    const monthResult = { success: true, events: monthEvents };
    eventCache.set(monthKey, { data: monthResult, timestamp: Date.now() });
    eventCache.delete(`${monthKey}_loading`);
    
    return monthResult;
  } catch (error: any) {
    logger.error(`[getEventsForMonth] ${year}년 ${month + 1}월 오류:`, error);
    eventCache.delete(`${monthKey}_loading`);
    return { success: false, error: error.message };
  }
};

/**
 * 특정 날짜 범위의 이벤트 가져오기
 */
export const getEventsForDateRange = async (
  userId: string, 
  startDate: string, 
  endDate: string
): Promise<EventResult> => {
  try {
    const result = await getUserEvents(userId);
    
    if (!result.success || !result.events) {
      return result;
    }
    
    const rangeEvents = result.events.filter(event => {
      const eventStartDate = event.startDate;
      const eventEndDate = event.endDate || event.startDate;
      
      if (event.isMultiDay) {
        return eventStartDate <= endDate && eventEndDate >= startDate;
      } else {
        return eventStartDate >= startDate && eventStartDate <= endDate;
      }
    });
    
    logger.log(`[getEventsForDateRange] ${startDate} ~ ${endDate} 일정 개수: ${rangeEvents.length}`);
    
    return { success: true, events: rangeEvents };
  } catch (error: any) {
    logger.error('[getEventsForDateRange] 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 사용자가 속한 그룹 목록 가져오기
 */
export const getUserGroups = async (userId: string): Promise<any[]> => {
  try {
    logger.log(`[getUserGroups] 사용자 ID: ${userId}의 그룹 조회 시작`);
    
    const membershipsSnapshot = await nativeDb
      .collection('groupMembers')
      .where('userId', '==', userId)
      .get();
    
    logger.log(`[getUserGroups] 사용자가 속한 그룹 멤버십 개수: ${membershipsSnapshot.size}`);
    
    const groupPromises = membershipsSnapshot.docs.map(async (memberDoc: any) => {
      const memberData = memberDoc.data();
      logger.log('[getUserGroups] 멤버십 데이터:', memberData);
      
      const groupDoc = await nativeDb
        .collection('groups')
        .doc(memberData.groupId)
        .get();
      
      if ((groupDoc as any).exists) {
        const groupData = groupDoc.data();
        logger.log(`[getUserGroups] 로드된 그룹:`, {
          id: groupDoc.id,
          name: groupData?.name,
          role: memberData.role,
          color: memberData.color
        });
        
        return {
          id: groupDoc.id,
          ...groupData,
          role: memberData.role,
          color: memberData.color || groupData?.color || '#4A90E2'
        };
      }
      return null;
    });
    
    const groups = (await Promise.all(groupPromises)).filter(g => g !== null);

    // 그룹명 정렬: 한글 먼저 (가→ㅎ), 그 다음 영문/숫자 (A→Z)
    groups.sort((a: any, b: any) => {
      const nameA = a?.name || '';
      const nameB = b?.name || '';

      // 한글 여부 확인 (첫 글자 기준)
      const isKoreanA = /^[가-힣]/.test(nameA);
      const isKoreanB = /^[가-힣]/.test(nameB);

      // 한글이 영문/숫자보다 먼저 오도록
      if (isKoreanA && !isKoreanB) return -1;
      if (!isKoreanA && isKoreanB) return 1;

      // 같은 종류끼리는 오름차순 정렬
      return nameA.localeCompare(nameB, 'ko');
    });

    // 타입 캐스팅 추가
    if (groups.length > 0) {
      await cacheService.saveGroupsToCache(userId, groups as any); // as any 추가
    }

    logger.log(`[getUserGroups] ${groups.length}개 그룹 로드 완료`);
    return groups;
  } catch (error) {
    logger.error('[getUserGroups] 그룹 조회 오류:', error);
    
    // 타입 캐스팅 추가
    const cachedGroups = await cacheService.loadGroupsFromCache(userId) as any[]; // as any[] 추가
    if (cachedGroups.length > 0) {
      logger.log('[getUserGroups] 캐시에서 그룹 반환');
      return cachedGroups;
    }
    
    return [];
  }
};

/**
 * 그룹 이벤트 구독 (최적화)
 */
export const subscribeToGroupEvents = (
  groupId: string, 
  callback: (events: CalendarEvent[]) => void
) => {
  const listenerKey = `group_${groupId}`;
  
  if (eventListeners.has(listenerKey)) {
    logger.log(`[subscribeToGroupEvents] 이미 구독 중: ${groupId}`);
    return () => {};
  }
  
  logger.log(`[subscribeToGroupEvents] 그룹 이벤트 구독 시작: ${groupId}`);
  
  const query = nativeDb
    .collection('events')
    .where('groupId', '==', groupId);
  
  const unsubscribe = query.onSnapshot(
    (snapshot: any) => {
      const events: CalendarEvent[] = [];
      snapshot.docs.forEach((doc: any) => {
        events.push({
          ...doc.data(),
          id: doc.id
        } as CalendarEvent);
      });
      
      logger.log(`[subscribeToGroupEvents] ${groupId} 그룹 이벤트 업데이트: ${events.length}개`);
      callback(events);
    },
    (error: any) => {
      logger.error(`[subscribeToGroupEvents] ${groupId} 구독 오류:`, error);
      callback([]);
    }
  );
  
  eventListeners.set(listenerKey, unsubscribe);
  
  return () => {
    logger.log(`[subscribeToGroupEvents] 구독 해제: ${groupId}`);
    unsubscribe();
    eventListeners.delete(listenerKey);
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

/**
 * 다음 반복 날짜 계산
 */
function getNextRecurrenceDate(date: Date, type: RecurrenceType): Date {
  const next = new Date(date);
  switch (type) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

/**
 * 날짜 문자열을 로컬 시간대 Date 객체로 변환 (timezone 문제 방지)
 */
function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day); // 로컬 시간대로 생성
}

/**
 * Date 객체를 YYYY-MM-DD 형식 문자열로 변환 (로컬 시간대 기준)
 */
function formatDateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 반복 일정의 인스턴스들을 생성
 * @param event 마스터 이벤트
 * @param rangeStart 조회 시작일
 * @param rangeEnd 조회 종료일
 * @returns 해당 범위 내 인스턴스 배열
 */
export function generateRecurringInstances(
  event: CalendarEvent,
  rangeStart: Date,
  rangeEnd: Date
): CalendarEvent[] {
  // 반복 설정이 없거나 'none'이면 원본 이벤트만 반환
  if (!event.recurrence || event.recurrence.type === 'none') {
    return [event];
  }

  // 이미 가상 인스턴스인 경우 그대로 반환 (중복 생성 방지)
  if (event.isRecurringInstance) {
    return [event];
  }

  const instances: CalendarEvent[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 로컬 시간대로 날짜 파싱 (timezone 문제 방지)
  let currentDate = parseDateString(event.startDate);

  // 다일 일정인 경우, 원본 일정의 기간(일 수) 계산
  const originalStartDate = parseDateString(event.startDate);
  const originalEndDate = parseDateString(event.endDate);
  const daysDiff = Math.round((originalEndDate.getTime() - originalStartDate.getTime()) / (1000 * 60 * 60 * 24));

  // 종료일 계산: 반복 종료일이 있으면 그 날짜, 없으면 조회 범위 끝
  const recurrenceEndDate = event.recurrence.endDate
    ? parseDateString(event.recurrence.endDate)
    : rangeEnd;

  // 최대 반복 횟수 제한 (무한 루프 방지)
  const MAX_INSTANCES = 500;
  let instanceCount = 0;

  while (currentDate <= recurrenceEndDate && currentDate <= rangeEnd && instanceCount < MAX_INSTANCES) {
    // 오늘 이후 && 조회 범위 내인 경우만 추가
    if (currentDate >= today && currentDate >= rangeStart) {
      const dateStr = formatDateToString(currentDate);

      // 다일 일정인 경우 종료일도 같은 기간만큼 이동
      let instanceEndDate = dateStr;
      if (daysDiff > 0) {
        const endDate = new Date(currentDate);
        endDate.setDate(endDate.getDate() + daysDiff);
        instanceEndDate = formatDateToString(endDate);
      }

      instances.push({
        ...event,
        startDate: dateStr,
        endDate: instanceEndDate,
        isRecurringInstance: true,
        masterEventId: event.id,
        id: `${event.id}_${dateStr}` // 가상 ID
      });
      instanceCount++;
    }

    // 다음 반복 날짜 계산
    currentDate = getNextRecurrenceDate(currentDate, event.recurrence.type);
  }

  return instances;
}

// 단일 export로 통합
export default {
  addEvent,
  updateEvent,
  deleteEvent,
  getUserEvents,
  getEventsForMonth,
  getEventsForDateRange,
  getUserGroups,
  subscribeToUserEvents,
  subscribeToGroupEvents,
  clearEventSubscriptions,
  registerGlobalEventCallback,
  expandMultiDayEvent,
  generateRecurringInstances
};
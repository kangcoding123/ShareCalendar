// contexts/EventContext.tsx
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  CalendarEvent,
  subscribeToUserEvents,
  clearEventSubscriptions,
  registerGlobalEventCallback,
  getUserGroups,
  generateRecurringInstances
} from '../services/calendarService';
import { useAuth } from './AuthContext';
import { cacheService } from '../services/cacheService';
import { groupEventsByDate } from '../utils/dateUtils';
import { logger } from '../utils/logger';

interface EventContextType {
  events: CalendarEvent[];
  todayEvents: CalendarEvent[];
  upcomingEvents: CalendarEvent[];
  groups: any[];
  isLoading: boolean;
  error: string | null;
  updateEvents: (events: CalendarEvent[]) => void;
  refreshEvents: () => Promise<void>;
  refreshGroups: () => Promise<void>;
  refreshAll: () => Promise<void>;
  resubscribeToEvents: () => Promise<void>;
  groupedEvents: { [key: string]: CalendarEvent[] };
  setEvents: (events: CalendarEvent[]) => void;
  setGroupedEvents: (groupedEvents: { [key: string]: CalendarEvent[] }) => void;
  setIsFromCache: (isFromCache: boolean) => void;
  isFromCache: boolean;
  updateGroupColor: (groupId: string, color: string) => void;
}

const EventContext = createContext<EventContextType | null>(null);

export const useEvents = () => {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error('useEvents must be used within EventProvider');
  }
  return context;
};

export const EventProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [groupedEvents, setGroupedEvents] = useState<{ [key: string]: CalendarEvent[] }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const callbackUnregisterRef = useRef<(() => void) | null>(null);
  const isInitializedRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);  // 마지막 처리된 userId 추적

  // 오늘 날짜와 예정된 이벤트 필터링 (안전성 강화)
  const filterEvents = (allEvents: CalendarEvent[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    const todayEvts = allEvents.filter(event => {
      // 날짜 데이터 검증
      if (!event.startDate) return false;
      
      try {
        const eventDate = new Date(event.startDate);
        // 날짜가 유효한지 체크
        if (isNaN(eventDate.getTime())) return false;
        
        eventDate.setHours(0, 0, 0, 0);
        return eventDate.toISOString().split('T')[0] === todayStr;
      } catch (error) {
        logger.warn('[EventContext] Invalid date in event:', event.id, event.startDate);
        return false;
      }
    });

    const upcomingEvts = allEvents.filter(event => {
      // 날짜 데이터 검증
      if (!event.startDate) return false;
      
      try {
        const eventDate = new Date(event.startDate);
        // 날짜가 유효한지 체크
        if (isNaN(eventDate.getTime())) return false;
        
        eventDate.setHours(0, 0, 0, 0);
        return eventDate > today;
      } catch (error) {
        logger.warn('[EventContext] Invalid date in event:', event.id, event.startDate);
        return false;
      }
    }).sort((a, b) => {
      try {
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      } catch {
        return 0;
      }
    });

    setTodayEvents(todayEvts);
    setUpcomingEvents(upcomingEvts);
  };

  // cleanup 함수
  const cleanup = () => {
    // 콜백 해제
    if (callbackUnregisterRef.current) {
      try {
        callbackUnregisterRef.current();
      } catch (error) {
        logger.error('[EventContext] 콜백 해제 오류:', error);
      }
      callbackUnregisterRef.current = null;
    }

    // 구독 해제
    if (unsubscribeRef.current) {
      if (typeof unsubscribeRef.current === 'function') {
        try {
          unsubscribeRef.current();
        } catch (error) {
          logger.error('[EventContext] cleanup 오류:', error);
        }
      } else {
        logger.warn('[EventContext] unsubscribeRef is not a function:', unsubscribeRef.current);
      }
      unsubscribeRef.current = null;
    }

    isInitializedRef.current = false;

    // 상태 초기화
    setEvents([]);
    setTodayEvents([]);
    setUpcomingEvents([]);
    setGroupedEvents({});
    setGroups([]);
  };

  // 이벤트 데이터 정규화 및 검증 함수
  const validateEvents = (events: CalendarEvent[]): CalendarEvent[] => {
    // 반복 일정 확장을 위한 범위 설정 (오늘 ~ 50개월 후)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(today);
    rangeEnd.setMonth(rangeEnd.getMonth() + 50);

    return events
      .map(event => {
        // 오래된 형식(date 필드) -> 새 형식(startDate 필드)으로 변환
        if (!event.startDate && (event as any).date) {
          return {
            ...event,
            startDate: (event as any).date,
            endDate: (event as any).date,
          };
        }
        return event;
      })
      .filter(event => {
        // 필수 필드 체크
        if (!event || !event.startDate) {
          return false;
        }

        // 날짜 유효성 체크
        try {
          const date = new Date(event.startDate);
          if (isNaN(date.getTime())) {
            return false;
          }

          // 날짜 범위 체크 (1900년 ~ 2100년)
          const year = date.getFullYear();
          if (year < 1900 || year > 2100) {
            return false;
          }

          return true;
        } catch (error) {
          return false;
        }
      })
      // 반복 일정 확장
      .flatMap(event => {
        // 반복 설정이 있고 아직 가상 인스턴스가 아닌 경우에만 확장
        if (event.recurrence && event.recurrence.type !== 'none' && !event.isRecurringInstance) {
          logger.log('[EventContext] 반복 일정 발견:', event.title, 'recurrence:', JSON.stringify(event.recurrence));
          return generateRecurringInstances(event, today, rangeEnd);
        }
        return [event];
      });
  };

  // updateEvents 함수 - 검증 추가
  const updateEvents = (newEvents: CalendarEvent[]) => {
    const validEvents = validateEvents(newEvents);
    setEvents(validEvents);
    filterEvents(validEvents);
    setGroupedEvents(groupEventsByDate(validEvents));
  };

  useEffect(() => {
    if (!user?.uid || !isAuthenticated) {
      cleanup();
      lastUserIdRef.current = null;
      return;
    }

    // 같은 userId로 이미 초기화된 경우 스킵 (중복 호출 방지)
    if (isInitializedRef.current && lastUserIdRef.current === user.uid) {
      logger.log('[EventContext] 동일 사용자로 이미 초기화됨 - 스킵');
      return;
    }

    logger.log('[EventContext] 데이터 초기화 시작 - userId:', user.uid);

    const initializeData = async () => {
      isInitializedRef.current = true;
      lastUserIdRef.current = user.uid;

      // 1. 캐시에서 먼저 로드
      try {
        const cachedEvents = await cacheService.loadEventsFromCache(user.uid);
        const cachedGroups = await cacheService.loadGroupsFromCache(user.uid);
        
        if (cachedEvents.length > 0) {
          const validCachedEvents = validateEvents(cachedEvents);
          console.log(`[EventContext] 캐시에서 ${validCachedEvents.length}개 유효한 이벤트 로드`);
          setEvents(validCachedEvents);
          filterEvents(validCachedEvents);
          setGroupedEvents(groupEventsByDate(validCachedEvents));
          setIsFromCache(true);
        }
        
        if (cachedGroups.length > 0) {
          setGroups(cachedGroups);
          console.log(`[EventContext] 캐시에서 ${cachedGroups.length}개 그룹 로드`);
        }
      } catch (error) {
        logger.error('[EventContext] 캐시 로드 오류:', error);
      }

      // 2. 그룹 데이터 서버에서 가져오기
      await refreshGroups();

      // 3. 이벤트 실시간 구독 (글로벌 콜백 등록)
      logger.log('[EventContext] 이벤트 구독 설정');

      try {
        // 기존 콜백이 있으면 먼저 해제
        if (callbackUnregisterRef.current) {
          callbackUnregisterRef.current();
          callbackUnregisterRef.current = null;
        }

        // 글로벌 이벤트 콜백 등록 (한 번만)
        const unregister = registerGlobalEventCallback((updatedEvents: CalendarEvent[]) => {
          // 이벤트 검증
          const validEvents = validateEvents(updatedEvents);

          setEvents(validEvents);
          filterEvents(validEvents);
          setGroupedEvents(groupEventsByDate(validEvents));
          setIsFromCache(false);
        });

        // 콜백 해제 함수 저장
        callbackUnregisterRef.current = unregister;

        // 실제 구독 시작
        const unsubscribe = await subscribeToUserEvents(user.uid, true);

        if (typeof unsubscribe === 'function') {
          unsubscribeRef.current = unsubscribe;
        }
      } catch (error) {
        logger.error('[EventContext] 구독 설정 오류:', error);
        unsubscribeRef.current = null;
      }
    };

    initializeData();

    return cleanup;
  }, [user, isAuthenticated]);

  // 로그아웃 시 데이터 초기화
  useEffect(() => {
    if (!user) {
      logger.log('[EventContext] 로그아웃 시 데이터 초기화');
      cleanup();
    }
  }, [user]);

  // 그룹 데이터 새로고침
  const refreshGroups = async () => {
    if (!user?.uid) return;

    try {
      logger.log('[EventContext] 그룹 새로고침 시작');
      const userGroups = await getUserGroups(user.uid);
      setGroups(userGroups);
      console.log(`[EventContext] ${userGroups.length}개 그룹 로드 완료`);
    } catch (error) {
      logger.error('[EventContext] 그룹 로드 오류:', error);
    }
  };

  // 이벤트 새로고침
  const refreshEvents = async () => {
    if (!user?.uid) return;

    try {
      setIsLoading(true);

      // 기존 구독 해제
      if (unsubscribeRef.current && typeof unsubscribeRef.current === 'function') {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      // 콜백은 이미 등록되어 있으므로 새로 등록하지 않음
      // 구독만 새로 시작
      const unsubscribe = await subscribeToUserEvents(user.uid, true);

      if (typeof unsubscribe === 'function') {
        unsubscribeRef.current = unsubscribe;
      }
    } catch (error: any) {
      logger.error('[EventContext] 이벤트 새로고침 오류:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 모든 데이터 새로고침 (이벤트 + 그룹)
  const refreshAll = async () => {
    await Promise.all([
      refreshEvents(),
      refreshGroups()
    ]);
  };

  // 그룹 가입/생성 후 리스너 재설정 (새 그룹 이벤트 실시간 동기화용)
  const resubscribeToEvents = async () => {
    if (!user?.uid) return;

    logger.log('[EventContext] 이벤트 리스너 재설정 시작 (그룹 변경됨)');

    try {
      // 기존 구독 해제
      if (unsubscribeRef.current && typeof unsubscribeRef.current === 'function') {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      // 새로 구독 시작 (새 그룹 포함)
      const unsubscribe = await subscribeToUserEvents(user.uid, true);

      if (typeof unsubscribe === 'function') {
        unsubscribeRef.current = unsubscribe;
      }

      logger.log('[EventContext] 이벤트 리스너 재설정 완료');
    } catch (error) {
      logger.error('[EventContext] 리스너 재설정 오류:', error);
    }
  };

  // 그룹 색상 즉시 업데이트 (캘린더 그룹 선택 UI에 바로 반영)
  const updateGroupColor = (groupId: string, color: string) => {
    setGroups(prevGroups =>
      prevGroups.map(group =>
        group.id === groupId ? { ...group, color } : group
      )
    );
    logger.log(`[EventContext] 그룹 ${groupId}의 색상이 ${color}로 업데이트되었습니다`);
  };

  const value: EventContextType = {
    events,
    todayEvents,
    upcomingEvents,
    groups,
    isLoading,
    error,
    updateEvents,
    refreshEvents,
    refreshGroups,
    refreshAll,
    resubscribeToEvents,
    groupedEvents,
    setEvents,
    setGroupedEvents,
    setIsFromCache,
    isFromCache,
    updateGroupColor
  };

  return (
    <EventContext.Provider value={value}>
      {children}
    </EventContext.Provider>
  );
};

export default EventContext;
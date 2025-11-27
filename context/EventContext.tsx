// contexts/EventContext.tsx
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  CalendarEvent, 
  subscribeToUserEvents, 
  clearEventSubscriptions,
  registerGlobalEventCallback,
  getUserGroups 
} from '../services/calendarService';
import { useAuth } from './AuthContext';
import { cacheService } from '../services/cacheService';

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
  groupedEvents: { [key: string]: CalendarEvent[] };
  setEvents: (events: CalendarEvent[]) => void;
  setGroupedEvents: (groupedEvents: { [key: string]: CalendarEvent[] }) => void;
  setIsFromCache: (isFromCache: boolean) => void;
  isFromCache: boolean;
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
  const isInitializedRef = useRef(false);

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
        console.warn('[EventContext] Invalid date in event:', event.id, event.startDate);
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
        console.warn('[EventContext] Invalid date in event:', event.id, event.startDate);
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
    // 타입 체크 추가
    if (unsubscribeRef.current) {
      if (typeof unsubscribeRef.current === 'function') {
        try {
          unsubscribeRef.current();
        } catch (error) {
          console.error('[EventContext] cleanup 오류:', error);
        }
      } else {
        console.warn('[EventContext] unsubscribeRef is not a function:', unsubscribeRef.current);
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

  // 이벤트 데이터 검증 함수
  const validateEvents = (events: CalendarEvent[]): CalendarEvent[] => {
    return events.filter(event => {
      // 필수 필드 체크
      if (!event || !event.startDate) {
        console.warn('[EventContext] 잘못된 이벤트 데이터:', event);
        return false;
      }
      
      // 날짜 유효성 체크
      try {
        const date = new Date(event.startDate);
        if (isNaN(date.getTime())) {
          console.warn('[EventContext] 잘못된 날짜:', event.id, event.startDate);
          return false;
        }
        
        // 날짜 범위 체크 (1900년 ~ 2100년)
        const year = date.getFullYear();
        if (year < 1900 || year > 2100) {
          console.warn('[EventContext] 날짜 범위 초과:', event.id, event.startDate);
          return false;
        }
        
        return true;
      } catch (error) {
        console.warn('[EventContext] 날짜 파싱 오류:', event.id, error);
        return false;
      }
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
    console.log('[EventContext] 데이터 초기화 시작');

    if (!user?.uid || !isAuthenticated) {
      cleanup();
      return;
    }

    const initializeData = async () => {
      if (isInitializedRef.current) {
        console.log('[EventContext] 이미 초기화됨');
        return;
      }

      isInitializedRef.current = true;

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
        console.error('[EventContext] 캐시 로드 오류:', error);
      }

      // 2. 그룹 데이터 서버에서 가져오기
      await refreshGroups();

      // 3. 이벤트 실시간 구독 (글로벌 콜백 등록)
      console.log('[EventContext] 이벤트 구독 설정');
      
      try {
        // 글로벌 이벤트 콜백 등록
        const unregister = registerGlobalEventCallback((updatedEvents: CalendarEvent[]) => {
          console.log(`[EventContext] 실시간 업데이트: ${updatedEvents.length}개 이벤트`);
          
          // 이벤트 검증 추가
          const validEvents = validateEvents(updatedEvents);
          console.log(`[EventContext] 유효한 이벤트: ${validEvents.length}개`);
          
          setEvents(validEvents);
          filterEvents(validEvents);
          setGroupedEvents(groupEventsByDate(validEvents));
          setIsFromCache(false);
        });
        
        // 실제 구독 시작
        const unsubscribe = await subscribeToUserEvents(user.uid, true);
        
        if (typeof unsubscribe === 'function') {
          // 두 개의 cleanup 함수를 합쳐서 저장
          unsubscribeRef.current = () => {
            try {
              unregister();
              unsubscribe();
            } catch (error) {
              console.error('[EventContext] unsubscribe 오류:', error);
            }
          };
        } else {
          unsubscribeRef.current = unregister;
        }
      } catch (error) {
        console.error('[EventContext] 구독 설정 오류:', error);
        unsubscribeRef.current = null;
      }
    };

    initializeData();

    return cleanup;
  }, [user, isAuthenticated]);

  // 로그아웃 시 데이터 초기화
  useEffect(() => {
    if (!user) {
      console.log('[EventContext] 로그아웃 시 데이터 초기화');
      cleanup();
    }
  }, [user]);

  // 그룹 데이터 새로고침
  const refreshGroups = async () => {
    if (!user?.uid) return;

    try {
      console.log('[EventContext] 그룹 새로고침 시작');
      const userGroups = await getUserGroups(user.uid);
      setGroups(userGroups);
      console.log(`[EventContext] ${userGroups.length}개 그룹 로드 완료`);
    } catch (error) {
      console.error('[EventContext] 그룹 로드 오류:', error);
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
      }
      
      // 새로운 구독 시작
      const unregister = registerGlobalEventCallback((updatedEvents: CalendarEvent[]) => {
        const validEvents = validateEvents(updatedEvents);
        console.log(`[EventContext] 이벤트 새로고침: ${validEvents.length}개 유효한 이벤트`);
        setEvents(validEvents);
        filterEvents(validEvents);
        setGroupedEvents(groupEventsByDate(validEvents));
        setIsFromCache(false);
      });
      
      const unsubscribe = await subscribeToUserEvents(user.uid, true);
      
      if (typeof unsubscribe === 'function') {
        unsubscribeRef.current = () => {
          try {
            unregister();
            unsubscribe();
          } catch (error) {
            console.error('[EventContext] refresh unsubscribe 오류:', error);
          }
        };
      } else {
        unsubscribeRef.current = unregister;
      }
    } catch (error: any) {
      console.error('[EventContext] 이벤트 새로고침 오류:', error);
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

  // 날짜별 이벤트 그룹화 (안전성 강화)
  const groupEventsByDate = (eventsToGroup: CalendarEvent[]): { [key: string]: CalendarEvent[] } => {
    const grouped: { [key: string]: CalendarEvent[] } = {};

    eventsToGroup.forEach(event => {
      if (!event.startDate) return;

      const date = event.startDate;
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(event);
    });

    return grouped;
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
    groupedEvents,
    setEvents,
    setGroupedEvents,
    setIsFromCache,
    isFromCache
  };

  return (
    <EventContext.Provider value={value}>
      {children}
    </EventContext.Provider>
  );
};

export default EventContext;
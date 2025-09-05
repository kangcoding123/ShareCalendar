// context/EventContext.tsx
import React, { createContext, useState, useContext, useEffect, useRef, ReactNode, useCallback } from 'react';
import { 
  CalendarEvent, 
  subscribeToUserEvents, 
  getUserEvents 
} from '../services/calendarService';
import { Group, getUserGroups } from '../services/groupService';
import { useAuth } from './AuthContext';
import { groupEventsByDate } from '../utils/dateUtils';
import { cacheService } from '../services/cacheService';

interface EventContextType {
  // 이벤트 관련
  events: CalendarEvent[];
  groupedEvents: Record<string, CalendarEvent[]>;
  
  // 그룹 관련
  groups: Group[];
  
  // 상태
  loading: boolean;
  isFromCache: boolean;
  
  // 액션
  refreshEvents: () => Promise<void>;
  refreshGroups: () => Promise<void>;
  refreshAll: () => Promise<void>;
}

const EventContext = createContext<EventContextType | undefined>(undefined);

export const EventProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  
  // 상태
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [groupedEvents, setGroupedEvents] = useState<Record<string, CalendarEvent[]>>({});
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  
  // 구독 관리
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isInitializedRef = useRef(false);
  const lastRefreshTimeRef = useRef(0);
  
  // ✅ 그룹 새로고침 - useCallback으로 메모이제이션
  const refreshGroups = useCallback(async () => {
    if (!user?.uid) return;
    
    try {
      console.log('[EventContext] 그룹 새로고침 시작');
      
      // 캐시 먼저 확인
      const cachedGroups = await cacheService.loadGroupsFromCache(user.uid);
      if (cachedGroups.length > 0) {
        setGroups(cachedGroups);
      }
      
      // 서버에서 최신 데이터 가져오기
      const result = await getUserGroups(user.uid);
      if (result.success && result.groups) {
        const loadedGroups = result.groups as Group[];
        setGroups(loadedGroups);
        
        // 캐시 업데이트
        await cacheService.saveGroupsToCache(user.uid, loadedGroups);
        console.log(`[EventContext] ${loadedGroups.length}개 그룹 로드 완료`);
      }
    } catch (error) {
      console.error('[EventContext] 그룹 로드 실패:', error);
    }
  }, [user?.uid]); // ✅ user.uid만 dependency로
  
  // ✅ 이벤트 새로고침 - useCallback으로 메모이제이션
  const refreshEvents = useCallback(async () => {
    if (!user?.uid) return;
    
    // 중복 새로고침 방지 (1초 이내)
    const now = Date.now();
    if (now - lastRefreshTimeRef.current < 1000) {
      console.log('[EventContext] 너무 빠른 새로고침 요청 - 스킵');
      return;
    }
    lastRefreshTimeRef.current = now;
    
    try {
      console.log('[EventContext] 이벤트 새로고침 시작');
      setLoading(true);
      
      const result = await getUserEvents(user.uid, true);
      if (result.success && result.events) {
        setEvents(result.events);
        setGroupedEvents(groupEventsByDate(result.events));
        setIsFromCache(false);
        console.log(`[EventContext] ${result.events.length}개 이벤트 새로고침 완료`);
      }
    } catch (error) {
      console.error('[EventContext] 이벤트 새로고침 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]); // ✅ user.uid만 dependency로
  
  // ✅ 전체 새로고침 - useCallback으로 메모이제이션
  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshGroups(),
      refreshEvents()
    ]);
  }, [refreshGroups, refreshEvents]);
  
  // 초기 설정 및 구독
  useEffect(() => {
    // 이전 구독 정리
    const cleanup = () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      isInitializedRef.current = false;
    };
    
    if (user?.uid && !isInitializedRef.current) {
      isInitializedRef.current = true;
      
      const initializeData = async () => {
        console.log('[EventContext] 데이터 초기화 시작');
        
        // 1. 캐시에서 즉시 로드
        const [cachedEvents, cachedGroups] = await Promise.all([
          cacheService.loadEventsFromCache(user.uid),
          cacheService.loadGroupsFromCache(user.uid)
        ]);
        
        if (cachedEvents.length > 0) {
          setEvents(cachedEvents);
          setGroupedEvents(groupEventsByDate(cachedEvents));
          setIsFromCache(true);
          console.log(`[EventContext] 캐시에서 ${cachedEvents.length}개 이벤트 로드`);
        }
        
        if (cachedGroups.length > 0) {
          setGroups(cachedGroups);
          console.log(`[EventContext] 캐시에서 ${cachedGroups.length}개 그룹 로드`);
        }
        
        // 2. 그룹 데이터 서버에서 가져오기
        await refreshGroups();
        
        // 3. 이벤트 실시간 구독 (한 번만!)
        console.log('[EventContext] 이벤트 구독 설정');
        unsubscribeRef.current = subscribeToUserEvents(user.uid, (updatedEvents) => {
          console.log(`[EventContext] 실시간 업데이트: ${updatedEvents.length}개 이벤트`);
          setEvents(updatedEvents);
          setGroupedEvents(groupEventsByDate(updatedEvents));
          setIsFromCache(false);
        });
      };
      
      initializeData();
    } else if (!user) {
      // 로그아웃 시 데이터 초기화
      setEvents([]);
      setGroupedEvents({});
      setGroups([]);
      setLoading(false);
      setIsFromCache(false);
      cleanup();
    }
    
    return cleanup;
  }, [user?.uid, refreshGroups]); // ✅ refreshGroups dependency 추가
  
  const value = {
    events,
    groupedEvents,
    groups,
    loading,
    isFromCache,
    refreshEvents,
    refreshGroups,
    refreshAll
  };
  
  return (
    <EventContext.Provider value={value}>
      {children}
    </EventContext.Provider>
  );
};

// Hook
export const useEvents = () => {
  const context = useContext(EventContext);
  if (context === undefined) {
    throw new Error('useEvents must be used within an EventProvider');
  }
  return context;
};
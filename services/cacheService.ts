// services/cacheService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { CalendarEvent } from './calendarService';
import { Group } from './groupService';
import { format, subMonths, addMonths } from 'date-fns';

// 캐시 키 상수
const CACHE_KEYS = {
  EVENTS_PREFIX: 'events_cache_',
  GROUPS: 'groups_cache',
  LAST_SYNC: 'last_sync',
  OFFLINE_QUEUE: 'offline_queue',
};

// 캐시 설정
const CACHE_CONFIG = {
  MAX_MONTHS: 3, // 최근 3개월 데이터 보관
  SYNC_INTERVAL: 5 * 60 * 1000, // 5분마다 동기화
};

// 오프라인 작업 타입
type OfflineAction = {
  id: string;
  type: 'add' | 'update' | 'delete';
  collection: 'events' | 'groups';
  data: any;
  timestamp: number;
};

class CacheService {
  private isOnline: boolean = true;
  private syncTimer: NodeJS.Timeout | null = null;
  private unsubscribeNetInfo: (() => void) | null = null;

  constructor() {
    this.initNetworkListener();
  }

  // 네트워크 상태 감지 초기화
  private initNetworkListener() {
    this.unsubscribeNetInfo = NetInfo.addEventListener(state => {
      const wasOffline = !this.isOnline;
      this.isOnline = state.isConnected ?? false;
      
      console.log(`[CacheService] 네트워크 상태: ${this.isOnline ? '온라인' : '오프라인'}`);
      
      // 오프라인에서 온라인으로 전환 시 동기화
      if (wasOffline && this.isOnline) {
        console.log('[CacheService] 온라인 복귀 - 동기화 시작');
        this.syncOfflineData();
      }
    });
  }

  // 서비스 종료 시 정리
  cleanup() {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
    }
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
  }

  // 🔥 이벤트 캐시 저장
  async saveEventsToCache(userId: string, events: CalendarEvent[]): Promise<void> {
    try {
      const now = new Date();
      const startMonth = subMonths(now, CACHE_CONFIG.MAX_MONTHS);
      
      // 월별로 이벤트 그룹화
      const eventsByMonth: Record<string, CalendarEvent[]> = {};
      
      events.forEach(event => {
        const eventDate = new Date(event.startDate);
        
        // 최근 3개월 이내의 이벤트만 저장
        if (eventDate >= startMonth) {
          const monthKey = format(eventDate, 'yyyy-MM');
          if (!eventsByMonth[monthKey]) {
            eventsByMonth[monthKey] = [];
          }
          eventsByMonth[monthKey].push(event);
        }
      });
      
      // 각 월별로 AsyncStorage에 저장
      const savePromises = Object.entries(eventsByMonth).map(([monthKey, monthEvents]) => {
        const cacheKey = `${CACHE_KEYS.EVENTS_PREFIX}${userId}_${monthKey}`;
        return AsyncStorage.setItem(cacheKey, JSON.stringify(monthEvents));
      });
      
      await Promise.all(savePromises);
      
      // 마지막 동기화 시간 저장
      await AsyncStorage.setItem(CACHE_KEYS.LAST_SYNC, new Date().toISOString());
      
      console.log(`[CacheService] ${Object.keys(eventsByMonth).length}개월 이벤트 캐시 저장 완료`);
    } catch (error) {
      console.error('[CacheService] 이벤트 캐시 저장 실패:', error);
    }
  }

  // 🔥 캐시에서 이벤트 로드
  async loadEventsFromCache(userId: string): Promise<CalendarEvent[]> {
    try {
      const now = new Date();
      const events: CalendarEvent[] = [];
      
      // 최근 3개월 데이터 로드
      for (let i = 0; i < CACHE_CONFIG.MAX_MONTHS; i++) {
        const monthDate = subMonths(now, i);
        const monthKey = format(monthDate, 'yyyy-MM');
        const cacheKey = `${CACHE_KEYS.EVENTS_PREFIX}${userId}_${monthKey}`;
        
        const cachedData = await AsyncStorage.getItem(cacheKey);
        if (cachedData) {
          const monthEvents = JSON.parse(cachedData) as CalendarEvent[];
          events.push(...monthEvents);
        }
      }
      
      console.log(`[CacheService] 캐시에서 ${events.length}개 이벤트 로드`);
      return events;
    } catch (error) {
      console.error('[CacheService] 이벤트 캐시 로드 실패:', error);
      return [];
    }
  }

  // 🔥 특정 월의 이벤트만 캐시에서 로드
  async loadMonthEventsFromCache(
    userId: string, 
    year: number, 
    month: number
  ): Promise<CalendarEvent[]> {
    try {
      const monthKey = format(new Date(year, month), 'yyyy-MM');
      const cacheKey = `${CACHE_KEYS.EVENTS_PREFIX}${userId}_${monthKey}`;
      
      const cachedData = await AsyncStorage.getItem(cacheKey);
      if (cachedData) {
        return JSON.parse(cachedData) as CalendarEvent[];
      }
      
      return [];
    } catch (error) {
      console.error('[CacheService] 월별 이벤트 캐시 로드 실패:', error);
      return [];
    }
  }

  // 🔥 그룹 캐시 저장
  async saveGroupsToCache(userId: string, groups: Group[]): Promise<void> {
    try {
      const cacheKey = `${CACHE_KEYS.GROUPS}_${userId}`;
      await AsyncStorage.setItem(cacheKey, JSON.stringify(groups));
      console.log(`[CacheService] ${groups.length}개 그룹 캐시 저장 완료`);
    } catch (error) {
      console.error('[CacheService] 그룹 캐시 저장 실패:', error);
    }
  }

  // 🔥 캐시에서 그룹 로드
  async loadGroupsFromCache(userId: string): Promise<Group[]> {
    try {
      const cacheKey = `${CACHE_KEYS.GROUPS}_${userId}`;
      const cachedData = await AsyncStorage.getItem(cacheKey);
      
      if (cachedData) {
        return JSON.parse(cachedData) as Group[];
      }
      
      return [];
    } catch (error) {
      console.error('[CacheService] 그룹 캐시 로드 실패:', error);
      return [];
    }
  }

  // 🔥 오프라인 작업 큐에 추가
  async addToOfflineQueue(action: Omit<OfflineAction, 'id' | 'timestamp'>): Promise<void> {
    try {
      const queue = await this.getOfflineQueue();
      const newAction: OfflineAction = {
        ...action,
        id: `${Date.now()}_${Math.random()}`,
        timestamp: Date.now(),
      };
      
      queue.push(newAction);
      await AsyncStorage.setItem(CACHE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
      
      console.log(`[CacheService] 오프라인 작업 추가: ${action.type} ${action.collection}`);
    } catch (error) {
      console.error('[CacheService] 오프라인 큐 추가 실패:', error);
    }
  }

  // 오프라인 큐 가져오기
  private async getOfflineQueue(): Promise<OfflineAction[]> {
    try {
      const queueData = await AsyncStorage.getItem(CACHE_KEYS.OFFLINE_QUEUE);
      return queueData ? JSON.parse(queueData) : [];
    } catch (error) {
      console.error('[CacheService] 오프라인 큐 로드 실패:', error);
      return [];
    }
  }

  // 🔥 오프라인 데이터 동기화
  async syncOfflineData(): Promise<void> {
    if (!this.isOnline) {
      console.log('[CacheService] 오프라인 상태 - 동기화 건너뜀');
      return;
    }

    try {
      const queue = await this.getOfflineQueue();
      
      if (queue.length === 0) {
        console.log('[CacheService] 동기화할 오프라인 작업 없음');
        return;
      }
      
      console.log(`[CacheService] ${queue.length}개 오프라인 작업 동기화 시작`);
      
      // TODO: 실제 Firebase 동기화 로직 구현
      // 여기서는 calendarService와 groupService의 함수들을 호출하여
      // 오프라인 동안 쌓인 작업들을 처리합니다.
      
      // 동기화 완료 후 큐 비우기
      await AsyncStorage.setItem(CACHE_KEYS.OFFLINE_QUEUE, JSON.stringify([]));
      
      console.log('[CacheService] 오프라인 작업 동기화 완료');
    } catch (error) {
      console.error('[CacheService] 오프라인 동기화 실패:', error);
    }
  }

  // 🔥 캐시 정리 (오래된 데이터 삭제)
  async cleanupOldCache(userId: string): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const eventKeys = keys.filter(key => key.startsWith(`${CACHE_KEYS.EVENTS_PREFIX}${userId}_`));
      
      const now = new Date();
      const oldestMonth = subMonths(now, CACHE_CONFIG.MAX_MONTHS);
      const oldestMonthKey = format(oldestMonth, 'yyyy-MM');
      
      const keysToDelete = eventKeys.filter(key => {
        const monthKey = key.split('_').pop() || '';
        return monthKey < oldestMonthKey;
      });
      
      if (keysToDelete.length > 0) {
        await AsyncStorage.multiRemove(keysToDelete);
        console.log(`[CacheService] ${keysToDelete.length}개 오래된 캐시 삭제`);
      }
    } catch (error) {
      console.error('[CacheService] 캐시 정리 실패:', error);
    }
  }

  // 🔥 마지막 동기화 시간 확인
  async getLastSyncTime(): Promise<Date | null> {
    try {
      const lastSync = await AsyncStorage.getItem(CACHE_KEYS.LAST_SYNC);
      return lastSync ? new Date(lastSync) : null;
    } catch (error) {
      console.error('[CacheService] 마지막 동기화 시간 로드 실패:', error);
      return null;
    }
  }

  // 네트워크 상태 확인
  getIsOnline(): boolean {
    return this.isOnline;
  }

  // 🔥 전체 캐시 삭제 (로그아웃 시 사용)
  async clearAllCache(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => 
        key.startsWith(CACHE_KEYS.EVENTS_PREFIX) || 
        key.startsWith(CACHE_KEYS.GROUPS) ||
        key === CACHE_KEYS.LAST_SYNC ||
        key === CACHE_KEYS.OFFLINE_QUEUE
      );
      
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
        console.log(`[CacheService] 모든 캐시 삭제 완료 (${cacheKeys.length}개)`);
      }
    } catch (error) {
      console.error('[CacheService] 캐시 삭제 실패:', error);
    }
  }
}

// 싱글톤 인스턴스 export
export const cacheService = new CacheService();
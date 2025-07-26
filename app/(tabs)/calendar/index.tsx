// app/(tabs)/calendar/index.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, 
  StyleSheet, 
  ActivityIndicator, 
  RefreshControl, 
  ScrollView, 
  Text,
  Platform,
  TouchableOpacity
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo'; // 🔥 추가
import { useAuth } from '../../../context/AuthContext';
import { 
  CalendarEvent, 
  getUserEvents, 
  subscribeToUserEvents,
  getEventsForMonth 
} from '../../../services/calendarService';
import { Group, getUserGroups } from '../../../services/groupService';
import { groupEventsByDate, CalendarDay } from '../../../utils/dateUtils';
import { onSnapshot, query, collection, where } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { cacheService } from '../../../services/cacheService'; // 🔥 추가

// 컴포넌트
import Calendar from '../../../components/calendar/Calendar';
import CalendarPager from '../../../components/calendar/CalendarPager';
import EventDetailModal from '../../../components/calendar/EventDetailModal';
import MemoizedAdBanner from '@/components/MemoizedAdBanner';

function CalendarScreen() {
  const { user } = useAuth();
  const router = useRouter();
  
  // 색상 테마 설정
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState<Record<string, CalendarEvent[]>>({});
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedDate, setSelectedDate] = useState<CalendarDay | null>(null);
  const [selectedDateEvents, setSelectedDateEvents] = useState<CalendarEvent[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  
  // 데이터 로드 실패 상태 추가
  const [loadFailed, setLoadFailed] = useState(false);
  
  // 🔥 오프라인 상태 추가
  const [isFromCache, setIsFromCache] = useState(false);
  const [isOnline, setIsOnline] = useState(true); // 🔥 네트워크 상태
  
  // 구독 취소 함수 참조 저장
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const groupsUnsubscribeRef = useRef<(() => void) | null>(null);
  
  // 🔥 월별 구독 관리
  const monthSubscriptionRef = useRef<(() => void) | null>(null);
  const currentSubscribedMonth = useRef<string | null>(null);
  
  // ScrollView ref 추가
  const scrollRef = useRef(null);
  
  // 현재 보고 있는 달을 위한 상태 변수
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  
  // 🔥 마지막 새로고침 시간 추적
  const lastRefreshTime = useRef<number>(0);

  // 🔥 네트워크 상태 감지
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? false);
    });

    return () => unsubscribe();
  }, []);

  // 🔥 월 변경 핸들러 - 구독 전환 포함
  const handleMonthChange = useCallback((month: Date) => {
    setCurrentMonth(prev => {
      if (prev.getFullYear() === month.getFullYear() && prev.getMonth() === month.getMonth()) {
        return prev;
      }
      
      console.log(`[CalendarScreen] 월 변경: ${format(month, 'yyyy-MM')}`);
      
      // 🔥 월별 구독 전환
      if (user && user.uid) {
        subscribeToMonthEvents(user.uid, month);
      }
      
      return month;
    });
  }, [user]);
  
  // 🔥 특정 월 이벤트만 구독하는 함수
  const subscribeToMonthEvents = useCallback(async (userId: string, month: Date) => {
    const monthKey = format(month, 'yyyy-MM');
    
    // 이미 같은 월을 구독 중이면 스킵
    if (currentSubscribedMonth.current === monthKey) {
      console.log(`[subscribeToMonthEvents] 이미 ${monthKey} 구독 중`);
      return;
    }
    
    // 기존 구독 해제
    if (monthSubscriptionRef.current) {
      console.log(`[subscribeToMonthEvents] 기존 구독 해제`);
      monthSubscriptionRef.current();
      monthSubscriptionRef.current = null;
    }
    
    currentSubscribedMonth.current = monthKey;
    console.log(`[subscribeToMonthEvents] ${monthKey} 구독 시작`);
    
    // 해당 월의 날짜 범위 계산
    const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const startDate = format(startOfMonth, 'yyyy-MM-dd');
    const endDate = format(endOfMonth, 'yyyy-MM-dd');
    
    // 🔥 먼저 캐시된 데이터 또는 전체 데이터에서 해당 월 필터링
    const monthEvents = await getEventsForMonth(userId, month.getFullYear(), month.getMonth());
    if (monthEvents.success && monthEvents.events) {
      const groupedEvents = groupEventsByDate<CalendarEvent>(monthEvents.events);
      setEvents(prev => ({
        ...prev,
        ...groupedEvents
      }));
      
      // 🔥 캐시에서 로드된 경우 표시
      if (monthEvents.isFromCache) {
        setIsFromCache(true);
      }
    }
    
    // 🔥 오프라인 상태에서는 실시간 구독 스킵
    if (!cacheService.getIsOnline()) {
      console.log('[subscribeToMonthEvents] 오프라인 상태 - 실시간 구독 스킵');
      return;
    }
    
    // 🔥 실시간 구독은 현재 월만
    const eventsQuery = query(
      collection(db, 'events'),
      where('startDate', '>=', startDate),
      where('startDate', '<=', endDate)
    );
    
    const unsubscribe = onSnapshot(eventsQuery, async (snapshot) => {
      console.log(`[subscribeToMonthEvents] ${monthKey} 이벤트 변경 감지`);
      
      // 전체 이벤트 다시 로드 (캐시 활용)
      const result = await getUserEvents(userId);
      if (result.success && result.events) {
        const groupedEvents = groupEventsByDate<CalendarEvent>(result.events);
        setEvents(groupedEvents);
        setIsFromCache(false); // 🔥 실시간 데이터로 업데이트됨
        
        // 선택된 날짜의 이벤트도 업데이트
        if (selectedDate) {
          const dateStr = selectedDate.formattedDate;
          const dateEvents = groupedEvents[dateStr] || [];
          setSelectedDateEvents(dateEvents);
        }
      }
    }, (error) => {
      console.error('[subscribeToMonthEvents] 구독 오류:', error);
      // 🔥 오류 시 캐시 데이터 유지
    });
    
    monthSubscriptionRef.current = unsubscribe;
  }, [selectedDate]);
  
  // 그룹 멤버십 변경 감지 및 구독 설정
  const setupGroupMembershipListener = useCallback((userId: string) => {
    if (groupsUnsubscribeRef.current) {
      groupsUnsubscribeRef.current();
    }
    
    // 🔥 오프라인 상태에서는 실시간 구독 스킵
    if (!cacheService.getIsOnline()) {
      console.log('[setupGroupMembershipListener] 오프라인 상태 - 실시간 구독 스킵');
      return () => {};
    }
    
    const membershipQuery = query(
      collection(db, 'groupMembers'),
      where('userId', '==', userId)
    );
    
    const unsubscribe = onSnapshot(membershipQuery, () => {
      console.log('그룹 멤버십 변경 감지 - 그룹 목록 새로고침');
      loadGroupData();
    }, (error) => {
      console.error('그룹 멤버십 리스너 오류:', error);
    });
    
    groupsUnsubscribeRef.current = unsubscribe;
    return unsubscribe;
  }, []);
  
  // 데이터 로드 - 그룹만 로드
  const loadGroupData = useCallback(async () => {
    try {
      if (!user || !user.uid) return;
      
      console.log('[loadGroupData] 그룹 데이터 로드 시작');
      
      // 🔥 오프라인 상태에서는 캐시에서 로드
      if (!cacheService.getIsOnline()) {
        const cachedGroups = await cacheService.loadGroupsFromCache(user.uid);
        if (cachedGroups.length > 0) {
          console.log(`[loadGroupData] 캐시에서 ${cachedGroups.length}개 그룹 로드`);
          setGroups(cachedGroups);
          return;
        }
      }
      
      const groupsResult = await getUserGroups(user.uid);
      
      if (groupsResult.success && Array.isArray(groupsResult.groups)) {
        console.log(`[loadGroupData] 그룹 ${groupsResult.groups.length}개 로드됨`);
        const loadedGroups = groupsResult.groups as Group[];
        setGroups(loadedGroups);
        
        // 🔥 캐시에 저장
        await cacheService.saveGroupsToCache(user.uid, loadedGroups);
      } else {
        console.error('그룹 로드 실패:', groupsResult.error);
        
        // 🔥 실패 시 캐시 데이터 사용
        const cachedGroups = await cacheService.loadGroupsFromCache(user.uid);
        if (cachedGroups.length > 0) {
          setGroups(cachedGroups);
        }
      }
    } catch (error) {
      console.error('그룹 데이터 로드 중 오류:', error);
      
      // 🔥 오류 시 캐시 데이터 사용
      if (user?.uid) {
        const cachedGroups = await cacheService.loadGroupsFromCache(user.uid);
        if (cachedGroups.length > 0) {
          setGroups(cachedGroups);
        }
      }
    }
  }, [user]);

  // 🔥 이벤트 데이터 로드 함수 최적화 - 전체 로드 대신 필요한 월만
  const loadEvents = useCallback(async (forceRefresh: boolean = false) => {
    // 비로그인 상태일 경우
    if (!user) {
      setEvents({});
      setLoading(false);
      setRefreshing(false);
      return;
    }
    
    try {
      setLoading(true);
      
      // 🔥 강제 새로고침이 아니고 최근에 로드했으면 스킵
      if (!forceRefresh && Date.now() - lastRefreshTime.current < 60000) {
        console.log('[loadEvents] 최근에 로드함, 스킵');
        setLoading(false);
        setRefreshing(false);
        return;
      }
      
      // 전체 이벤트 로드 (캐시 활용됨)
      const result = await getUserEvents(user.uid);
      
      if (result.success && Array.isArray(result.events)) {
        const groupedEvents = groupEventsByDate<CalendarEvent>(result.events);
        setEvents(groupedEvents);
        
        // 🔥 캐시에서 로드된 경우 표시
        if (result.isFromCache) {
          setIsFromCache(true);
          console.log('[loadEvents] 캐시에서 데이터 로드됨');
        } else {
          setIsFromCache(false);
        }
        
        if (selectedDate) {
          const dateStr = selectedDate.formattedDate;
          const dateEvents = groupedEvents[dateStr] || [];
          setSelectedDateEvents(dateEvents);
        }
        
        setLoadFailed(false);
        lastRefreshTime.current = Date.now();
        console.log(`[loadEvents] 성공: 총 ${result.events.length}개 일정 로드됨`);
      } else {
        console.log('[loadEvents] 로드 실패');
        setLoadFailed(true);
      }
    } catch (error) {
      console.error('[loadEvents] 오류:', error);
      setLoadFailed(true);
    }
    
    setLoading(false);
    setRefreshing(false);
  }, [user, selectedDate]);

  // 🔥 화면이 포커스될 때 - 조건부 새로고침
  useFocusEffect(
    useCallback(() => {
      if (user) {
        console.log('캘린더 화면 포커스');
        
        // 🔥 앱 시작 시 오래된 캐시 정리
        cacheService.cleanupOldCache(user.uid);
        
        // 1분 이상 지났을 때만 새로고침
        const shouldRefresh = Date.now() - lastRefreshTime.current > 60000;
        if (shouldRefresh) {
          setRefreshing(true);
          loadEvents(true);
        }
      }
      return () => {};
    }, [user, loadEvents])
  );

  // 디버깅용 정보 로그
  useEffect(() => {
    console.log(`[디버깅] Platform: ${Platform.OS}, isEmulator: ${__DEV__}, colorScheme: ${colorScheme}`);
  }, [colorScheme]);
  
  // 🔥 초기 데이터 로드 및 실시간 구독 설정 - 수정됨
  useEffect(() => {
    if (user && user.uid) {
      setLoading(true);
      
      // 그룹 데이터 로드
      loadGroupData();
      const groupsUnsubscribe = setupGroupMembershipListener(user.uid);
      
      // 🔥 초기 이벤트 로드
      loadEvents(true).then(() => {
        // 🔥 현재 월만 실시간 구독
        subscribeToMonthEvents(user.uid, currentMonth);
      });
      
      return () => {
        console.log('[CalendarScreen] 구독 해제');
        
        // 월별 구독 해제
        if (monthSubscriptionRef.current) {
          monthSubscriptionRef.current();
          monthSubscriptionRef.current = null;
        }
        
        if (groupsUnsubscribeRef.current) {
          groupsUnsubscribeRef.current();
          groupsUnsubscribeRef.current = null;
        }
      };
    } else {
      // 로그인하지 않은 경우
      loadEvents();
    }
  }, [user, loadGroupData, setupGroupMembershipListener, loadEvents, subscribeToMonthEvents, currentMonth]);
  
  // 사용자가 변경되거나 null이 될 때 상태 초기화
  useEffect(() => {
    if (!user) {
      setEvents({});
      setSelectedDate(null);
      setSelectedDateEvents([]);
      setLoading(false);
      setRefreshing(false);
      setLoadFailed(false);
      lastRefreshTime.current = 0;
      currentSubscribedMonth.current = null;
      setIsFromCache(false);
    }
  }, [user]);
  
  // 🔥 새로고침 핸들러 - 강제 새로고침
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setLoadFailed(false);
    lastRefreshTime.current = 0; // 강제 새로고침
    
    if (user) {
      loadGroupData();
      loadEvents(true); // 강제 새로고침
    } else {
      loadEvents();
    }
  }, [loadGroupData, loadEvents, user]);
  
  // 날짜 선택 핸들러
  const handleDayPress = useCallback((day: CalendarDay, dayEvents: CalendarEvent[]) => {
    setSelectedDate(day);
    setSelectedDateEvents(dayEvents || []);
    setModalVisible(true);
  }, []);
  
  // 이벤트 업데이트 핸들러
  const handleEventUpdated = useCallback((action: string, eventData: any) => {
    console.log('Event updated:', action, eventData);
    
    if (action === 'delete') {
      setModalVisible(false);
    }
    
    // 🔥 이벤트 변경 시 캐시 새로고침
    if (action === 'add' || action === 'update' || action === 'delete') {
      lastRefreshTime.current = 0;
      if (user) {
        loadEvents(true);
      }
    }
  }, [user, loadEvents]);
  
  // 모달 닫기 핸들러
  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
  }, []);
  
  // 로그인 화면으로 이동 핸들러
  const handleNavigateToLogin = useCallback(() => {
    router.push('/(auth)/login');
  }, [router]);
  
  if (loading && !refreshing) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: colors.secondary}]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView 
      style={[styles.container, {backgroundColor: colors.secondary}]} 
      edges={['top', 'right', 'left']}
    >
      {/* 🔥 오프라인 인디케이터 */}
      {!isOnline && (
        <View style={[styles.offlineIndicator, { backgroundColor: '#ff6b6b' }]}>
          <Text style={styles.offlineText}>
            🔴 오프라인 모드 - 변경사항은 온라인 복귀 시 동기화됩니다
          </Text>
        </View>
      )}
      
      <View style={[
        styles.header, 
        {
          backgroundColor: colors.headerBackground, 
          borderBottomColor: colors.border,
          overflow: 'hidden'
        }
      ]}>
        {/* 광고 배너 추가 - 🔥 MemoizedAdBanner 사용 */}
        <MemoizedAdBanner size="banner" />
      </View>
      
      <View style={styles.calendarWrapper}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContainer}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={handleRefresh}
              tintColor={colors.tint}
              colors={[colors.tint]}
            />
          }
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
        >
          {loadFailed && events && Object.keys(events).length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Text style={[styles.emptyStateText, { color: colors.text }]}>
                일정을 불러오지 못했습니다.
              </Text>
              <TouchableOpacity
                style={[styles.retryButton, { backgroundColor: colors.tint }]}
                onPress={() => {
                  setLoadFailed(false);
                  loadEvents(true);
                }}
              >
                <Text style={[styles.retryButtonText, { color: colors.background }]}>
                  새로고침
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <CalendarPager
                events={events}
                onDayPress={handleDayPress}
                colorScheme={colorScheme}
                initialMonth={currentMonth}
                onMonthChange={handleMonthChange}
              />
              
              {/* 🔥 캐시 데이터 사용 중 표시 */}
              {isFromCache && (
                <View style={[styles.cacheIndicator, { backgroundColor: colors.tint + '20' }]}>
                  <Text style={[styles.cacheText, { color: colors.tint }]}>
                    💾 저장된 데이터 사용 중
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
      
      {/* 비로그인 사용자를 위한 로그인 유도 배너 추가 */}
      {!user && (
        <View style={[styles.loginPromptBanner, { backgroundColor: colors.tint }]}>
          <Text style={[styles.loginPromptText, { color: colors.buttonText }]}>
            로그인하여 모든 기능을 이용하세요
          </Text>
          <TouchableOpacity 
            style={[styles.loginButton, { backgroundColor: colors.background }]}
            onPress={handleNavigateToLogin}
          >
            <Text style={[styles.loginButtonText, { color: colors.tint }]}>로그인</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {selectedDate && (
        <EventDetailModal
          visible={modalVisible}
          selectedDate={selectedDate}
          events={selectedDateEvents}
          groups={groups}
          userId={user?.uid || ''}
          user={user}
          onClose={handleCloseModal}
          onEventUpdated={handleEventUpdated}
          colorScheme={colorScheme}
          colors={colors}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 4,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  calendarWrapper: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
  scrollContainer: {
    flexGrow: 1,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 300,
  },
  emptyStateText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 10,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  adBanner: {
    alignSelf: 'center',
    width: '100%',
  },
  // 로그인 유도 배너 스타일 추가
  loginPromptBanner: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  loginPromptText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  loginButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginLeft: 10,
  },
  loginButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // 🔥 캐시 인디케이터 스타일 추가
  cacheIndicator: {
    padding: 8,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  cacheText: {
    fontSize: 12,
    fontWeight: '500',
  },
  // 🔥 오프라인 인디케이터 스타일 추가
  offlineIndicator: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  }
});

export default CalendarScreen;
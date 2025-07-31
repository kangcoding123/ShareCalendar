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
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../../context/AuthContext';
import { 
  CalendarEvent, 
  getUserEvents, 
  subscribeToUserEvents,
  getEventsForMonth 
} from '../../../services/calendarService';
import { Group, getUserGroups } from '../../../services/groupService';
import { groupEventsByDate, CalendarDay } from '../../../utils/dateUtils';
import { onSnapshot, query, collection, where } from 'firebase/firestore'; // 🔥 onSnapshot 추가
import { db } from '../../../config/firebase';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { cacheService } from '../../../services/cacheService';

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
  const [isOnline, setIsOnline] = useState(true);
  
  // 🔥 추가: 공휴일 새로고침 키
  const [holidaysRefreshKey, setHolidaysRefreshKey] = useState(0);
  
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
  
  // 🔥 초기 로드 완료 상태 추적
  const isInitialLoadCompleteRef = useRef(false);
  
  // 🔥 그룹 로드 중복 방지를 위한 ref 추가
  const isLoadingGroupsRef = useRef(false);
  const lastGroupLoadTimeRef = useRef(0);
  
  // 🔥 모달 상태 추적을 위한 ref 추가 (중요!)
  const isModalOpenRef = useRef(false);

  // 🔥 네트워크 상태 감지
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? false);
    });

    return () => unsubscribe();
  }, []);

  // 🔥 수정: 공휴일 변경 감지 리스너
useEffect(() => {
  let isFirstSnapshot = true;
  
  // 공휴일 변경 감지를 위한 Firestore 리스너
  const unsubscribe = onSnapshot(
    collection(db, 'temporary_holidays'),
    (snapshot) => {
      // 첫 번째 스냅샷은 무시 (초기 로드)
      if (isFirstSnapshot) {
        isFirstSnapshot = false;
        return;
      }
      
      // 변경사항이 있을 때만 새로고침
      if (!snapshot.empty) {
        console.log('[CalendarScreen] 공휴일 변경 감지 - 새로고침');
        console.log('변경 타입:', snapshot.docChanges().map(change => change.type));
        
        // 약간의 딜레이를 주어 여러 변경사항을 한 번에 처리
        setTimeout(() => {
          setHolidaysRefreshKey(prev => prev + 1);
        }, 500);
      }
    },
    (error) => {
      console.error('[CalendarScreen] 공휴일 리스너 오류:', error);
    }
  );
  
  return () => unsubscribe();
}, []);

  // 🔥 월 변경 핸들러 - 구독 전환 포함
  const handleMonthChange = useCallback((month: Date) => {
    setCurrentMonth(prev => {
      if (prev.getFullYear() === month.getFullYear() && prev.getMonth() === month.getMonth()) {
        return prev;
      }
      
      console.log(`[CalendarScreen] 월 변경: ${format(month, 'yyyy-MM')}`);
      
      // 🔥 월별 구독 전환은 제거하고 실시간 구독에 의존
      
      return month;
    });
  }, []);
  
  // 🔥 수정된 그룹 멤버십 리스너 - 중복 방지
  const setupGroupMembershipListener = useCallback((userId: string) => {
    // 🔥 이미 리스너가 있으면 먼저 해제
    if (groupsUnsubscribeRef.current) {
      groupsUnsubscribeRef.current();
      groupsUnsubscribeRef.current = null;
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
      // 🔥 최근에 로드했으면 스킵 (1초 이내)
      const now = Date.now();
      if (now - lastGroupLoadTimeRef.current < 1000) {
        console.log('그룹 멤버십 변경 감지 - 최근 로드로 스킵');
        return;
      }
      
      console.log('그룹 멤버십 변경 감지 - 그룹 목록 새로고침');
      lastGroupLoadTimeRef.current = now;
      loadGroupData();
    }, (error) => {
      console.error('그룹 멤버십 리스너 오류:', error);
    });
    
    groupsUnsubscribeRef.current = unsubscribe;
    return unsubscribe;
  }, []);
  
  // 🔥 수정된 그룹 데이터 로드 - 중복 방지
  const loadGroupData = useCallback(async () => {
    try {
      // 🔥 이미 로드 중이면 스킵
      if (isLoadingGroupsRef.current) {
        console.log('[loadGroupData] 이미 로드 중, 스킵');
        return;
      }
      
      if (!user || !user.uid) return;
      
      isLoadingGroupsRef.current = true;
      console.log('[loadGroupData] 그룹 데이터 로드 시작');
      
      // 🔥 오프라인 상태에서는 캐시에서 로드
      if (!cacheService.getIsOnline()) {
        const cachedGroups = await cacheService.loadGroupsFromCache(user.uid);
        if (cachedGroups.length > 0) {
          console.log(`[loadGroupData] 캐시에서 ${cachedGroups.length}개 그룹 로드`);
          setGroups(cachedGroups);
          isLoadingGroupsRef.current = false;
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
    } finally {
      isLoadingGroupsRef.current = false;
    }
  }, [user]);

  // 🔥 이벤트 데이터 로드 함수 최적화 - 초기 로드만 수행
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
      
      // 🔥 초기 로드가 완료된 경우 스킵 (강제 새로고침이 아닌 경우)
      if (!forceRefresh && isInitialLoadCompleteRef.current) {
        console.log('[loadEvents] 이미 초기 로드 완료됨, 스킵');
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
        isInitialLoadCompleteRef.current = true;
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

  // 🔥 수정된 화면 포커스 핸들러 - 과도한 리로드 제거
  useFocusEffect(
    useCallback(() => {
      // 🔥 모달이 열려있으면 포커스 이벤트 무시
      if (isModalOpenRef.current) {
        console.log('모달 열려있음 - 포커스 이벤트 무시');
        return;
      }
      
      if (user) {
        console.log('캘린더 화면 포커스');
        
        // 🔥 앱 시작 시 오래된 캐시 정리 (초기 1회만)
        if (!isInitialLoadCompleteRef.current) {
          cacheService.cleanupOldCache(user.uid);
        }
        
        // 🔥 loadEvents 호출 완전히 제거 (구독에서 처리)
      }
      return () => {};
    }, [user])  // 🔥 loadEvents 의존성 제거
  );

  // 디버깅용 정보 로그
  useEffect(() => {
    console.log(`[디버깅] Platform: ${Platform.OS}, isEmulator: ${__DEV__}, colorScheme: ${colorScheme}`);
  }, [colorScheme]);
  
  // 🔥 수정된 초기 데이터 로드 및 실시간 구독 설정
  useEffect(() => {
    // 클린업 함수 먼저 정의
    const cleanup = () => {
      console.log('[CalendarScreen] 구독 해제');
      
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      
      if (groupsUnsubscribeRef.current) {
        groupsUnsubscribeRef.current();
        groupsUnsubscribeRef.current = null;
      }
      
      // 🔥 상태 초기화
      isLoadingGroupsRef.current = false;
      lastGroupLoadTimeRef.current = 0;
      isInitialLoadCompleteRef.current = false;
    };
    
    if (user && user.uid) {
      // 🔥 초기화 플래그 추가
      let isInitializing = true;
      
      // 🔥 순차적 로드로 변경 (동시 로드 방지)
      const initializeData = async () => {
        // 1. 그룹 데이터 로드
        await loadGroupData();
        
        // 2. 🔥 초기 이벤트 로드 제거 (구독에서 처리)
        // await loadEvents(false);  // 삭제!
        
        // 3. 실시간 구독 설정
        unsubscribeRef.current = subscribeToUserEvents(user.uid, (updatedEvents) => {
          // 🔥 초기화 중이면 로딩 상태만 해제
          if (isInitializing) {
            isInitializing = false;
            setLoading(false);
            isInitialLoadCompleteRef.current = true;
          }
          
          console.log('[CalendarScreen] 실시간 이벤트 업데이트 수신');
          const groupedEvents = groupEventsByDate<CalendarEvent>(updatedEvents);
          setEvents(groupedEvents);
          setIsFromCache(false);
          
          // 선택된 날짜의 이벤트도 업데이트
          if (selectedDate) {
            const dateStr = selectedDate.formattedDate;
            const dateEvents = groupedEvents[dateStr] || [];
            setSelectedDateEvents(dateEvents);
          }
        });
        
        // 4. 그룹 멤버십 리스너 설정
        setupGroupMembershipListener(user.uid);
      };
      
      initializeData();
      
      return cleanup;
    } else {
      // 로그인하지 않은 경우
      setLoading(false);  // 🔥 추가
      return cleanup;
    }
  }, [user?.uid]); // 🔥 의존성 최소화
  
  // 사용자가 변경되거나 null이 될 때 상태 초기화
  useEffect(() => {
    if (!user) {
      setEvents({});
      setSelectedDate(null);
      setSelectedDateEvents([]);
      setLoading(false);
      setRefreshing(false);
      setLoadFailed(false);
      isInitialLoadCompleteRef.current = false;
      setIsFromCache(false);
    }
  }, [user]);
  
  // 🔥 새로고침 핸들러 - 강제 새로고침
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setLoadFailed(false);
    
    if (user) {
      loadGroupData();
      loadEvents(true); // 강제 새로고침
    } else {
      loadEvents();
    }
  }, [loadGroupData, loadEvents, user]);
  
  // 🔥 수정된 날짜 선택 핸들러 - 모달 상태 설정 추가
  const handleDayPress = useCallback((day: CalendarDay, dayEvents: CalendarEvent[]) => {
    console.log('[handleDayPress] 날짜 선택:', day.formattedDate);
    setSelectedDate(day);
    setSelectedDateEvents(dayEvents || []);
    
    // 🔥 모달 열림 상태 설정
    isModalOpenRef.current = true;
    
    // 🔥 약간의 지연을 주어 상태 업데이트가 완료된 후 모달 열기
    requestAnimationFrame(() => {
      setModalVisible(true);
    });
  }, []);
  
  // 🔥 수정된 이벤트 업데이트 핸들러 - loadEvents 호출 제거
  const handleEventUpdated = useCallback((action: string, eventData: any) => {
    console.log('Event updated:', action, eventData);
    
    if (action === 'delete') {
      setModalVisible(false);
      // 🔥 모달 닫힘 상태 설정
      setTimeout(() => {
        isModalOpenRef.current = false;
      }, 300);
    }
    
    // 🔥 loadEvents 호출 제거 - 실시간 구독이 자동으로 처리
    // 이벤트 변경은 Firebase 실시간 구독에 의해 자동으로 반영됨
  }, []);
  
  // 🔥 수정된 모달 닫기 핸들러
  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    // 🔥 모달 닫힘 상태 설정 (애니메이션 완료 후)
    setTimeout(() => {
      isModalOpenRef.current = false;
    }, 300); // 애니메이션 완료 시간
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
                refreshHolidaysKey={holidaysRefreshKey} // 🔥 추가!
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
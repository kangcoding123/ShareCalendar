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
import { useAuth } from '../../../context/AuthContext';
import { CalendarEvent, getUserEvents, subscribeToUserEvents } from '../../../services/calendarService';
import { Group, getUserGroups } from '../../../services/groupService';
import { groupEventsByDate, CalendarDay } from '../../../utils/dateUtils';
import { onSnapshot, query, collection, where } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useRouter } from 'expo-router';

// 컴포넌트
import Calendar from '../../../components/calendar/Calendar';
import CalendarPager from '../../../components/calendar/CalendarPager';
import EventDetailModal from '../../../components/calendar/EventDetailModal';
import AdMobBanner from '@/components/AdMobBanner';

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
  
  // 구독 취소 함수 참조 저장
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const groupsUnsubscribeRef = useRef<(() => void) | null>(null);
  
  // ScrollView ref 추가
  const scrollRef = useRef(null);
  
  // 현재 보고 있는 달을 위한 상태 변수
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  // 월 변경 핸들러
  const handleMonthChange = useCallback((month: Date) => {
    setCurrentMonth(prev => {
      if (prev.getFullYear() === month.getFullYear() && prev.getMonth() === month.getMonth()) {
        return prev;
      }
      return month;
    });
  }, []);
  
  // 그룹 멤버십 변경 감지 및 구독 설정
  const setupGroupMembershipListener = useCallback((userId: string) => {
    if (groupsUnsubscribeRef.current) {
      groupsUnsubscribeRef.current();
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
      
      const groupsResult = await getUserGroups(user.uid);
      
      if (groupsResult.success && Array.isArray(groupsResult.groups)) {
        console.log(`[loadGroupData] 그룹 ${groupsResult.groups.length}개 로드됨`);
        setGroups(groupsResult.groups as Group[]);
      } else {
        console.error('그룹 로드 실패:', groupsResult.error);
      }
    } catch (error) {
      console.error('그룹 데이터 로드 중 오류:', error);
    }
  }, [user]);

  // 이벤트 데이터 로드 함수 최적화
  const loadEvents = useCallback(async () => {
    // 비로그인 상태일 경우에도 일부 공개 이벤트를 보여줄 수 있음
    if (!user) {
      // 비로그인 사용자용 이벤트 로드 (공휴일 또는 공개 이벤트만)
      // 여기서는 임시로 빈 데이터 사용
      setEvents({});
      setLoading(false);
      setRefreshing(false);
      return;
    }
    
    try {
      setLoading(true);
      const result = await getUserEvents(user.uid);
      
      if (result.success && Array.isArray(result.events)) {
        const groupedEvents = groupEventsByDate<CalendarEvent>(result.events);
        setEvents(groupedEvents);
        
        if (selectedDate) {
          const dateStr = selectedDate.formattedDate;
          const dateEvents = groupedEvents[dateStr] || [];
          setSelectedDateEvents(dateEvents);
        }
        
        setLoadFailed(false);
        console.log(`[loadEvents] 성공: 총 ${result.events.length}개 일정 로드됨`);
      } else if (!loadFailed) {
        console.log('[loadEvents] 초기 로드 실패, 5초 후 한 번만 재시도...');
        setLoadFailed(true);
        
        setTimeout(() => {
          if (user && user.uid) {
            console.log('[loadEvents] 재시도 시작...');
            getUserEvents(user.uid).then(retryResult => {
              if (retryResult.success && Array.isArray(retryResult.events)) {
                const groupedEvents = groupEventsByDate<CalendarEvent>(retryResult.events);
                setEvents(groupedEvents);
                console.log(`[loadEvents] 재시도 성공: ${retryResult.events.length}개 일정 로드됨`);
              } else {
                console.log('[loadEvents] 재시도 실패');
              }
              setLoading(false);
              setRefreshing(false);
            }).catch(error => {
              console.error('[loadEvents] 재시도 중 오류:', error);
              setLoading(false);
              setRefreshing(false);
            });
          } else {
            setLoading(false);
            setRefreshing(false);
          }
        }, 5000);
        return;
      }
    } catch (error) {
      console.error('[loadEvents] 오류:', error);
      setLoadFailed(true);
    }
    
    setLoading(false);
    setRefreshing(false);
  }, [user, selectedDate, loadFailed]);

  // 화면이 포커스될 때마다 데이터 새로고침
  useFocusEffect(
    useCallback(() => {
      if (user) {
        console.log('캘린더 화면 포커스 - 이벤트 데이터 새로고침');
        setRefreshing(true);
        loadEvents();
      } else {
        setRefreshing(false);
      }
      return () => {};
    }, [user, loadEvents])
  );

  // 디버깅용 정보 로그
  useEffect(() => {
    console.log(`[디버깅] Platform: ${Platform.OS}, isEmulator: ${__DEV__}, colorScheme: ${colorScheme}`);
  }, [colorScheme]);
  
  // 초기 데이터 로드 및 실시간 구독 설정
  useEffect(() => {
    if (user && user.uid) {
      setLoading(true);
      
      loadGroupData();
      const groupsUnsubscribe = setupGroupMembershipListener(user.uid);
      
      console.log('[CalendarScreen] 실시간 이벤트 구독 설정...');
      const eventsUnsubscribe = subscribeToUserEvents(user.uid, (updatedEvents) => {
        console.log(`[CalendarScreen] 이벤트 업데이트 수신: ${updatedEvents.length}개`);
        const groupedEvents = groupEventsByDate<CalendarEvent>(updatedEvents);
        setEvents(groupedEvents);
        
        if (selectedDate) {
          const dateStr = selectedDate.formattedDate;
          const dateEvents = groupedEvents[dateStr] || [];
          setSelectedDateEvents(dateEvents);
        }
        
        setLoading(false);
        setRefreshing(false);
        setLoadFailed(false);
      });
      
      unsubscribeRef.current = eventsUnsubscribe;
      
      return () => {
        console.log('[CalendarScreen] 이벤트 구독 해제');
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }
        
        if (groupsUnsubscribeRef.current) {
          groupsUnsubscribeRef.current();
          groupsUnsubscribeRef.current = null;
        }
      };
    } else {
      // 로그인하지 않은 경우 공개 이벤트만 표시하도록 설정
      loadEvents();
    }
  }, [user, loadGroupData, setupGroupMembershipListener, loadEvents]);
  
  // 사용자가 변경되거나 null이 될 때 상태 초기화
  useEffect(() => {
    if (!user) {
      setEvents({});
      setSelectedDate(null);
      setSelectedDateEvents([]);
      setLoading(false);
      setRefreshing(false);
      setLoadFailed(false);
    }
  }, [user]);
  
  // 새로고침 핸들러
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setLoadFailed(false);
    if (user) {
      loadGroupData();
    }
    loadEvents();
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
  }, []);
  
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
      <View style={[styles.header, {backgroundColor: colors.headerBackground, borderBottomColor: colors.border}]}>
        {/* 광고 배너 추가 */}
        <AdMobBanner size="banner" />
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
                  loadEvents();
                }}
              >
                <Text style={[styles.retryButtonText, { color: colors.background }]}>
                  새로고침
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <CalendarPager
              events={events}
              onDayPress={handleDayPress}
              colorScheme={colorScheme}
              initialMonth={currentMonth}
              onMonthChange={handleMonthChange}
            />
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
    paddingHorizontal: 0,
    paddingVertical: 0,
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
    paddingVertical: 5,
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
  }
});

export default CalendarScreen;
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';  // ✅ useSafeAreaInsets 추가
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../../context/AuthContext';
import { useEvents } from '../../../context/EventContext';  // ✅ EventContext 유지
import { CalendarEvent } from '../../../services/calendarService';
import { CalendarDay } from '../../../utils/dateUtils';
import { onSnapshot, collection } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';

// 컴포넌트
import CalendarPager from '../../../components/calendar/CalendarPager';
import EventDetailModal from '../../../components/calendar/EventDetailModal';
import MemoizedAdBanner from '@/components/MemoizedAdBanner';

function CalendarScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();  // ✅ insets 추가
  
  // ✅ EventContext에서 데이터 가져오기 (유지!)
  const { groupedEvents, groups, isFromCache, refreshAll } = useEvents();
  
  // 색상 테마 설정
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<CalendarDay | null>(null);
  const [selectedDateEvents, setSelectedDateEvents] = useState<CalendarEvent[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  
  // 오프라인 상태
  const [isOnline, setIsOnline] = useState(true);
  
  // 공휴일 새로고침 키
  const [holidaysRefreshKey, setHolidaysRefreshKey] = useState(0);
  
  // ScrollView ref
  const scrollRef = useRef(null);
  
  // 현재 보고 있는 달
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  
  // 모달 상태 추적
  const isModalOpenRef = useRef(false);

  // 네트워크 상태 감지
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? false);
    });

    return () => unsubscribe();
  }, []);

  // 공휴일 변경 감지 리스너
  useEffect(() => {
    let isFirstSnapshot = true;
    
    const unsubscribe = onSnapshot(
      collection(db, 'temporary_holidays'),
      (snapshot) => {
        if (isFirstSnapshot) {
          isFirstSnapshot = false;
          return;
        }
        
        if (!snapshot.empty) {
          console.log('[CalendarScreen] 공휴일 변경 감지 - 새로고침');
          console.log('변경 타입:', snapshot.docChanges().map(change => change.type));
          
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

  // 월 변경 핸들러
  const handleMonthChange = useCallback((month: Date) => {
    setCurrentMonth(prev => {
      if (prev.getFullYear() === month.getFullYear() && prev.getMonth() === month.getMonth()) {
        return prev;
      }
      
      console.log(`[CalendarScreen] 월 변경: ${format(month, 'yyyy-MM')}`);
      return month;
    });
  }, []);
  
  // 화면 포커스 핸들러
  useFocusEffect(
    useCallback(() => {
      if (isModalOpenRef.current) {
        console.log('모달 열려있음 - 포커스 이벤트 무시');
        return;
      }
      
      console.log('캘린더 화면 포커스');
      return () => {};
    }, [])
  );

  // 디버깅용 정보 로그
  useEffect(() => {
    console.log(`[디버깅] Platform: ${Platform.OS}, isEmulator: ${__DEV__}, colorScheme: ${colorScheme}`);
  }, [colorScheme]);
  
  // 새로고침 핸들러
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);
  
  // 날짜 선택 핸들러
  const handleDayPress = useCallback((day: CalendarDay, dayEvents: CalendarEvent[]) => {
    console.log('[handleDayPress] 날짜 선택:', day.formattedDate);
    setSelectedDate(day);
    
    // groupedEvents에서 해당 날짜 이벤트 가져오기
    const dateEvents = groupedEvents[day.formattedDate] || [];
    setSelectedDateEvents(dateEvents);
    
    isModalOpenRef.current = true;
    
    requestAnimationFrame(() => {
      setModalVisible(true);
    });
  }, [groupedEvents]);
  
  // 이벤트 업데이트 핸들러
  const handleEventUpdated = useCallback((action: string, eventData: any) => {
    console.log('Event updated:', action, eventData);
    
    if (action === 'delete') {
      setModalVisible(false);
      setTimeout(() => {
        isModalOpenRef.current = false;
      }, 300);
    }
  }, []);
  
  // 모달 닫기 핸들러
  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    setTimeout(() => {
      isModalOpenRef.current = false;
    }, 300);
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
      edges={['top', 'right', 'left',]}
    >
      {/* 오프라인 인디케이터 */}
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
        {/* 광고 배너 */}
        <MemoizedAdBanner size="banner" />
      </View>
      
      {/* ✅ calendarWrapper에 플랫폼별 패딩 적용 */}
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
          <CalendarPager
            events={groupedEvents}
            onDayPress={handleDayPress}
            colorScheme={colorScheme}
            initialMonth={currentMonth}
            onMonthChange={handleMonthChange}
            refreshHolidaysKey={holidaysRefreshKey}
          />
          
          {/* 캐시 데이터 사용 중 표시 */}
          {isFromCache && (
            <View style={[styles.cacheIndicator, { backgroundColor: colors.tint + '20' }]}>
              <Text style={[styles.cacheText, { color: colors.tint }]}>
                💾 저장된 데이터 사용 중
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
      
      {/* 비로그인 사용자를 위한 로그인 유도 배너 */}
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
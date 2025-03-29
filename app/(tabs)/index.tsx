// app/(tabs)/index.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { 
  CalendarEvent, 
  getUserEvents,
  subscribeToUserEvents
} from '../../services/calendarService';
import { formatDate } from '../../utils/dateUtils';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function HomeScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  
  // 색상 테마 설정
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  
  // 구독 취소 함수 참조 저장을 위한 ref 추가
  const unsubscribeRef = useRef<(() => void) | null>(null);
  
  // 이벤트 데이터 처리 함수 (분리된 로직)
  const processEvents = useCallback((events: CalendarEvent[]) => {
    if (!Array.isArray(events)) return;
    
    // 오늘 날짜 문자열 가져오기 (YYYY-MM-DD 형식)
    const now = new Date();
    const todayString = formatDate(now, 'yyyy-MM-dd');
    
    console.log('오늘 날짜 문자열:', todayString);
    
    // 오늘 일정 필터링
    const todayEvts = events.filter((event: CalendarEvent) => {
      return event.date === todayString;
    });
    
    setTodayEvents(todayEvts);
    
    // 다가오는 일정 필터링 (오늘 이후 날짜)
    const upcoming = events.filter((event: CalendarEvent) => {
      return event.date > todayString;
    }).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    // 다가오는 일정 중 최대 5개만 표시
    setUpcomingEvents(upcoming.slice(0, 5));
  }, []);
  
  // 실시간 구독 설정
  useEffect(() => {
    if (user && user.uid) {
      console.log('[HomeScreen] 실시간 이벤트 구독 설정...');
      
      // 로딩 상태 표시
      setLoading(true);
      
      // 중앙 구독 시스템 사용
      const unsubscribe = subscribeToUserEvents(user.uid, (updatedEvents) => {
        console.log(`[HomeScreen] 이벤트 업데이트 수신: ${updatedEvents.length}개`);
        processEvents(updatedEvents);
        setLoading(false);
      });
      
      unsubscribeRef.current = unsubscribe;
      
      // 컴포넌트 언마운트 시 구독 해제
      return () => {
        console.log('[HomeScreen] 이벤트 구독 해제');
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }
      };
    }
  }, [user, processEvents]);
  
  // 화면이 포커스될 때마다 데이터 새로고침(백업용)
  useFocusEffect(
    useCallback(() => {
      if (user && !unsubscribeRef.current) {
        // 구독이 활성화되지 않은 경우에만 데이터 새로고침
        loadEvents();
      }
      return () => {};
    }, [user])
  );
  
  // 기존 로드 함수 (백업용)
  const loadEvents = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const result = await getUserEvents(user.uid);
      
      if (result.success && Array.isArray(result.events)) {
        processEvents(result.events);
      }
    } catch (error) {
      console.error('일정 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const navigateToCalendar = () => {
    router.push('/(tabs)/calendar');
  };
  
  // 로그아웃 처리 함수
  const handleLogout = async () => {
    Alert.alert(
      '로그아웃',
      '정말 로그아웃하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        { 
          text: '로그아웃', 
          onPress: async () => {
            try {
              const result = await logout();
              if (result.success) {
                // 로그아웃 후 처리는 _layout.tsx에서 처리됨
              } else {
                Alert.alert('오류', '로그아웃 중 문제가 발생했습니다.');
              }
            } catch (error) {
              console.error('로그아웃 오류:', error);
              Alert.alert('오류', '로그아웃 중 문제가 발생했습니다.');
            }
          } 
        }
      ]
    );
  };

  // 디버깅용 코드 - 실행 환경 확인
  useEffect(() => {
    console.log(`[디버깅] Platform: ${Platform.OS}, isEmulator: ${__DEV__}, colorScheme: ${colorScheme}`);
  }, [colorScheme]);
  
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.secondary }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.secondary }]}>
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.tint }]}>WE:IN</Text>
        <View style={styles.headerRow}>
          <Text style={[styles.headerSubtitle, { color: colors.lightGray }]}>안녕하세요, {user?.displayName || '사용자'}님</Text>
          <TouchableOpacity onPress={handleLogout} style={[styles.logoutButton, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.logoutButtonText, { color: colors.darkGray }]}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <ScrollView style={styles.content}>
        {/* 오늘 일정 섹션 */}
        <View style={[styles.section, { backgroundColor: colors.card, shadowColor: colorScheme === 'dark' ? 'transparent' : '#000' }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>오늘 일정</Text>
          <Text style={[styles.dateText, { color: colors.lightGray }]}>{formatDate(new Date(), 'yyyy년 MM월 dd일 (eee)')}</Text>
          
          {todayEvents.length > 0 ? (
            todayEvents.map((calendarEvent: CalendarEvent) => (
              <View key={calendarEvent.id} style={[styles.eventCard, { backgroundColor: colors.eventCardBackground }]}>
                <View 
                  style={[
                    styles.eventColor, 
                    { backgroundColor: calendarEvent.color || colors.tint }
                  ]} 
                />
                <View style={styles.eventInfo}>
                  <Text style={[styles.eventTitle, { color: colors.text }]}>{calendarEvent.title}</Text>
                  <Text style={[styles.eventGroup, { color: colors.darkGray }]}>{calendarEvent.groupName || '개인 일정'}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: colorScheme === 'dark' ? '#999' : '#999' }]}>오늘은 일정이 없습니다.</Text>
          )}
        </View>
        
        {/* 다가오는 일정 섹션 */}
        <View style={[styles.section, { backgroundColor: colors.card, shadowColor: colorScheme === 'dark' ? 'transparent' : '#000' }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>다가오는 일정</Text>
          
          {upcomingEvents.length > 0 ? (
            upcomingEvents.map((calendarEvent: CalendarEvent) => (
              <View key={calendarEvent.id} style={[styles.eventCard, { backgroundColor: colors.eventCardBackground }]}>
                <View 
                  style={[
                    styles.eventColor, 
                    { backgroundColor: calendarEvent.color || colors.tint }
                  ]} 
                />
                <View style={styles.eventInfo}>
                  <Text style={[styles.eventTitle, { color: colors.text }]}>{calendarEvent.title}</Text>
                  <Text style={[styles.eventDate, { color: colors.lightGray }]}>
                    {formatDate(new Date(calendarEvent.date), 'MM월 dd일 (eee)')}
                  </Text>
                  <Text style={[styles.eventGroup, { color: colors.darkGray }]}>{calendarEvent.groupName || '개인 일정'}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: colorScheme === 'dark' ? '#999' : '#999' }]}>다가오는 일정이 없습니다.</Text>
          )}
        </View>
        
        <TouchableOpacity 
          style={[styles.calendarButton, { backgroundColor: colors.buttonBackground }]} 
          onPress={navigateToCalendar}
        >
          <Text style={[styles.calendarButtonText, { color: colors.buttonText }]}>캘린더 보기</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%'
  },
  headerSubtitle: {
    fontSize: 16,
  },
  logoutButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5
  },
  logoutButtonText: {
    fontSize: 14
  },
  content: {
    flex: 1,
    padding: 15
  },
  section: {
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  dateText: {
    fontSize: 14,
    marginBottom: 15
  },
  eventCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10
  },
  eventColor: {
    width: 5,
    borderRadius: 3,
    marginRight: 10
  },
  eventInfo: {
    flex: 1
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 3
  },
  eventDate: {
    fontSize: 14,
    marginBottom: 3
  },
  eventGroup: {
    fontSize: 12,
  },
  emptyText: {
    textAlign: 'center',
    padding: 20,
    fontStyle: 'italic'
  },
  calendarButton: {
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20
  },
  calendarButtonText: {
    fontSize: 16,
    fontWeight: 'bold'
  }
});
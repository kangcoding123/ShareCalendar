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

export default function HomeScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  
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
    console.log(`[디버깅] Platform: ${Platform.OS}, isEmulator: ${__DEV__}`);
  }, []);
  
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#3c66af" />
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>WE:IN</Text>
        <View style={styles.headerRow}>
          <Text style={styles.headerSubtitle}>안녕하세요, {user?.displayName || '사용자'}님</Text>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutButtonText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <ScrollView style={styles.content}>
        {/* 오늘 일정 섹션 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>오늘 일정</Text>
          <Text style={styles.dateText}>{formatDate(new Date(), 'yyyy년 MM월 dd일 (eee)')}</Text>
          
          {todayEvents.length > 0 ? (
            todayEvents.map((calendarEvent: CalendarEvent) => (
              <View key={calendarEvent.id} style={styles.eventCard}>
                <View 
                  style={[
                    styles.eventColor, 
                    { backgroundColor: calendarEvent.color || '#3c66af' }
                  ]} 
                />
                <View style={styles.eventInfo}>
                  <Text style={styles.eventTitle}>{calendarEvent.title}</Text>
                  <Text style={styles.eventGroup}>{calendarEvent.groupName || '개인 일정'}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>오늘은 일정이 없습니다.</Text>
          )}
        </View>
        
        {/* 다가오는 일정 섹션 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>다가오는 일정</Text>
          
          {upcomingEvents.length > 0 ? (
            upcomingEvents.map((calendarEvent: CalendarEvent) => (
              <View key={calendarEvent.id} style={styles.eventCard}>
                <View 
                  style={[
                    styles.eventColor, 
                    { backgroundColor: calendarEvent.color || '#3c66af' }
                  ]} 
                />
                <View style={styles.eventInfo}>
                  <Text style={styles.eventTitle}>{calendarEvent.title}</Text>
                  <Text style={styles.eventDate}>
                    {formatDate(new Date(calendarEvent.date), 'MM월 dd일 (eee)')}
                  </Text>
                  <Text style={styles.eventGroup}>{calendarEvent.groupName || '개인 일정'}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>다가오는 일정이 없습니다.</Text>
          )}
        </View>
        
        <TouchableOpacity style={styles.calendarButton} onPress={navigateToCalendar}>
          <Text style={styles.calendarButtonText}>캘린더 보기</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa'
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3c66af',
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
    color: '#666'
  },
  logoutButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#f1f3f5',
    borderRadius: 5
  },
  logoutButtonText: {
    color: '#495057',
    fontSize: 14
  },
  content: {
    flex: 1,
    padding: 15
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#333'
  },
  dateText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15
  },
  eventCard: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#f9f9f9',
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
    color: '#333',
    marginBottom: 3
  },
  eventDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 3
  },
  eventGroup: {
    fontSize: 12,
    color: '#888'
  },
  emptyText: {
    textAlign: 'center',
    padding: 20,
    color: '#999',
    fontStyle: 'italic'
  },
  calendarButton: {
    backgroundColor: '#3c66af',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20
  },
  calendarButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold'
  }
});
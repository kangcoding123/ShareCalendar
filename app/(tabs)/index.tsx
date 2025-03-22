// app/(tabs)/index.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { CalendarEvent, getUserEvents } from '../../services/calendarService';
import { formatDate } from '../../utils/dateUtils';

export default function HomeScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();  // logout 함수 추가
  const [loading, setLoading] = useState(true);
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  
  useEffect(() => {
    loadEvents();
  }, [user]);
  
  // 화면이 포커스될 때마다 데이터 새로고침
  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadEvents();
      }
      return () => {};
    }, [user])
  );
  
  const loadEvents = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const result = await getUserEvents(user.uid);
      
      if (result.success && Array.isArray(result.events)) {
        const today = new Date().toISOString().split('T')[0];
        
        // 오늘 일정
        const todayEvts = result.events.filter((calendarEvent: CalendarEvent) => calendarEvent.date === today);
        setTodayEvents(todayEvts);
        
        // 다가오는 일정 (오늘 이후, 7일 이내)
        const upcoming = result.events.filter((calendarEvent: CalendarEvent) => {
          const eventDate = new Date(calendarEvent.date);
          const currentDate = new Date();
          const weekLater = new Date();
          weekLater.setDate(currentDate.getDate() + 7);
          
          return calendarEvent.date > today && eventDate <= weekLater;
        }).sort((a: CalendarEvent, b: CalendarEvent) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        
        setUpcomingEvents(upcoming.slice(0, 5)); // 최대 5개만 표시
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
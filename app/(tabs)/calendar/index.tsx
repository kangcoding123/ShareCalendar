// app/(tabs)/calendar/index.tsx
import React, { useState, useEffect } from 'react';
import { 
  View, 
  StyleSheet, 
  ActivityIndicator, 
  RefreshControl, 
  ScrollView, 
  Text,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../context/AuthContext';
import { CalendarEvent, getUserEvents } from '../../../services/calendarService';
import { Group, getUserGroups } from '../../../services/groupService';
import { groupEventsByDate, CalendarDay } from '../../../utils/dateUtils';

// 컴포넌트
import Calendar from '../../../components/calendar/Calendar';
import EventDetailModal from '../../../components/calendar/EventDetailModal';

export default function CalendarScreen() {
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState<Record<string, CalendarEvent[]>>({});
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedDate, setSelectedDate] = useState<CalendarDay | null>(null);
  const [selectedDateEvents, setSelectedDateEvents] = useState<CalendarEvent[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  
  // 데이터 로드
  const loadData = async () => {
    try {
      setLoading(true);
      
      if (!user || !user.uid) return;
      
      // 사용자의 그룹 목록 가져오기
      const groupsResult = await getUserGroups(user.uid);
      if (groupsResult.success && Array.isArray(groupsResult.groups)) {
        // 타입 단언 사용
        setGroups(groupsResult.groups as Group[]);
      }
      
      // 사용자의 이벤트 목록 가져오기
      const eventsResult = await getUserEvents(user.uid);
      if (eventsResult.success && Array.isArray(eventsResult.events)) {
        // 날짜별로 이벤트 그룹화
        const groupedEvents = groupEventsByDate<CalendarEvent>(eventsResult.events);
        setEvents(groupedEvents);
      }
    } catch (error) {
      console.error('데이터 로드 중 오류:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  
  // 초기 데이터 로드
  useEffect(() => {
    if (user && user.uid) {
      loadData();
    }
  }, [user]);
  
  // 새로고침 핸들러
  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };
  
  // 날짜 선택 핸들러
  const handleDayPress = (day: CalendarDay, dayEvents: CalendarEvent[]) => {
    setSelectedDate(day);
    setSelectedDateEvents(dayEvents || []);
    setModalVisible(true);
  };
  
  // 이벤트 업데이트 핸들러
  const handleEventUpdated = (action: string, eventData: any) => {
    console.log('Event updated:', action, eventData);
    
    // 함수형 업데이트 방식 사용
    setEvents(prevEvents => {
      const updatedEvents = { ...prevEvents };
      
      switch (action) {
        case 'add': {
          const date = eventData.date;
          if (!updatedEvents[date]) {
            updatedEvents[date] = [];
          }
          updatedEvents[date] = [...updatedEvents[date], eventData];
          break;
        }
        
        case 'update': {
          const date = eventData.date;
          // 이전 이벤트 제거
          if (updatedEvents[date]) {
            updatedEvents[date] = updatedEvents[date].filter(
              (event) => event.id !== eventData.id
            );
            // 업데이트된 이벤트 추가
            updatedEvents[date] = [...updatedEvents[date], eventData];
          }
          break;
        }
        
        case 'delete': {
          // ID로 이벤트 삭제
          Object.keys(updatedEvents).forEach((date) => {
            if (updatedEvents[date]) {
              updatedEvents[date] = updatedEvents[date].filter(
                (event) => event.id !== eventData
              );
            }
          });
          break;
        }
        
        default:
          break;
      }
      
      return updatedEvents;
    });
    
    // 선택된 날짜의 이벤트도 업데이트
    if (selectedDate) {
      const dateStr = selectedDate.formattedDate;
      setSelectedDateEvents(prevEvents => {
        if (action === 'add' && eventData.date === dateStr) {
          return [...prevEvents, eventData];
        } else if (action === 'update' && eventData.date === dateStr) {
          return [...prevEvents.filter(e => e.id !== eventData.id), eventData];
        } else if (action === 'delete') {
          return prevEvents.filter(e => e.id !== eventData);
        }
        return prevEvents;
      });
    }
    
    // 데이터 다시 로드
    loadData();
  };
  
  // 모달 닫기 핸들러
  const handleCloseModal = () => {
    setModalVisible(false);
  };
  
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>공유 캘린더</Text>
      </View>
      
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3c66af" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          <Calendar 
            events={events} 
            onDayPress={handleDayPress} 
          />
          
          {selectedDate && (
            <EventDetailModal
              visible={modalVisible}
              selectedDate={selectedDate}
              events={selectedDateEvents}
              groups={groups}
              userId={user?.uid || ''}
              onClose={handleCloseModal}
              onEventUpdated={handleEventUpdated}
            />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff'
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  scrollContainer: {
    padding: 15
  }
});
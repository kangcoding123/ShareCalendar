// app/(tabs)/calendar/index.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  StyleSheet, 
  ActivityIndicator, 
  RefreshControl, 
  ScrollView, 
  Text,
  Alert,
  Platform
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

// 컴포넌트
import Calendar from '../../../components/calendar/Calendar';
import EventDetailModal from '../../../components/calendar/EventDetailModal';

export default function CalendarScreen() {
  const { user } = useAuth();
  
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
  
  // 구독 취소 함수 참조 저장
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const groupsUnsubscribeRef = useRef<(() => void) | null>(null);
  
  // 그룹 멤버십 변경 감지 및 구독 설정
  const setupGroupMembershipListener = (userId: string) => {
    // 이전 구독 해제
    if (groupsUnsubscribeRef.current) {
      groupsUnsubscribeRef.current();
    }
    
    // 그룹 멤버십 리스너 설정
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
  };
  
  // 데이터 로드 - 그룹만 로드
  const loadGroupData = async () => {
    try {
      if (!user || !user.uid) return;
      
      console.log('[loadGroupData] 그룹 데이터 로드 시작');
      
      // 사용자의 그룹 목록 가져오기
      const groupsResult = await getUserGroups(user.uid);
      
      if (groupsResult.success && Array.isArray(groupsResult.groups)) {
        console.log(`[loadGroupData] 그룹 ${groupsResult.groups.length}개 로드됨`);
        // 타입 단언 사용
        setGroups(groupsResult.groups as Group[]);
        
        // 그룹 ID와 색상 로깅
        groupsResult.groups.forEach(group => {
          console.log(`[loadGroupData] 그룹: ${group.name}, 색상: ${group.color || '미설정'}`);
        });
      } else {
        console.error('그룹 로드 실패:', groupsResult.error);
      }
    } catch (error) {
      console.error('그룹 데이터 로드 중 오류:', error);
    }
  };
  
  // 화면이 포커스될 때마다 데이터 새로고침
  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        console.log('캘린더 화면 포커스 - 이벤트 데이터 새로고침');
        setRefreshing(true);
        // 초기 이벤트 데이터 로드
        getUserEvents(user.uid).then(result => {
          if (result.success && Array.isArray(result.events)) {
            // 날짜별로 이벤트 그룹화
            const groupedEvents = groupEventsByDate<CalendarEvent>(result.events);
            setEvents(groupedEvents);
          }
          setRefreshing(false);
        });
      }
      return () => {};
    }, [user])
  );

  // 디버깅용 정보 로그
  useEffect(() => {
    console.log(`[디버깅] Platform: ${Platform.OS}, isEmulator: ${__DEV__}, colorScheme: ${colorScheme}`);
  }, [colorScheme]);
  
  // 초기 데이터 로드 및 실시간 구독 설정
  useEffect(() => {
    if (user && user.uid) {
      setLoading(true);
      
      // 그룹 데이터 로드 및 그룹 멤버십 리스너 설정
      loadGroupData();
      const groupsUnsubscribe = setupGroupMembershipListener(user.uid);
      
      // 실시간 이벤트 구독 설정 - 중앙 구독 시스템 사용
      console.log('[CalendarScreen] 실시간 이벤트 구독 설정...');
      const eventsUnsubscribe = subscribeToUserEvents(user.uid, (updatedEvents) => {
        console.log(`[CalendarScreen] 이벤트 업데이트 수신: ${updatedEvents.length}개`);
        // 날짜별로 이벤트 그룹화
        const groupedEvents = groupEventsByDate<CalendarEvent>(updatedEvents);
        setEvents(groupedEvents);
        
        // 선택된 날짜의 이벤트도 업데이트
        if (selectedDate) {
          const dateStr = selectedDate.formattedDate;
          const dateEvents = groupedEvents[dateStr] || [];
          setSelectedDateEvents(dateEvents);
        }
        
        setLoading(false);
        setRefreshing(false);
      });
      
      unsubscribeRef.current = eventsUnsubscribe;
      
      // 컴포넌트 언마운트 시 구독 해제
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
    }
  }, [user]);
  
  // 새로고침 핸들러
  const handleRefresh = () => {
    setRefreshing(true);
    loadGroupData(); // 그룹 정보 새로고침
    
    if (user && user.uid) {
      // 이벤트 데이터 새로고침
      getUserEvents(user.uid).then(result => {
        if (result.success && Array.isArray(result.events)) {
          const groupedEvents = groupEventsByDate<CalendarEvent>(result.events);
          setEvents(groupedEvents);
        }
        setRefreshing(false);
      });
    } else {
      // 일정 시간 후 새로고침 상태 해제
      setTimeout(() => {
        setRefreshing(false);
      }, 1000);
    }
  };
  
  // 날짜 선택 핸들러
  const handleDayPress = (day: CalendarDay, dayEvents: CalendarEvent[]) => {
    setSelectedDate(day);
    setSelectedDateEvents(dayEvents || []);
    setModalVisible(true);
  };
  
  // 이벤트 업데이트 핸들러 - 모달에서 호출됨
  const handleEventUpdated = (action: string, eventData: any) => {
    console.log('Event updated:', action, eventData);
    
    // 중앙 구독 시스템을 사용하므로 실시간 업데이트는 자동으로 처리됨
    // 그러나 백업으로 수동 업데이트도 유지
    if (user && user.uid) {
      getUserEvents(user.uid).then(result => {
        if (result.success && Array.isArray(result.events)) {
          const groupedEvents = groupEventsByDate<CalendarEvent>(result.events);
          setEvents(groupedEvents);
          
          // 선택된 날짜가 있는 경우, 해당 날짜의 이벤트도 업데이트
          if (selectedDate) {
            const dateEvents = groupedEvents[selectedDate.formattedDate] || [];
            setSelectedDateEvents(dateEvents);
          }
        }
      });
    }
    
    // 삭제 시 모달 닫기
    if (action === 'delete') {
      setModalVisible(false);
    }
  };
  
  // 모달 닫기 핸들러
  const handleCloseModal = () => {
    setModalVisible(false);
  };
  
  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.secondary}]}>
      <View style={[styles.header, {backgroundColor: colors.headerBackground, borderBottomColor: colors.border}]}>
        <Text style={[styles.headerTitle, {color: colors.text}]}>WE:IN</Text>
      </View>
      
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={handleRefresh}
              tintColor={colors.tint}
              colors={[colors.tint]}
            />
          }
        >
          <Calendar 
            events={events} 
            onDayPress={handleDayPress}
            colorScheme={colorScheme}
          />
          
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
        </ScrollView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
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
  scrollContainer: {
    padding: 15
  }
});
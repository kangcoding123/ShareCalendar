// components/calendar/EventDetailModal.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  ColorSchemeName,
  Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addEvent, updateEvent, deleteEvent, CalendarEvent } from '../../services/calendarService';
import { Group } from '../../services/groupService';
import { formatDate } from '../../utils/dateUtils';
import EventItem from './event/EventItem';
import EventForm from './event/EventForm';
import { useRouter } from 'expo-router';

// 타입 정의 수정
interface CalendarDay {
  date: Date;
  formattedDate: string;
  [key: string]: any;
}

interface EventDetailModalProps {
  visible: boolean;
  selectedDate: CalendarDay | null;
  events: CalendarEvent[];
  groups: Group[];
  userId: string;
  user: { displayName?: string | null; uid?: string } | null;
  onClose: () => void;
  onEventUpdated: (action: string, eventData: any) => void;
  colorScheme: ColorSchemeName;
  colors: any;
}

const EventDetailModal = ({ 
  visible, 
  selectedDate, 
  events, 
  groups, 
  userId,
  user,
  onClose, 
  onEventUpdated,
  colorScheme,
  colors
}: EventDetailModalProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets(); // 추가
  
  // 일정이 없을 때 자동으로 추가 모드로 전환
  useEffect(() => {
    if (visible && events && events.length === 0 && user) {
      // 로그인한 사용자이고 일정이 없는 날짜가 선택되었을 때 자동으로 추가 모드로 전환
      setIsEditing(true);
      setEditingEvent(null);
    } else if (visible && events && events.length > 0) {
      // 일정이 있을 때는 기본 보기 모드로 시작
      setIsEditing(false);
    }
  }, [visible, events, user]);
  
  // 이벤트 ID 제거 핸들러 (추가)
  const handleRemoveEventId = () => {
    if (editingEvent) {
      // ID를 제외한 이벤트 데이터 복사
      const { id, ...eventDataWithoutId } = editingEvent;
      setEditingEvent(eventDataWithoutId as CalendarEvent);
    }
  };
  
  const handleAddEvent = () => {
    // 로그인하지 않은 사용자는 로그인 화면으로 이동
    if (!user) {
      onClose(); // 모달 닫기
      router.push('/(auth)/login'); // 로그인 화면으로 이동
      return;
    }
    
    setIsEditing(true);
    setEditingEvent(null);
  };
  
  const handleEditEvent = (event: CalendarEvent) => {
    // 로그인하지 않은 사용자는 로그인 화면으로 이동
    if (!user) {
      onClose(); // 모달 닫기
      router.push('/(auth)/login'); // 로그인 화면으로 이동
      return;
    }
    
    setEditingEvent(event);
    setIsEditing(true);
  };
  
  const handleDeleteEvent = async (event: CalendarEvent) => {
    // 로그인하지 않은 사용자는 로그인 화면으로 이동
    if (!user) {
      onClose(); // 모달 닫기
      router.push('/(auth)/login'); // 로그인 화면으로 이동
      return;
    }
    
    Alert.alert(
      '일정 삭제',
      '이 일정을 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              if (event.id) {
                console.log('Deleting event:', event.id);
                
                // 알림이 있으면 취소
                if (event.notificationId) {
                  // 여기서 알림 취소 로직이 있었지만 생략
                }
                
                await deleteEvent(event.id);
                onEventUpdated('delete', event.id);
                // 삭제 후 모달 닫기
                onClose();
              }
            } catch (error) {
              console.error('Event deletion error:', error);
              Alert.alert('오류', '일정 삭제 중 오류가 발생했습니다.');
            }
          }
        }
      ]
    );
  };
  
  const handleSubmitEvent = async (eventData: CalendarEvent) => {
    // 이미 제출 중이면 중복 제출 방지
    if (isSubmitting) return;
    
    try {
      setIsSubmitting(true); // 제출 시작 시 상태 변경
      
      // 알림 관련 null 값 명시적 설정
      eventData.notificationEnabled = false;
      eventData.notificationMinutesBefore = null;
      eventData.notificationId = null;
      
      // 다중 그룹 처리를 위한 변수
      const mainGroupId = eventData.groupId;
      const targetGroupIds = eventData.targetGroupIds || [mainGroupId];
      
      if (eventData.id) {
        // 기존 이벤트 수정 - userId 필드 추가
        const updatedEventData = {
          ...eventData,
          userId: userId, // 현재 사용자 ID 명시적 추가
          updatedAt: new Date().toISOString() // 업데이트 시간 추가
        };
        
        console.log('Updating event:', updatedEventData);
        const result = await updateEvent(eventData.id, updatedEventData);
        
        if (result.success) {
          console.log('Event updated successfully:', updatedEventData);
          onEventUpdated('update', updatedEventData);
          // 수정 완료 후 모달 닫기
          onClose();
        } else {
          Alert.alert('오류', '일정 업데이트 중 오류가 발생했습니다.');
        }
      } else {
        // 새 이벤트 추가 - 여러 그룹에 복제하여 저장
        const createdEvents = [];
        const { id, targetGroupIds: _, ...baseEventData } = eventData as any;
        
        // 실제 사용자 이름 사용
        const baseEvent = {
          ...baseEventData,
          userId,
          createdByName: baseEventData.groupId !== 'personal' ? user?.displayName : null,
        };
        
        // 병렬로 모든 그룹에 이벤트 생성
        const createPromises = targetGroupIds.map(async (groupId) => {
          // 각 그룹별 이벤트 데이터 생성
          const groupEventData = {
            ...baseEvent,
            groupId,
            groupName: groupId === 'personal' 
              ? '개인 일정' 
              : groups.find(g => g.id === groupId)?.name || '그룹 일정',
            color: groupId === 'personal' 
              ? colors.tint 
              : groups.find(g => g.id === groupId)?.color || '#4CAF50',
            isSharedEvent: targetGroupIds.length > 1
          };
          
          // 이벤트 생성
          return addEvent(groupEventData);
        });
        
        // 병렬로 모든 요청 처리
        const results = await Promise.all(createPromises);
        const successResults = results.filter(r => r.success);
        
        if (successResults.length > 0) {
          console.log(`Created ${successResults.length} events for ${targetGroupIds.length} groups`);
          
          // 첫 번째 성공한 결과를 상위 컴포넌트에 전달
          const firstSuccessResult = successResults[0];
          onEventUpdated('add', {
            ...baseEvent,
            id: firstSuccessResult.eventId
          });
          
          // 추가 완료 후 모달 닫기
          onClose();
        } else {
          Alert.alert('오류', '일정 저장 중 오류가 발생했습니다.');
        }
      }
    } catch (error) {
      console.error('Event submission error:', error);
      Alert.alert('오류', '일정 저장 중 오류가 발생했습니다.');
    } finally {
      // 지연 추가 - 너무 빨리 완료되면 사용자가 처리됐다고 인식하지 못할 수 있음
      setTimeout(() => {
        setIsSubmitting(false);
      }, 500);
    }
  };
  
  const renderContent = () => {
    if (isEditing && selectedDate) {
      return (
        <EventForm
          selectedDate={selectedDate}
          event={editingEvent || undefined}
          groups={groups}
          onSubmit={handleSubmitEvent}
          onCancel={onClose}
          colors={colors}
          onRemoveEventId={handleRemoveEventId}
        />
      );
    }
    
    // 비로그인 사용자를 위한 UI
    if (!user) {
      return (
        <View style={styles.content}>
          <Text style={[styles.dateHeader, { color: colors.text }]}>
            {selectedDate ? formatDate(selectedDate.date, 'yyyy년 MM월 dd일 (eee)') : ''}
          </Text>
          
          {events && events.length > 0 ? (
            <FlatList
              data={events}
              renderItem={({ item }) => (
                <EventItem
                  event={item}
                  onEdit={() => {}} // 편집 불가
                  onDelete={() => {}} // 삭제 불가
                  userId=""
                  colors={colors}
                  readOnly={true} // 읽기 전용
                />
              )}
              keyExtractor={(item) => item.id || item.title}
              style={styles.eventList}
            />
          ) : (
            <View style={styles.noEventsContainer}>
              <Text style={[styles.noEventsText, { color: colors.lightGray }]}>일정이 없습니다.</Text>
            </View>
          )}
          
          <TouchableOpacity 
            style={[styles.loginButton, { backgroundColor: colors.tint }]} 
            onPress={() => {
              onClose(); // 모달 닫기
              router.push('/(auth)/login'); // 로그인 화면으로 이동
            }}
          >
            <Text style={[styles.loginButtonText, { color: colors.buttonText }]}>로그인하여 일정 관리하기</Text>
          </TouchableOpacity>
        </View>
      );
    }
    
    // 기존 로그인 사용자용 UI
    return (
      <View style={styles.content}>
        <Text style={[styles.dateHeader, { color: colors.text }]}>
          {selectedDate ? formatDate(selectedDate.date, 'yyyy년 MM월 dd일 (eee)') : ''}
        </Text>
        
        {events && events.length > 0 ? (
          <FlatList
            data={events}
            renderItem={({ item }) => (
              <EventItem
                event={item}
                onEdit={handleEditEvent}
                onDelete={handleDeleteEvent}
                userId={userId}
                colors={colors}
              />
            )}
            keyExtractor={(item) => item.id || item.title}
            style={styles.eventList}
          />
        ) : (
          <View style={styles.noEventsContainer}>
            <Text style={[styles.noEventsText, { color: colors.lightGray }]}>일정이 없습니다.</Text>
          </View>
        )}
        
        <TouchableOpacity 
          style={[styles.addButton, { backgroundColor: colors.buttonBackground }]} 
          onPress={handleAddEvent}
        >
          <Text style={[styles.addButtonText, { color: colors.buttonText }]}>일정 추가</Text>
        </TouchableOpacity>
      </View>
    );
  };
  
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={[styles.modalContent, { backgroundColor: colors.card, paddingBottom: insets.bottom}]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {isEditing ? (editingEvent?.id ? '일정 편집' : '새 일정') : '일정 상세'}
            </Text>
            
            {!isEditing && (
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Text style={[styles.closeButtonText, { color: colors.tint }]}>닫기</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {renderContent()}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)'
  },
  modalContent: {
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    height: '90%',
    paddingBottom: 0
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold'
  },
  closeButton: {
    padding: 5
  },
  closeButtonText: {
    fontSize: 16
  },
  content: {
    flex: 1,
    padding: 15
  },
  dateHeader: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 15
  },
  eventList: {
    flex: 1
  },
  noEventsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  noEventsText: {
    fontSize: 16,
    textAlign: 'center'
  },
  addButton: {
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 15
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600'
  },
  // 로그인 버튼 스타일 추가
  loginButton: {
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 15
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '600'
  }
});

export default EventDetailModal;
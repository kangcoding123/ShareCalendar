// components/calendar/EventDetailModal.tsx
import React, { useState, useEffect, useRef } from 'react';
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
  Platform,
  Animated,     // 🔥 추가: 애니메이션을 위해
  Dimensions    // 🔥 추가: 화면 크기 가져오기
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addEvent, updateEvent, deleteEvent, CalendarEvent } from '../../services/calendarService';
import { Group } from '../../services/groupService';
import { formatDate } from '../../utils/dateUtils';
import EventItem from './event/EventItem';
import EventForm from './event/EventForm';
import { useRouter } from 'expo-router';

// 🔥 추가: 화면 높이 상수
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  const insets = useSafeAreaInsets();
  
  // 🔥 추가: 애니메이션 값
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  
  // 🔥 이전 visible 상태를 추적하는 ref 추가
  const wasVisibleRef = useRef(visible);
  // 🔥 초기 로드 완료 상태 추적
  const isInitialLoadRef = useRef(true);
  
  // 🔥 추가: 모달 애니메이션 처리
  useEffect(() => {
    if (visible) {
      // 모달 열기 애니메이션
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // 모달 닫기 애니메이션
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, fadeAnim]);
  
  // 🔥 수정된 useEffect - visible이 false에서 true로 변경될 때만 실행
  useEffect(() => {
    // visible이 false → true로 변경되었을 때만 실행
    if (visible && !wasVisibleRef.current) {
      console.log('[EventDetailModal] 모달 열림');
      // 모달이 새로 열릴 때만 자동 편집 모드 전환
      if (events && events.length === 0 && user) {
        setIsEditing(true);
        setEditingEvent(null);
      } else {
        setIsEditing(false);
        setEditingEvent(null);
      }
      
      // 초기 로드 완료 표시
      isInitialLoadRef.current = false;
    }
    
    // 현재 visible 상태 저장
    wasVisibleRef.current = visible;
    
    // 모달이 닫힐 때 상태 초기화
    if (!visible) {
      // 🔥 애니메이션 완료 후 상태 초기화
      setTimeout(() => {
        setIsEditing(false);
        setEditingEvent(null);
        isInitialLoadRef.current = true;
      }, 300);
    }
  }, [visible, user]); // 🔥 events 의존성 제거
  
  // 이벤트 ID 제거 핸들러
  const handleRemoveEventId = () => {
    if (editingEvent) {
      const { id, ...eventDataWithoutId } = editingEvent;
      setEditingEvent(eventDataWithoutId as CalendarEvent);
    }
  };
  
  const handleAddEvent = () => {
    if (!user) {
      onClose();
      router.push('/(auth)/login');
      return;
    }
    
    setIsEditing(true);
    setEditingEvent(null);
  };
  
  const handleEditEvent = (event: CalendarEvent) => {
    if (!user) {
      onClose();
      router.push('/(auth)/login');
      return;
    }

    // 반복 일정 인스턴스인 경우 마스터 이벤트를 찾아서 수정
    if (event.isRecurringInstance && event.masterEventId) {
      Alert.alert(
        '반복 일정 수정',
        '이 반복 일정의 모든 인스턴스가 수정됩니다.',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '수정',
            onPress: () => {
              // 마스터 이벤트 정보로 편집 모드 진입
              // masterEventId를 id로 사용하고 반복 설정 유지
              const masterEvent: CalendarEvent = {
                ...event,
                id: event.masterEventId,
                isRecurringInstance: false,
                masterEventId: undefined
              };
              setEditingEvent(masterEvent);
              setIsEditing(true);
            }
          }
        ]
      );
    } else {
      setEditingEvent(event);
      setIsEditing(true);
    }
  };
  
  const handleDeleteEvent = async (event: CalendarEvent) => {
    if (!user) {
      onClose();
      router.push('/(auth)/login');
      return;
    }

    // 반복 일정 인스턴스인 경우 마스터 이벤트 삭제
    const isRecurringInstance = event.isRecurringInstance && event.masterEventId;
    const eventIdToDelete = isRecurringInstance ? event.masterEventId : event.id;
    const deleteMessage = isRecurringInstance
      ? '이 반복 일정의 모든 인스턴스가 삭제됩니다.'
      : '이 일정을 삭제하시겠습니까?';

    Alert.alert(
      '일정 삭제',
      deleteMessage,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              if (eventIdToDelete) {
                console.log('Deleting event:', eventIdToDelete, isRecurringInstance ? '(recurring master)' : '');

                // 🔥 삭제는 서비스에서 낙관적 업데이트 처리
                await deleteEvent(eventIdToDelete);
                onEventUpdated('delete', eventIdToDelete);
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
    if (isSubmitting) return;
    
    try {
      setIsSubmitting(true);
      
      eventData.notificationEnabled = false;
      eventData.notificationMinutesBefore = null;
      eventData.notificationId = null;
      
      const mainGroupId = eventData.groupId;
      const targetGroupIds = eventData.targetGroupIds || [mainGroupId];
      
      if (eventData.id) {
        // 🔥 업데이트는 서비스에서 낙관적 업데이트 처리
        const updatedEventData = {
          ...eventData,
          userId: userId,
          updatedAt: new Date().toISOString()
        };
        
        console.log('Updating event:', updatedEventData);
        const result = await updateEvent(eventData.id, updatedEventData);
        
        if (result.success) {
          console.log('Event updated successfully:', updatedEventData);
          onEventUpdated('update', updatedEventData);
          onClose();
        } else {
          Alert.alert('오류', '일정 업데이트 중 오류가 발생했습니다.');
        }
      } else {
        // 🔥 생성은 서비스에서 낙관적 업데이트 처리
        const createdEvents = [];
        const { id, targetGroupIds: _, ...baseEventData } = eventData as any;
        
        const baseEvent = {
          ...baseEventData,
          userId,
          createdByName: baseEventData.groupId !== 'personal' ? user?.displayName : null,
        };
        
        const createPromises = targetGroupIds.map(async (groupId) => {
          const groupEventData = {
            ...baseEvent,
            groupId,
            groupName: groupId === 'personal'
              ? '개인 일정'
              : groups.find(g => g.id === groupId)?.name || '그룹 일정',
            color: groupId === 'personal'
              ? (baseEventData.color || colors.tint)  // EventForm에서 전달된 색상 우선 사용
              : groups.find(g => g.id === groupId)?.color || '#4CAF50',
            isSharedEvent: targetGroupIds.length > 1
          };

          return addEvent(groupEventData);
        });
        
        const results = await Promise.all(createPromises);
        const successResults = results.filter(r => r.success);
        
        if (successResults.length > 0) {
          console.log(`Created ${successResults.length} events for ${targetGroupIds.length} groups`);
          
          const firstSuccessResult = successResults[0];
          onEventUpdated('add', {
            ...baseEvent,
            id: firstSuccessResult.eventId
          });
          
          onClose();
        } else {
          Alert.alert('오류', '일정 저장 중 오류가 발생했습니다.');
        }
      }
    } catch (error) {
      console.error('Event submission error:', error);
      Alert.alert('오류', '일정 저장 중 오류가 발생했습니다.');
    } finally {
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
                  onEdit={() => {}}
                  onDelete={() => {}}
                  userId=""
                  colors={colors}
                  readOnly={true}
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
              onClose();
              router.push('/(auth)/login');
            }}
          >
            <Text style={[styles.loginButtonText, { color: colors.buttonText }]}>로그인하여 일정 관리하기</Text>
          </TouchableOpacity>
        </View>
      );
    }
    
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
  
  // 🔥 수정된 return 문 - 커스텀 애니메이션 적용
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"  // 🔥 커스텀 애니메이션 사용
      onRequestClose={onClose}
      statusBarTranslucent  // 🔥 추가: 상태바 투명 처리
    >
      <Animated.View 
        style={[
          styles.modalContainer,
          {
            opacity: fadeAnim,  // 🔥 페이드 애니메이션
          }
        ]}
      >
        <Animated.View 
          style={[
            styles.modalContent, 
            { 
              backgroundColor: colors.card, 
              paddingBottom: insets.bottom,
              transform: [{ translateY: slideAnim }]  // 🔥 슬라이드 애니메이션
            }
          ]}
        >
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
        </Animated.View>
      </Animated.View>
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
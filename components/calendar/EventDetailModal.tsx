// components/calendar/EventDetailModal.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  ScrollView,
  Platform,
  ActivityIndicator,
  ColorSchemeName
} from 'react-native';
import { addEvent, updateEvent, deleteEvent, CalendarEvent } from '../../services/calendarService';
import { Group } from '../../services/groupService';
import { formatDate } from '../../utils/dateUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 타입 정의 수정 - time 필드 추가
interface CalendarDay {
  date: Date;
  formattedDate: string;
  [key: string]: any;
}

interface EventItemProps {
  event: CalendarEvent;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
  userId: string; // 현재 사용자 ID 추가
  colors: any;
}

interface EventFormProps {
  selectedDate: CalendarDay;
  event?: CalendarEvent;
  groups: Group[];
  onSubmit: (eventData: CalendarEvent) => void;
  onCancel: () => void;
  colors: any;
}

interface EventDetailModalProps {
  visible: boolean;
  selectedDate: CalendarDay | null;
  events: CalendarEvent[];
  groups: Group[];
  userId: string;
  user: { displayName?: string | null } | null; // user 객체 추가
  onClose: () => void;
  onEventUpdated: (action: string, eventData: any) => void;
  colorScheme: ColorSchemeName;
  colors: any;
}

const EventItem = ({ event, onEdit, onDelete, userId, colors }: EventItemProps) => {
  // 이벤트가 그룹 일정인지 확인
  const isGroupEvent = event.groupId !== 'personal';
  // 현재 사용자가 작성자인지 확인
  const isCreator = event.userId === userId;
  
  return (
    <View style={[styles.eventItem, { backgroundColor: colors.eventCardBackground }]}>
      <View style={[styles.eventColor, { backgroundColor: event.color || colors.tint }]} />
      
      <View style={styles.eventDetails}>
        <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
        
        {/* 시간 표시 */}
        {event.time && (
          <Text style={[styles.eventTime, { color: colors.lightGray }]}>
            {event.time}
          </Text>
        )}
        
        {event.description ? (
          <Text style={[styles.eventDescription, { color: colors.lightGray }]} numberOfLines={2}>
            {event.description}
          </Text>
        ) : null}
        
        <View style={styles.eventMetaContainer}>
          <View style={[styles.eventGroupContainer, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.eventGroupText, { color: colors.darkGray }]}>
              {event.groupName || '개인 일정'}
            </Text>
          </View>
          
          {/* 그룹 일정일 경우 작성자 표시 */}
          {isGroupEvent && event.createdByName && (
            <View style={[styles.eventCreatorContainer, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.eventCreatorText, { color: colors.darkGray }]}>
                작성자: {event.createdByName}
              </Text>
            </View>
          )}
        </View>
      </View>
      
      {/* 작성자만 편집/삭제 버튼 표시 */}
      {isCreator ? (
        <View style={styles.eventActions}>
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: colors.secondary }]} 
            onPress={() => onEdit(event)}
          >
            <Text style={[styles.actionButtonText, { color: colors.darkGray }]}>편집</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionButton, styles.deleteButton, { backgroundColor: '#ffebee' }]} 
            onPress={() => onDelete(event)}
          >
            <Text style={styles.deleteButtonText}>삭제</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.eventActionsDisabled}>
          <Text style={[styles.eventCreatorOnlyText, { color: colors.lightGray }]}>작성자만 수정 가능</Text>
        </View>
      )}
    </View>
  );
};

const EventForm = ({ 
  selectedDate, 
  event, 
  groups, 
  onSubmit, 
  onCancel,
  colors 
}: EventFormProps) => {
  const [title, setTitle] = useState(event?.title || '');
  const [description, setDescription] = useState(event?.description || '');
  const [time, setTime] = useState(event?.time || '');
  const [selectedGroup, setSelectedGroup] = useState(event?.groupId || 'personal');
  
  // 그룹 ID에 따라 자동으로 색상 설정 - 수정
  const getColorForGroup = (groupId: string): string => {
    if (groupId === 'personal') {
      return colors.tint; // 개인 일정 기본 색상
    } else {
      // 해당 그룹의 색상 찾기
      const group = groups.find(g => g.id === groupId);
      return group?.color || '#4CAF50'; // 그룹 색상이 없으면 기본값
    }
  };
  
  const handleSubmit = () => {
    if (!title.trim()) {
      Alert.alert('알림', '일정 제목을 입력해주세요.');
      return;
    }
    
    // 수정: id가 있을 때만 포함하고, 없으면 제외
    const eventData: CalendarEvent = {
      ...(event?.id ? { id: event.id } : {}), // id가 있을 때만 포함
      title: title.trim(),
      description: description.trim(),
      date: selectedDate.formattedDate,
      time: time.trim(),
      groupId: selectedGroup,
      groupName: groups.find(g => g.id === selectedGroup)?.name || '개인 일정',
      color: getColorForGroup(selectedGroup), // 사용자가 선택한 그룹 색상 적용
      createdAt: event?.createdAt || new Date().toISOString()
    };
    
    onSubmit(eventData);
  };
  
  return (
    <ScrollView style={styles.formContainer}>
      <Text style={[styles.formLabel, { color: colors.text }]}>일정 제목</Text>
      <TextInput
        style={[
          styles.formInput, 
          { 
            backgroundColor: colors.inputBackground, 
            borderColor: colors.inputBorder,
            color: colors.text
          }
        ]}
        placeholder="일정 제목"
        placeholderTextColor={colors.lightGray}
        value={title}
        onChangeText={setTitle}
      />
      
      <Text style={[styles.formLabel, { color: colors.text }]}>일시</Text>
      <TextInput
        style={[
          styles.formInput, 
          { 
            backgroundColor: colors.inputBackground, 
            borderColor: colors.inputBorder,
            color: colors.text
          }
        ]}
        placeholder="예: 14:00, 14:00~18:00, 오후 2시 등"
        placeholderTextColor={colors.lightGray}
        value={time}
        onChangeText={setTime}
        keyboardType="default"
      />
      
      <Text style={[styles.formLabel, { color: colors.text }]}>일정 내용</Text>
      <TextInput
        style={[
          styles.formInput, 
          styles.textArea,
          { 
            backgroundColor: colors.inputBackground, 
            borderColor: colors.inputBorder,
            color: colors.text
          }
        ]}
        placeholder="일정 내용"
        placeholderTextColor={colors.lightGray}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />
      
      <Text style={[styles.formLabel, { color: colors.text }]}>그룹</Text>
      <View style={styles.groupSelector}>
        {/* 개인 일정 옵션 */}
        <TouchableOpacity
          style={[
            styles.groupOption,
            { 
              backgroundColor: selectedGroup === 'personal' ? 
                colors.secondary : colors.inputBackground
            },
            selectedGroup === 'personal' && { 
              borderWidth: 1,
              borderColor: colors.tint
            }
          ]}
          onPress={() => setSelectedGroup('personal')}
        >
          <View 
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 4,
              backgroundColor: colors.tint,
              borderRadius: 2
            }} 
          />
          <Text style={[styles.groupOptionText, { color: colors.text }]}>개인 일정</Text>
        </TouchableOpacity>
        
        {/* 그룹 옵션 */}
        {groups.map((group) => (
          <TouchableOpacity
            key={group.id}
            style={[
              styles.groupOption,
              { 
                backgroundColor: selectedGroup === group.id ? 
                  colors.secondary : colors.inputBackground
              },
              selectedGroup === group.id && { 
                borderWidth: 1,
                borderColor: group.color || colors.tint
              }
            ]}
            onPress={() => setSelectedGroup(group.id)}
          >
            <View 
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 4,
                backgroundColor: group.color || colors.tint,
                borderRadius: 2
              }} 
            />
            <Text style={[styles.groupOptionText, { color: colors.text }]}>{group.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      
      <View style={styles.formActions}>
        <TouchableOpacity 
          style={[styles.cancelButton, { backgroundColor: colors.secondary }]} 
          onPress={onCancel}
        >
          <Text style={[styles.cancelButtonText, { color: colors.darkGray }]}>취소</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.submitButton, { backgroundColor: colors.buttonBackground }]} 
          onPress={handleSubmit}
        >
          <Text style={[styles.submitButtonText, { color: colors.buttonText }]}>저장</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

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
  
  // 일정이 없을 때 자동으로 추가 모드로 전환
  useEffect(() => {
    if (visible && events && events.length === 0) {
      // 일정이 없는 날짜가 선택되었을 때 자동으로 추가 모드로 전환
      setIsEditing(true);
      setEditingEvent(null);
    } else if (visible && events && events.length > 0) {
      // 일정이 있을 때는 기본 보기 모드로 시작
      setIsEditing(false);
    }
  }, [visible, events]);
  
  const handleAddEvent = () => {
    setIsEditing(true);
    setEditingEvent(null);
  };
  
  const handleEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    setIsEditing(true);
  };
  
  const handleDeleteEvent = async (event: CalendarEvent) => {
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
    try {
      let result;
      
      if (eventData.id) {
        // 기존 이벤트 수정
        console.log('Updating event:', eventData);
        result = await updateEvent(eventData.id, eventData);
        if (result.success) {
          console.log('Event updated successfully:', eventData);
          onEventUpdated('update', eventData);
          // 수정 완료 후 모달 닫기
          onClose();
        } else {
          Alert.alert('오류', '일정 업데이트 중 오류가 발생했습니다.');
        }
      } else {
        // 새 이벤트 추가 - id가 undefined인 경우 제거
        const { id, ...newEventWithoutId } = eventData as any;
        
        // 실제 사용자 이름 사용
        const newEventData = {
          ...newEventWithoutId,
          userId,
          // 그룹 일정인 경우에만 작성자 이름 설정
          createdByName: newEventWithoutId.groupId !== 'personal' ? user?.displayName : null
        };
        
        console.log('Adding new event:', newEventData);
        result = await addEvent(newEventData);
        if (result.success && result.eventId) {
          const completedEvent = { 
            ...newEventData, 
            id: result.eventId 
          };
          console.log('Event added successfully:', completedEvent);
          onEventUpdated('add', completedEvent);
          // 추가 완료 후 모달 닫기
          onClose();
        } else {
          Alert.alert('오류', '일정 저장 중 오류가 발생했습니다.');
        }
      }
    } catch (error) {
      console.error('Event submission error:', error);
      Alert.alert('오류', '일정 저장 중 오류가 발생했습니다.');
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
          onCancel={() => {
            // 취소 시 바로 모달 닫기
            onClose();
          }}
          colors={colors}
        />
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
  
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {isEditing ? (editingEvent ? '일정 편집' : '새 일정') : '일정 상세'}
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
    height: '80%',
    paddingBottom: 20
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
  eventItem: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10
  },
  eventColor: {
    width: 4,
    borderRadius: 2,
    marginRight: 10
  },
  eventDetails: {
    flex: 1
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5
  },
  eventTime: {
    fontSize: 14,
    marginBottom: 3
  },
  eventDescription: {
    fontSize: 14,
    marginBottom: 5
  },
  eventMetaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center'
  },
  eventGroupContainer: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 8,
    marginBottom: 4
  },
  eventGroupText: {
    fontSize: 12
  },
  eventCreatorContainer: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4
  },
  eventCreatorText: {
    fontSize: 12
  },
  eventActions: {
    marginLeft: 10,
    justifyContent: 'center'
  },
  actionButton: {
    marginBottom: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4
  },
  actionButtonText: {
    fontSize: 12
  },
  deleteButton: {
  },
  deleteButtonText: {
    color: '#f44336',
    fontSize: 12
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
  
  // 폼 스타일
  formContainer: {
    flex: 1,
    padding: 15
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8
  },
  formInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
    fontSize: 16
  },
  textArea: {
    minHeight: 100
  },
  groupSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 15
  },
  groupOption: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
    paddingLeft: 16, // 왼쪽 여백 유지
    position: 'relative' // 절대 위치 배치를 위해 추가
  },
  selectedGroupOption: {
  },
  groupOptionText: {
    fontSize: 14
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15
  },
  cancelButton: {
    flex: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginRight: 10
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600'
  },
  submitButton: {
    flex: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center'
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600'
  },
  // 새로 추가된 스타일
  eventActionsDisabled: {
    marginLeft: 10,
    justifyContent: 'center',
    padding: 5
  },
  eventCreatorOnlyText: {
    fontSize: 10
  }
});

export default EventDetailModal;
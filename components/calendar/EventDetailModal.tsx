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
  ColorSchemeName,
  Switch
} from 'react-native';
import { addEvent, updateEvent, deleteEvent, CalendarEvent } from '../../services/calendarService';
import { Group } from '../../services/groupService';
import { formatDate, getMultiDayPosition } from '../../utils/dateUtils';
import { scheduleEventNotification, cancelEventNotification } from '../../services/notificationService';
import { TimeSlotPickerWithManual } from './TimeSlotPickerWithManual';

// 타입 정의 수정
interface CalendarDay {
  date: Date;
  formattedDate: string;
  [key: string]: any;
}

interface EventItemProps {
  event: CalendarEvent;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
  userId: string;
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
  user: { displayName?: string | null } | null;
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
  
  // 다일 일정인지 확인
  const isMultiDay = event.isMultiDay && event.startDate !== event.endDate;
  
  return (
    <View style={[styles.eventItem, { backgroundColor: colors.eventCardBackground }]}>
      <View style={[styles.eventColor, { backgroundColor: event.color || colors.tint }]} />
      
      <View style={styles.eventDetails}>
        <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
        
        {/* 다일 일정인 경우 기간 표시 */}
        {isMultiDay && (
          <Text style={[styles.eventDate, { color: colors.lightGray }]}>
            {formatDate(new Date(event.startDate), 'yyyy-MM-dd')} ~ {formatDate(new Date(event.endDate), 'yyyy-MM-dd')}
          </Text>
        )}

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
          
          {/* 다일 일정 배지 추가 */}
          {isMultiDay && (
            <View style={[styles.eventBadge, { backgroundColor: colors.tint + '20' }]}>
              <Text style={[styles.eventBadgeText, { color: colors.tint }]}>
                다일 일정
              </Text>
            </View>
          )}
          
          {/* 알림 표시 */}
          {event.notificationEnabled && (
            <View style={[styles.notificationBadge, { backgroundColor: colors.tint + '20' }]}>
              <Text style={[styles.notificationBadgeText, { color: colors.tint }]}>
                알림 {event.notificationMinutesBefore}분 전
              </Text>
            </View>
          )}
          
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
  
  // 시간 관련 상태 변경
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [time, setTime] = useState(event?.time || null);
  
  // 날짜 관련 상태 추가 - 다일 일정 지원
  const [startDate, setStartDate] = useState(event?.startDate || selectedDate.formattedDate);
  const [endDate, setEndDate] = useState(event?.endDate || selectedDate.formattedDate);
  const [isMultiDay, setIsMultiDay] = useState(event?.isMultiDay || false);
  
  // 날짜 선택 UI 상태
  const [datePickerMode, setDatePickerMode] = useState<'start' | 'end' | null>(null);
  
  // 그룹 선택 상태를 배열로 변경 (단순화)
  const [selectedGroups, setSelectedGroups] = useState<string[]>(
    event?.groupId ? [event.groupId] : ['personal']
  );
  
  // 알림 상태는 항상 비활성화
  const [enableNotification, setEnableNotification] = useState(false);
  
  // 간단한 날짜 증가/감소 함수 추가
  const incrementDate = (date: string, days: number): string => {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() + days);
    return formatDate(newDate, 'yyyy-MM-dd');
  };
  
  // 다일 일정 여부가 변경될 때 종료일 초기화
  useEffect(() => {
    if (!isMultiDay) {
      setEndDate(startDate);
    }
  }, [isMultiDay, startDate]);
  
  // 시간 선택 핸들러
  const handleTimeSelected = (selectedTime: string | null) => {
    setTime(selectedTime);
  };
  
  // 그룹 선택 핸들러 수정 (단순화)
  const handleGroupToggle = (groupId: string) => {
    setSelectedGroups(prevGroups => {
      // 그룹이 이미 선택되어 있는지 확인
      const isSelected = prevGroups.includes(groupId);
      
      if (isSelected) {
        // 최소 하나의 그룹은 선택되어 있어야 함
        if (prevGroups.length === 1) {
          return prevGroups;
        }
        
        // 선택 해제
        return prevGroups.filter(id => id !== groupId);
      } else {
        // 선택 추가
        return [...prevGroups, groupId];
      }
    });
  };
  
  // 날짜 선택 핸들러
  const handleDateSelect = (dateString: string) => {
    if (datePickerMode === 'start') {
      setStartDate(dateString);
      // 시작일이 종료일보다 늦은 경우 종료일도 시작일로 설정
      if (new Date(dateString) > new Date(endDate)) {
        setEndDate(dateString);
      }
    } else if (datePickerMode === 'end') {
      // 종료일이 시작일보다 빠른 경우 시작일로 설정
      if (new Date(dateString) < new Date(startDate)) {
        setEndDate(startDate);
      } else {
        setEndDate(dateString);
      }
    }
    
    // 날짜 선택 모드 초기화
    setDatePickerMode(null);
  };
  
  const handleSubmit = () => {
    if (!title.trim()) {
      Alert.alert('알림', '일정 제목을 입력해주세요.');
      return;
    }
    
    if (selectedGroups.length === 0) {
      Alert.alert('알림', '최소 하나의 그룹을 선택해주세요.');
      return;
    }
    
    // 종료일 검증
    if (isMultiDay && new Date(endDate) < new Date(startDate)) {
      Alert.alert('알림', '종료일은 시작일보다 빠를 수 없습니다.');
      return;
    }
    
    // 기존 이벤트를 업데이트하는 경우
    if (event?.id) {
      // 단일 그룹만 편집 가능 (기존 구조 유지)
      const eventData: CalendarEvent = {
        id: event.id,
        title: title.trim(),
        description: description.trim() || null,
        startDate: startDate,
        endDate: isMultiDay ? endDate : startDate,
        isMultiDay: isMultiDay,
        time: time || null,
        groupId: selectedGroups[0], // 첫 번째 선택된 그룹을 사용
        groupName: selectedGroups[0] === 'personal' 
          ? '개인 일정' 
          : groups.find(g => g.id === selectedGroups[0])?.name || '그룹 일정',
        color: getColorForGroup(selectedGroups[0]),
        createdAt: event.createdAt || new Date().toISOString(),
        notificationEnabled: false,
        notificationMinutesBefore: null,
        notificationId: null,
        isSharedEvent: selectedGroups.length > 1,
        targetGroupIds: selectedGroups
      };
      
      onSubmit(eventData);
    } else {
      // 새 이벤트를 여러 그룹에 추가하는 경우
      // 첫 번째 그룹을 메인 데이터로 사용 (UI 표시용)
      const mainGroupId = selectedGroups[0];
      
      const eventData: CalendarEvent = {
        title: title.trim(),
        description: description.trim() || null,
        startDate: startDate,
        endDate: isMultiDay ? endDate : startDate,
        isMultiDay: isMultiDay,
        time: time || null,
        groupId: mainGroupId,
        groupName: mainGroupId === 'personal' 
          ? '개인 일정' 
          : groups.find(g => g.id === mainGroupId)?.name || '그룹 일정',
        color: getColorForGroup(mainGroupId),
        createdAt: new Date().toISOString(),
        notificationEnabled: false,
        notificationMinutesBefore: null,
        notificationId: null,
        isSharedEvent: selectedGroups.length > 1,
        targetGroupIds: selectedGroups
      };
      
      onSubmit(eventData);
    }
  };
  
  // 그룹 ID에 따라 자동으로 색상 설정
  const getColorForGroup = (groupId: string): string => {
    if (groupId === 'personal') {
      return colors.tint; // 개인 일정 기본 색상
    } else {
      // 해당 그룹의 색상 찾기
      const group = groups.find(g => g.id === groupId);
      return group?.color || '#4CAF50'; // 그룹 색상이 없으면 기본값
    }
  };
  
  return (
    <View style={{ flex: 1 }}>
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
        
        {/* 날짜 선택 UI - 다일 일정 지원 (수정됨) */}
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: colors.text }]}>날짜</Text>
          
          <View style={styles.datePickerContainer}>
            <View style={styles.dateField}>
              <Text style={[styles.dateLabel, { color: colors.lightGray }]}>시작일</Text>
              <View style={styles.dateControlRow}>
                <TouchableOpacity
                  style={[styles.dateControlButton, { backgroundColor: colors.secondary }]}
                  onPress={() => setStartDate(incrementDate(startDate, -1))}
                >
                  <Text style={{ color: colors.text }}>-</Text>
                </TouchableOpacity>
                
                <View
                  style={[styles.dateButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                >
                  <Text style={[styles.dateButtonText, { color: colors.text }]}>
                    {formatDate(new Date(startDate), 'yyyy년 MM월 dd일')}
                  </Text>
                </View>
                
                <TouchableOpacity
                  style={[styles.dateControlButton, { backgroundColor: colors.secondary }]}
                  onPress={() => setStartDate(incrementDate(startDate, 1))}
                >
                  <Text style={{ color: colors.text }}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {isMultiDay && (
              <View style={styles.dateField}>
                <Text style={[styles.dateLabel, { color: colors.lightGray }]}>종료일</Text>
                <View style={styles.dateControlRow}>
                  <TouchableOpacity
                    style={[styles.dateControlButton, { backgroundColor: colors.secondary }]}
                    onPress={() => {
                      const newDate = incrementDate(endDate, -1);
                      if (new Date(newDate) >= new Date(startDate)) {
                        setEndDate(newDate);
                      }
                    }}
                  >
                    <Text style={{ color: colors.text }}>-</Text>
                  </TouchableOpacity>
                  
                  <View
                    style={[styles.dateButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                  >
                    <Text style={[styles.dateButtonText, { color: colors.text }]}>
                      {formatDate(new Date(endDate), 'yyyy년 MM월 dd일')}
                    </Text>
                  </View>
                  
                  <TouchableOpacity
                    style={[styles.dateControlButton, { backgroundColor: colors.secondary }]}
                    onPress={() => setEndDate(incrementDate(endDate, 1))}
                  >
                    <Text style={{ color: colors.text }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
          
          <View style={styles.multiDayToggle}>
            <Text style={[styles.toggleLabel, { color: colors.text }]}>다일 일정</Text>
            <Switch
              value={isMultiDay}
              onValueChange={(value) => {
                setIsMultiDay(value);
                if (!value) {
                  setEndDate(startDate); // 다일 일정이 아닌 경우 종료일을 시작일과 동일하게 설정
                }
              }}
              trackColor={{ false: colors.inputBorder, true: colors.tint + '80' }}
              thumbColor={isMultiDay ? colors.tint : colors.secondary}
            />
          </View>
        </View>
        
        {/* 시간 선택 UI */}
        <Text style={[styles.formLabel, { color: colors.text }]}>일시</Text>
        <TouchableOpacity
          style={[
            styles.timeButton,
            { 
              backgroundColor: colors.inputBackground, 
              borderColor: colors.inputBorder
            }
          ]}
          onPress={() => setTimePickerVisible(!timePickerVisible)}
        >
          <Text style={[
            styles.timeButtonText,
            { color: time ? colors.text : colors.lightGray }
          ]}>
            {time || '시간 선택하기'}
          </Text>
        </TouchableOpacity>
        
        {/* 시간 선택기 - 토글 방식 */}
        {timePickerVisible && (
          <TimeSlotPickerWithManual
            initialTime={time}
            onTimeSelected={handleTimeSelected}
            colors={colors}
          />
        )}
        
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
        
        <Text style={[styles.formLabel, { color: colors.text }]}>그룹 선택 (여러 그룹에 공유 가능)</Text>
        <View style={styles.groupSelector}>
          {/* 개인 일정 옵션 */}
          <TouchableOpacity
            style={[
              styles.groupOption,
              { 
                backgroundColor: selectedGroups.includes('personal') ? 
                  colors.secondary : colors.inputBackground
              },
              selectedGroups.includes('personal') && { 
                borderWidth: 1,
                borderColor: colors.tint
              }
            ]}
            onPress={() => handleGroupToggle('personal')}
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
                  backgroundColor: selectedGroups.includes(group.id) ? 
                    colors.secondary : colors.inputBackground
                },
                selectedGroups.includes(group.id) && { 
                  borderWidth: 1,
                  borderColor: group.color || colors.tint
                }
              ]}
              onPress={() => handleGroupToggle(group.id)}
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
        
        {/* 다중 그룹 선택 설명 추가 */}
        {selectedGroups.length > 1 && (
          <View style={styles.multiGroupInfoContainer}>
            <Text style={[styles.multiGroupInfoText, { color: colors.lightGray }]}>
              동일한 일정이 선택한 모든 그룹에 공유됩니다.
            </Text>
          </View>
        )}
        
        {/* 여백 추가 */}
        <View style={{ height: 80 }} />
      </ScrollView>
      
      {/* 하단 고정 버튼 */}
      <View style={[styles.stickyButtons, { 
        backgroundColor: colors.card,
        borderTopColor: colors.border
      }]}>
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
    </View>
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
                
                // 알림이 있으면 취소
                if (event.notificationId) {
                  await cancelEventNotification(event.notificationId);
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
    try {
      let result;
      
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
        result = await updateEvent(eventData.id, updatedEventData);
        
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
        
        let mainEventId = null;
        
        // 모든 선택된 그룹에 대해 이벤트 생성
        for (const groupId of targetGroupIds) {
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
            isSharedEvent: targetGroupIds.length > 1 // 공유 이벤트 여부 표시
          };
          
          // 이벤트 생성
          const result = await addEvent(groupEventData);
          
          if (result.success && result.eventId) {
            createdEvents.push({
              ...groupEventData,
              id: result.eventId
            });
            
            // 주 그룹의 이벤트 ID 저장
            if (groupId === mainGroupId) {
              mainEventId = result.eventId;
            }
          }
        }
        
        if (createdEvents.length > 0) {
          console.log(`Created ${createdEvents.length} events for ${targetGroupIds.length} groups`);
          
          // 모든 생성된 이벤트 중 주 그룹의 이벤트를 상위 컴포넌트에 전달
          const mainEvent = createdEvents.find(e => e.groupId === mainGroupId) || createdEvents[0];
          onEventUpdated('add', mainEvent);
          
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
          onCancel={onClose}
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
    height: '90%', // 높이 증가
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
  eventDate: {
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
  // 알림 배지 스타일
  notificationBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 8,
    marginBottom: 4
  },
  notificationBadgeText: {
    fontSize: 12,
  },
  // 다일 일정 배지 스타일
  eventBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 8,
    marginBottom: 4
  },
  eventBadgeText: {
    fontSize: 12,
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
  formGroup: {
    marginBottom: 15
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
  // 날짜 선택 스타일
  datePickerContainer: {
    flexDirection: 'column',
    marginBottom: 10
  },
  dateField: {
    marginBottom: 10
  },
  dateLabel: {
    fontSize: 12,
    marginBottom: 5
  },
  dateControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  dateControlButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateButton: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 10
  },
  dateButtonText: {
    fontSize: 14
  },
  multiDayToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '500'
  },
  // 그룹 선택 스타일
  groupSelector: {
    flexDirection: 'column', // 세로 방향으로 변경
    marginBottom: 10
  },
  groupOption: {
    flexDirection: 'row', // 가로 방향
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 12, // 패딩 증가
    marginBottom: 8, 
    paddingLeft: 14,
    position: 'relative',
    alignItems: 'center'
  },
  groupOptionText: {
    fontSize: 14
  },
  // 다중 그룹 정보 스타일
  multiGroupInfoContainer: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
    padding: 10,
    marginTop: 5,
    marginBottom: 15
  },
  multiGroupInfoText: {
    fontSize: 12,
    fontStyle: 'italic'
  },
  // 하단 고정 버튼 스타일
  stickyButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 15,
    borderTopWidth: 1,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0
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
  // 기타 스타일
  eventActionsDisabled: {
    marginLeft: 10,
    justifyContent: 'center',
    padding: 5
  },
  eventCreatorOnlyText: {
    fontSize: 10
  },
  // 시간 선택 버튼 스타일
  timeButton: {
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    justifyContent: 'center',
    marginBottom: 15
  },
  timeButtonText: {
    fontSize: 16
  }
});

export default EventDetailModal;
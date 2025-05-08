// components/calendar/event/EventForm.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Switch
} from 'react-native';
import { Group } from '../../../services/groupService';
import { CalendarEvent, deleteEvent } from '../../../services/calendarService';
import { TimeSlotPickerWithManual } from '../TimeSlotPickerWithManual';
import DatePicker from './DatePicker';
import GroupSelector from './GroupSelector';

interface EventFormProps {
  selectedDate: {
    date: Date;
    formattedDate: string;
    [key: string]: any;
  };
  event?: CalendarEvent;
  groups: Group[];
  onSubmit: (eventData: CalendarEvent) => void;
  onCancel: () => void;
  colors: any;
  onRemoveEventId?: () => void;
  onEventDeleted?: (eventId: string) => void; // 추가: 이벤트 삭제 콜백
}

const EventForm = ({ 
  selectedDate, 
  event, 
  groups, 
  onSubmit, 
  onCancel,
  colors,
  onRemoveEventId,
  onEventDeleted
}: EventFormProps) => {
  const [title, setTitle] = useState(event?.title || '');
  const [description, setDescription] = useState(event?.description || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 시간 관련 상태 변경
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [time, setTime] = useState(event?.time || null);
  
  // 날짜 관련 상태 추가 - 다일 일정 지원
  const [startDate, setStartDate] = useState(event?.startDate || selectedDate.formattedDate);
  const [endDate, setEndDate] = useState(event?.endDate || selectedDate.formattedDate);
  const [isMultiDay, setIsMultiDay] = useState(event?.isMultiDay || false);
  
  // 기존 이벤트 여부 확인
  const isExistingEvent = Boolean(event?.id);
  
  // 원래 그룹 ID 저장 (기존 이벤트인 경우)
  const originalGroupId = useMemo(() => 
    isExistingEvent ? event?.groupId : null
  , [isExistingEvent, event]);
  
  // 그룹 선택 상태를 배열로 변경 (단순화)
  const [selectedGroups, setSelectedGroups] = useState<string[]>(
    event?.groupId ? [event.groupId] : ['personal']
  );
  
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
  
  // 그룹 선택 핸들러 - 단순화
  const handleGroupToggle = (groupId: string) => {
    setSelectedGroups(prevGroups => {
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
  
  const handleSubmit = async () => {
    if (isSubmitting) return;
    
    if (!title.trim()) {
      Alert.alert('알림', '일정 제목을 입력해주세요.');
      return;
    }
    
    if (selectedGroups.length === 0) {
      Alert.alert('알림', '최소 하나의 그룹을 선택해주세요.');
      return;
    }
    
    if (isMultiDay && new Date(endDate) < new Date(startDate)) {
      Alert.alert('알림', '종료일은 시작일보다 빠를 수 없습니다.');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // 기존 이벤트 수정 시
      if (event?.id) {
        // 그룹 변경이 있는지 확인
        const isGroupChanged = selectedGroups.length > 1 || 
                              (selectedGroups.length === 1 && selectedGroups[0] !== event.groupId);
        
        if (isGroupChanged) {
          // 그룹이 변경된 경우: 기존 일정 삭제 후 새 일정 생성
          console.log('그룹 변경 감지 - 기존 일정 삭제 후 새로 생성');
          
          // 기존 메타데이터 보존
          const originalCreatedAt = event.createdAt;
          const originalEventId = event.id;
          
          try {
            // 1. 기존 일정 삭제
            const deleteResult = await deleteEvent(event.id);
            
            if (!deleteResult.success) {
              throw new Error('기존 일정 삭제 실패');
            }
            
            // 삭제 콜백 호출
            if (onEventDeleted) {
              onEventDeleted(originalEventId);
            }
            
            // 2. 새 일정으로 생성
            const mainGroupId = selectedGroups[0];
            const newEventData: CalendarEvent = {
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
              createdAt: originalCreatedAt || new Date().toISOString(), // 원래 생성 시간 유지
              notificationEnabled: event.notificationEnabled || false,
              notificationMinutesBefore: event.notificationMinutesBefore || null,
              notificationId: event.notificationId || null,
              isSharedEvent: selectedGroups.length > 1,
              targetGroupIds: selectedGroups,
            };
            
            // 알림 메시지 표시
            Alert.alert(
              '알림', 
              '그룹 변경을 위해 일정을 새로 생성했습니다.',
              [{ text: '확인' }]
            );
            
            // 새 일정으로 제출
            onSubmit(newEventData);
          } catch (error) {
            console.error('이벤트 교체 중 오류:', error);
            Alert.alert(
              '오류', 
              '그룹 변경 중 오류가 발생했습니다. 원래 일정이 유지됩니다.',
              [{ text: '확인' }]
            );
            setIsSubmitting(false);
            return;
          }
        } else {
          // 그룹 변경이 없는 경우: 기존 방식대로 업데이트
          const eventData: CalendarEvent = {
            id: event.id,
            title: title.trim(),
            description: description.trim() || null,
            startDate: startDate,
            endDate: isMultiDay ? endDate : startDate,
            isMultiDay: isMultiDay,
            time: time || null,
            groupId: selectedGroups[0],
            groupName: selectedGroups[0] === 'personal' 
              ? '개인 일정' 
              : groups.find(g => g.id === selectedGroups[0])?.name || '그룹 일정',
            color: getColorForGroup(selectedGroups[0]),
            createdAt: event.createdAt || new Date().toISOString(),
            notificationEnabled: event.notificationEnabled || false,
            notificationMinutesBefore: event.notificationMinutesBefore || null,
            notificationId: event.notificationId || null,
            isSharedEvent: false
          };
          
          onSubmit(eventData);
        }
      } else {
        // 새 이벤트 생성
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
    } catch (error) {
      console.error('Form submission error:', error);
      Alert.alert('오류', '일정 저장 중 오류가 발생했습니다.');
      setIsSubmitting(false);
    }
    
    setTimeout(() => {
      setIsSubmitting(false);
    }, 500);
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
        
        {/* 날짜 선택 UI - DatePicker 컴포넌트 사용 */}
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: colors.text }]}>날짜</Text>
          
          <DatePicker
            startDate={startDate}
            endDate={endDate}
            isMultiDay={isMultiDay}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            colors={colors}
          />
          
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
        
        {/* GroupSelector 컴포넌트 사용 */}
        <GroupSelector
          groups={groups}
          selectedGroups={selectedGroups}
          onToggleGroup={handleGroupToggle}
          colors={colors}
          isExistingEvent={isExistingEvent}
        />
        
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
          disabled={isSubmitting}
        >
          <Text style={[styles.cancelButtonText, { color: colors.darkGray }]}>취소</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[
            styles.submitButton, 
            { backgroundColor: colors.buttonBackground },
            isSubmitting && { backgroundColor: colors.disabledButton }
          ]} 
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <View style={styles.submitButtonContent}>
              <ActivityIndicator size="small" color={colors.buttonText} />
              <Text style={[styles.submitButtonText, { color: colors.buttonText, marginLeft: 8 }]}>
                저장 중...
              </Text>
            </View>
          ) : (
            <Text style={[styles.submitButtonText, { color: colors.buttonText }]}>저장</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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
  submitButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
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

export default EventForm;
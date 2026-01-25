// components/calendar/event/EventForm.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Switch,
  Platform,
  KeyboardAvoidingView,
  Keyboard
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Group } from '../../../services/groupService';
import { CalendarEvent, deleteEvent, RecurrenceType, RecurrenceSettings } from '../../../services/calendarService';
import { TimeSlotPickerWithManual } from '../TimeSlotPickerWithManual';
import DatePicker from './DatePicker';
import GroupSelector from './GroupSelector';
import { formatDate } from '../../../utils/dateUtils';
import { Attachment, PendingAttachment } from '../../../types/board';
import AttachmentPicker from '../../board/AttachmentPicker';
import { cacheService } from '../../../services/cacheService';

// 반복 유형 옵션
const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string }[] = [
  { value: 'none', label: '없음' },
  { value: 'weekly', label: '매주' },
  { value: 'monthly', label: '매월' },
  { value: 'yearly', label: '매년' },
];

const PERSONAL_COLOR_KEY = '@personal_event_color';

// 개인일정 색상 옵션 (빨주노초파남보 검정)
const PERSONAL_COLORS = [
  '#FF0000', // 빨강
  '#FF8C00', // 주황
  '#FFD700', // 노랑
  '#00C853', // 초록
  '#2196F3', // 파랑
  '#3F51B5', // 남색
  '#9C27B0', // 보라
  '#000000', // 검정
];

// 첨부파일 변경 정보 인터페이스
export interface AttachmentChanges {
  pendingAttachments: PendingAttachment[];
  existingAttachments: Attachment[];
}

interface EventFormProps {
  selectedDate: {
    date: Date;
    formattedDate: string;
    [key: string]: any;
  };
  event?: CalendarEvent;
  groups: Group[];
  onSubmit: (eventData: CalendarEvent, attachmentChanges?: AttachmentChanges) => void;
  onCancel: () => void;
  colors: any;
  onRemoveEventId?: () => void;
  onEventDeleted?: (eventId: string) => void;
  isSubmitting?: boolean; // 외부에서 전달받는 로딩 상태
}

const EventForm = ({
  selectedDate,
  event,
  groups,
  onSubmit,
  onCancel,
  colors,
  onRemoveEventId,
  onEventDeleted,
  isSubmitting = false
}: EventFormProps) => {
  const [title, setTitle] = useState(event?.title || '');
  const [description, setDescription] = useState(event?.description || '');
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);

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

  // 개인일정 색상 선택 상태
  const [personalColor, setPersonalColor] = useState(event?.color || '#4A90E2');
  const [showColorPicker, setShowColorPicker] = useState(false);

  // 반복 일정 관련 상태
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(
    event?.recurrence?.type || 'none'
  );
  const [recurrenceEndType, setRecurrenceEndType] = useState<'never' | 'until'>(
    event?.recurrence?.endType || 'never'
  );
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(
    event?.recurrence?.endDate || ''
  );
  const [showRecurrencePicker, setShowRecurrencePicker] = useState(false);
  const [showRecurrenceEndPicker, setShowRecurrenceEndPicker] = useState(false);

  // 년도/월 Picker용 상태 변수
  const [recurrenceEndYear, setRecurrenceEndYear] = useState(() => {
    if (event?.recurrence?.endDate) {
      return parseInt(event.recurrence.endDate.substring(0, 4), 10);
    }
    return new Date().getFullYear() + 1; // 기본값: 내년
  });
  const [recurrenceEndMonth, setRecurrenceEndMonth] = useState(() => {
    if (event?.recurrence?.endDate) {
      return parseInt(event.recurrence.endDate.substring(5, 7), 10);
    }
    return new Date().getMonth() + 1; // 기본값: 현재 월
  });
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  // 첨부파일 상태
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>(
    event?.attachments || []
  );

  // 저장된 개인일정 색상 불러오기
  useEffect(() => {
    const loadSavedColor = async () => {
      // 기존 이벤트 수정 시에는 이벤트의 색상 사용
      if (event?.color) return;

      try {
        const savedColor = await AsyncStorage.getItem(PERSONAL_COLOR_KEY);
        if (savedColor) {
          setPersonalColor(savedColor);
        }
      } catch (error) {
        console.log('저장된 색상 불러오기 실패:', error);
      }
    };
    loadSavedColor();
  }, [event?.color]);

  // 색상 변경 시 저장
  const handleColorChange = async (color: string) => {
    setPersonalColor(color);
    try {
      await AsyncStorage.setItem(PERSONAL_COLOR_KEY, color);
    } catch (error) {
      console.log('색상 저장 실패:', error);
    }
  };

  // 개인일정이 선택되어 있는지 확인 (다른 그룹과 함께 선택되어도 색상 선택 가능)
  const isPersonalSelected = selectedGroups.includes('personal');

  // 년도/월이 변경되면 recurrenceEndDate 자동 계산
  useEffect(() => {
    if (recurrenceEndType === 'until') {
      const lastDay = new Date(recurrenceEndYear, recurrenceEndMonth, 0).getDate();
      const newEndDate = `${recurrenceEndYear}-${String(recurrenceEndMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      setRecurrenceEndDate(newEndDate);
    }
  }, [recurrenceEndYear, recurrenceEndMonth, recurrenceEndType]);

  // 년도 옵션 생성 (현재년도 ~ 현재년도+10)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear + i);

  // 월 옵션 생성 (1~12)
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

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
  
  // 첨부파일 핸들러
  const handleAddAttachment = (attachment: PendingAttachment) => {
    setPendingAttachments(prev => [...prev, attachment]);
  };

  const handleRemovePending = (id: string) => {
    setPendingAttachments(prev => prev.filter(att => att.id !== id));
  };

  const handleRemoveExisting = (id: string) => {
    setExistingAttachments(prev => prev.filter(att => att.id !== id));
  };

  // 오프라인 상태 확인
  const isOnline = cacheService.getIsOnline();

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
              // 반복 설정 추가
              recurrence: recurrenceType !== 'none' ? {
                type: recurrenceType,
                endType: recurrenceEndType,
                endDate: recurrenceEndType === 'until' ? recurrenceEndDate : undefined
              } : undefined
            };
            
            // 알림 메시지 표시
            Alert.alert(
              '알림', 
              '그룹 변경을 위해 일정을 새로 생성했습니다.',
              [{ text: '확인' }]
            );
            
            // 새 일정으로 제출 (첨부파일 정보 포함)
            onSubmit(newEventData, {
              pendingAttachments,
              existingAttachments,
            });
          } catch (error) {
            console.error('이벤트 교체 중 오류:', error);
            Alert.alert(
              '오류',
              '그룹 변경 중 오류가 발생했습니다. 원래 일정이 유지됩니다.',
              [{ text: '확인' }]
            );
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
            isSharedEvent: false,
            // 반복 설정 추가
            recurrence: recurrenceType !== 'none' ? {
              type: recurrenceType,
              endType: recurrenceEndType,
              endDate: recurrenceEndType === 'until' ? recurrenceEndDate : undefined
            } : undefined
          };

          onSubmit(eventData, {
            pendingAttachments,
            existingAttachments,
          });
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
          targetGroupIds: selectedGroups,
          // 반복 설정 추가
          recurrence: recurrenceType !== 'none' ? {
            type: recurrenceType,
            endType: recurrenceEndType,
            endDate: recurrenceEndType === 'until' ? recurrenceEndDate : undefined
          } : undefined
        };

        onSubmit(eventData, {
          pendingAttachments,
          existingAttachments,
        });
      }
    } catch (error) {
      console.error('Form submission error:', error);
      Alert.alert('오류', '일정 저장 중 오류가 발생했습니다.');
    }
  };
  
  // 그룹 ID에 따라 자동으로 색상 설정
  const getColorForGroup = (groupId: string): string => {
    if (groupId === 'personal') {
      return personalColor; // 개인일정은 선택한 색상 사용
    } else {
      // 해당 그룹의 색상 찾기
      const group = groups.find(g => g.id === groupId);
      return group?.color || '#4CAF50'; // 그룹 색상이 없으면 기본값
    }
  };
  
return (
  <KeyboardAvoidingView
    style={{ flex: 1 }}
    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
  >
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.formContainer}
        contentContainerStyle={{ paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
      >
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
                  setEndDate(startDate);
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
          onPress={() => {
            Keyboard.dismiss(); // 키보드 내리기
            setTimePickerVisible(!timePickerVisible);
          }}
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

        {/* 첨부파일 섹션 */}
        <Text style={[styles.formLabel, { color: colors.text }]}>첨부파일</Text>
        {!isOnline && (
          <Text style={[styles.offlineWarning, { color: colors.warning || '#FF9800' }]}>
            오프라인 상태에서는 파일 첨부가 불가능합니다.
          </Text>
        )}
        <AttachmentPicker
          pendingAttachments={pendingAttachments}
          existingAttachments={existingAttachments}
          onAddAttachment={handleAddAttachment}
          onRemovePending={handleRemovePending}
          onRemoveExisting={handleRemoveExisting}
          colors={colors}
          disabled={isSubmitting || !isOnline}
        />

        {/* 반복 설정 섹션 */}
        <Text style={[styles.formLabel, { color: colors.text }]}>반복</Text>
        <TouchableOpacity
          style={[
            styles.recurrenceButton,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.inputBorder
            }
          ]}
          onPress={() => {
            Keyboard.dismiss();
            setShowRecurrencePicker(!showRecurrencePicker);
          }}
        >
          <Text style={[
            styles.recurrenceButtonText,
            { color: recurrenceType === 'none' ? colors.lightGray : colors.text }
          ]}>
            {RECURRENCE_OPTIONS.find(opt => opt.value === recurrenceType)?.label || '없음'}
          </Text>
          <Text style={{ color: colors.lightGray }}>
            {showRecurrencePicker ? '▲' : '▼'}
          </Text>
        </TouchableOpacity>

        {/* 반복 유형 선택 드롭다운 */}
        {showRecurrencePicker && (
          <View style={[styles.recurrenceOptions, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
            {RECURRENCE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.recurrenceOption,
                  recurrenceType === option.value && { backgroundColor: colors.tint + '20' }
                ]}
                onPress={() => {
                  setRecurrenceType(option.value);
                  setShowRecurrencePicker(false);
                  // 반복 없음 선택 시 종료일 설정 초기화
                  if (option.value === 'none') {
                    setRecurrenceEndType('never');
                    setRecurrenceEndDate('');
                  }
                }}
              >
                <Text style={[
                  styles.recurrenceOptionText,
                  { color: colors.text },
                  recurrenceType === option.value && { fontWeight: '600', color: colors.tint }
                ]}>
                  {option.label}
                </Text>
                {recurrenceType === option.value && (
                  <Text style={{ color: colors.tint }}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 반복 종료일 설정 (반복 선택 시에만 표시) */}
        {recurrenceType !== 'none' && (
          <View style={styles.recurrenceEndSection}>
            <Text style={[styles.formLabel, { color: colors.text }]}>반복 종료</Text>
            <TouchableOpacity
              style={[
                styles.recurrenceButton,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.inputBorder
                }
              ]}
              onPress={() => {
                Keyboard.dismiss();
                setShowRecurrenceEndPicker(!showRecurrenceEndPicker);
              }}
            >
              <Text style={[
                styles.recurrenceButtonText,
                { color: recurrenceEndType === 'never' ? colors.lightGray : colors.text }
              ]}>
                {recurrenceEndType === 'never'
                  ? '없음 (계속 반복)'
                  : recurrenceType === 'yearly'
                    ? `${recurrenceEndYear}년까지`
                    : `${recurrenceEndYear}년 ${recurrenceEndMonth}월까지`}
              </Text>
              <Text style={{ color: colors.lightGray }}>
                {showRecurrenceEndPicker ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>

            {/* 반복 종료 옵션 */}
            {showRecurrenceEndPicker && (
              <View style={[styles.recurrenceOptions, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
                <TouchableOpacity
                  style={[
                    styles.recurrenceOption,
                    recurrenceEndType === 'never' && { backgroundColor: colors.tint + '20' }
                  ]}
                  onPress={() => {
                    setRecurrenceEndType('never');
                    setRecurrenceEndDate('');
                    setShowRecurrenceEndPicker(false);
                  }}
                >
                  <Text style={[
                    styles.recurrenceOptionText,
                    { color: colors.text },
                    recurrenceEndType === 'never' && { fontWeight: '600', color: colors.tint }
                  ]}>
                    없음 (계속 반복)
                  </Text>
                  {recurrenceEndType === 'never' && (
                    <Text style={{ color: colors.tint }}>✓</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.recurrenceOption,
                    recurrenceEndType === 'until' && { backgroundColor: colors.tint + '20' }
                  ]}
                  onPress={() => {
                    setRecurrenceEndType('until');
                    setShowRecurrenceEndPicker(false);
                  }}
                >
                  <Text style={[
                    styles.recurrenceOptionText,
                    { color: colors.text },
                    recurrenceEndType === 'until' && { fontWeight: '600', color: colors.tint }
                  ]}>
                    날짜 지정
                  </Text>
                  {recurrenceEndType === 'until' && (
                    <Text style={{ color: colors.tint }}>✓</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* 종료일 Picker (년도 + 월) */}
            {recurrenceEndType === 'until' && (
              <View style={styles.recurrenceEndDatePicker}>
                <View style={styles.pickerRow}>
                  {/* 년도 Picker */}
                  <TouchableOpacity
                    style={[styles.pickerButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                    onPress={() => setShowYearPicker(!showYearPicker)}
                  >
                    <Text style={[styles.pickerButtonText, { color: colors.text }]}>
                      {recurrenceEndYear}년
                    </Text>
                    <Text style={{ color: colors.lightGray }}>{showYearPicker ? '▲' : '▼'}</Text>
                  </TouchableOpacity>

                  {/* 월 Picker (매년 반복이 아닐 때만 표시) */}
                  {recurrenceType !== 'yearly' && (
                    <TouchableOpacity
                      style={[styles.pickerButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, marginLeft: 10 }]}
                      onPress={() => setShowMonthPicker(!showMonthPicker)}
                    >
                      <Text style={[styles.pickerButtonText, { color: colors.text }]}>
                        {recurrenceEndMonth}월
                      </Text>
                      <Text style={{ color: colors.lightGray }}>{showMonthPicker ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                  )}

                  <Text style={[styles.pickerSuffix, { color: colors.text }]}>까지</Text>
                </View>

                {/* 년도 선택 드롭다운 */}
                {showYearPicker && (
                  <View style={[styles.pickerDropdown, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
                    <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                      {yearOptions.map((year) => (
                        <TouchableOpacity
                          key={year}
                          style={[
                            styles.pickerOption,
                            recurrenceEndYear === year && { backgroundColor: colors.tint + '20' }
                          ]}
                          onPress={() => {
                            setRecurrenceEndYear(year);
                            setShowYearPicker(false);
                          }}
                        >
                          <Text style={[
                            styles.pickerOptionText,
                            { color: colors.text },
                            recurrenceEndYear === year && { fontWeight: '600', color: colors.tint }
                          ]}>
                            {year}년
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* 월 선택 드롭다운 */}
                {showMonthPicker && recurrenceType !== 'yearly' && (
                  <View style={[styles.pickerDropdown, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
                    <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                      {monthOptions.map((month) => (
                        <TouchableOpacity
                          key={month}
                          style={[
                            styles.pickerOption,
                            recurrenceEndMonth === month && { backgroundColor: colors.tint + '20' }
                          ]}
                          onPress={() => {
                            setRecurrenceEndMonth(month);
                            setShowMonthPicker(false);
                          }}
                        >
                          <Text style={[
                            styles.pickerOptionText,
                            { color: colors.text },
                            recurrenceEndMonth === month && { fontWeight: '600', color: colors.tint }
                          ]}>
                            {month}월
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        <Text style={[styles.formLabel, { color: colors.text }]}>그룹 선택 (여러 그룹에 공유 가능)</Text>

        {/* GroupSelector 컴포넌트 사용 */}
        <GroupSelector
          groups={groups}
          selectedGroups={selectedGroups}
          onToggleGroup={handleGroupToggle}
          colors={colors}
          isExistingEvent={isExistingEvent}
        />

        {/* 개인일정 색상 선택 - 개인일정이 선택되었을 때 표시 */}
        {isPersonalSelected && (
          <View style={styles.colorPickerSection}>
            <TouchableOpacity
              style={styles.colorPickerHeader}
              onPress={() => {
                const newValue = !showColorPicker;
                setShowColorPicker(newValue);
                // 색상 피커가 열릴 때 스크롤을 아래로
                if (newValue) {
                  setTimeout(() => {
                    scrollViewRef.current?.scrollToEnd({ animated: true });
                  }, 100);
                }
              }}
            >
              <Text style={[styles.formLabel, { color: colors.text, marginBottom: 0 }]}>
                개인일정 색상선택
              </Text>
              <View style={styles.selectedColorPreview}>
                <View style={[styles.colorDot, { backgroundColor: personalColor }]} />
                <Text style={{ color: colors.lightGray, marginLeft: 8 }}>
                  {showColorPicker ? '접기' : '변경'}
                </Text>
              </View>
            </TouchableOpacity>

            {showColorPicker && (
              <View style={styles.colorGrid}>
                {PERSONAL_COLORS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      personalColor === color && styles.colorOptionSelected
                    ]}
                    onPress={() => handleColorChange(color)}
                  >
                    {personalColor === color && (
                      <Text style={styles.colorCheckmark}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

      </ScrollView>
      
      {/* 하단 고정 버튼 - KeyboardAvoidingView 안에 배치 */}
      <View style={[styles.stickyButtons, { 
        backgroundColor: colors.card,
        borderTopColor: colors.border,
        paddingBottom: Platform.OS === 'ios' ? 0 : 15  
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
  </KeyboardAvoidingView>
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
  offlineWarning: {
    fontSize: 12,
    marginBottom: 8,
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
  },
  colorPickerSection: {
    marginTop: 5,
    marginBottom: 15
  },
  colorPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10
  },
  selectedColorPreview: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    gap: 10
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center'
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5
  },
  colorCheckmark: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold'
  },
  // 반복 설정 관련 스타일
  recurrenceButton: {
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  recurrenceButtonText: {
    fontSize: 16
  },
  recurrenceOptions: {
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 15,
    overflow: 'hidden'
  },
  recurrenceOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.1)'
  },
  recurrenceOptionText: {
    fontSize: 16
  },
  recurrenceEndSection: {
    marginTop: 5,
    marginBottom: 10
  },
  recurrenceEndDatePicker: {
    marginTop: 10
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 8,
    minWidth: 100
  },
  pickerButtonText: {
    fontSize: 16,
    marginRight: 8
  },
  pickerSuffix: {
    fontSize: 16,
    marginLeft: 10
  },
  pickerDropdown: {
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 5,
    overflow: 'hidden'
  },
  pickerOption: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.1)'
  },
  pickerOptionText: {
    fontSize: 16
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
    alignItems: 'center'
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
  recurrenceEndHint: {
    fontSize: 12,
    marginTop: 5,
    textAlign: 'center'
  }
});

export default EventForm;
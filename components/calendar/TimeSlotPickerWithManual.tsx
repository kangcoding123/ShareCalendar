// components/calendar/TimeSlotPickerWithManual.tsx
import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet,
  TextInput,
  Platform
} from 'react-native';

interface TimeSlotPickerProps {
  initialTime?: string | null;
  onTimeSelected: (time: string | null) => void;
  colors: any;
}

export const TimeSlotPickerWithManual: React.FC<TimeSlotPickerProps> = ({
  initialTime = null,
  onTimeSelected,
  colors
}) => {
  // 초기값 파싱
  const parseInitialTime = () => {
    if (!initialTime) return { hour: null, minute: null };
    
    const parts = initialTime.split(':');
    if (parts.length !== 2) return { hour: null, minute: null };
    
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);
    
    if (isNaN(hour) || isNaN(minute)) return { hour: null, minute: null };
    
    return { hour, minute };
  };
  
  const initialParsed = parseInitialTime();
  
  // 시간과 분 선택 상태
  const [selectedHour, setSelectedHour] = useState<number | null>(initialParsed.hour);
  const [selectedMinute, setSelectedMinute] = useState<number | null>(initialParsed.minute);
  
  // 직접 입력 모드 상태
  const [manualMode, setManualMode] = useState(false);
  const [manualHour, setManualHour] = useState(initialParsed.hour !== null ? initialParsed.hour.toString() : '');
  const [manualMinute, setManualMinute] = useState(initialParsed.minute !== null ? initialParsed.minute.toString() : '');
  const [manualError, setManualError] = useState('');
  
  // 시간 범위 (7시~22시)
  const HOURS = Array.from({ length: 16 }, (_, i) => i + 7);
  
  // 분 범위 (10분 단위)
  const MINUTES = [0, 10, 20, 30, 40, 50];
  
  // 시간 유효성 검사
  const isValidTime = (hour: string, minute: string): boolean => {
    const h = parseInt(hour);
    const m = parseInt(minute);
    
    return !isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59;
  };
  
  // 선택된 시간이 변경될 때마다 콜백 호출
  useEffect(() => {
    if (!manualMode && selectedHour !== null && selectedMinute !== null) {
      const timeString = `${selectedHour.toString().padStart(2, '0')}:${selectedMinute.toString().padStart(2, '0')}`;
      onTimeSelected(timeString);
    }
  }, [selectedHour, selectedMinute, manualMode, onTimeSelected]);
  
  // 시간 선택 처리
  const handleHourSelect = (hour: number) => {
    setSelectedHour(hour);
    // 분이 선택되지 않았다면 0분으로 기본 설정
    if (selectedMinute === null) {
      setSelectedMinute(0);
    }
  };
  
  // 분 선택 처리
  const handleMinuteSelect = (minute: number) => {
    setSelectedMinute(minute);
  };
  
  // 직접 입력 처리
  const handleManualSubmit = () => {
    if (!manualHour || !manualMinute) {
      setManualError('시간과 분을 모두 입력해주세요');
      return;
    }
    
    if (!isValidTime(manualHour, manualMinute)) {
      setManualError('유효한 시간을 입력해주세요 (시: 0-23, 분: 0-59)');
      return;
    }
    
    setManualError('');
    const timeString = `${parseInt(manualHour).toString().padStart(2, '0')}:${parseInt(manualMinute).toString().padStart(2, '0')}`;
    onTimeSelected(timeString);
  };
  
  // 직접 입력 모드 전환
  const toggleManualMode = () => {
    if (!manualMode) {
      // 슬롯 모드 → 직접 입력 모드
      setManualMode(true);
      // 현재 선택된 값이 있으면 직접 입력 필드에 복사
      if (selectedHour !== null) setManualHour(selectedHour.toString());
      if (selectedMinute !== null) setManualMinute(selectedMinute.toString());
    } else {
      // 직접 입력 모드 → 슬롯 모드
      setManualMode(false);
      
      // 유효한 입력이 있으면 슬롯 모드 상태에 적용
      if (isValidTime(manualHour, manualMinute)) {
        const h = parseInt(manualHour);
        const m = parseInt(manualMinute);
        
        // 해당 슬롯이 존재하는 경우에만 선택 상태로 변환
        setSelectedHour(HOURS.includes(h) ? h : null);
        setSelectedMinute(MINUTES.includes(m) ? m : null);
      }
    }
  };
  
  return (
    <ScrollView style={styles.container}>
      {/* 모드 전환 버튼 */}
      <TouchableOpacity
        style={[styles.modeToggleButton, { backgroundColor: colors.secondary }]}
        onPress={toggleManualMode}
      >
        <Text style={[styles.modeToggleText, { color: colors.text }]}>
          {manualMode ? '시간 슬롯 선택하기' : '시간 직접 입력하기'}
        </Text>
      </TouchableOpacity>
      
      {manualMode ? (
        // 직접 입력 UI
        <View style={[styles.manualInputContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.timeInputRow}>
            <View style={styles.timeInputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>시</Text>
              <TextInput
                style={[styles.timeInput, { 
                  backgroundColor: colors.inputBackground, 
                  borderColor: colors.inputBorder,
                  color: colors.text
                }]}
                placeholder="0-23"
                placeholderTextColor={colors.lightGray}
                keyboardType="number-pad"
                value={manualHour}
                onChangeText={setManualHour}
                maxLength={2}
              />
            </View>
            
            <Text style={[styles.timeSeparator, { color: colors.text }]}>:</Text>
            
            <View style={styles.timeInputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>분</Text>
              <TextInput
                style={[styles.timeInput, { 
                  backgroundColor: colors.inputBackground, 
                  borderColor: colors.inputBorder,
                  color: colors.text
                }]}
                placeholder="0-59"
                placeholderTextColor={colors.lightGray}
                keyboardType="number-pad"
                value={manualMinute}
                onChangeText={setManualMinute}
                maxLength={2}
              />
            </View>
          </View>
          
          {manualError ? (
            <Text style={styles.errorText}>{manualError}</Text>
          ) : null}
          
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: colors.buttonBackground }]}
            onPress={handleManualSubmit}
          >
            <Text style={[styles.submitButtonText, { color: colors.buttonText }]}>
              적용하기
            </Text>
          </TouchableOpacity>
          
          <Text style={[styles.helpText, { color: colors.lightGray }]}>
            * 24시간 형식으로 입력해 주세요 (예: 오후 2시 = 14시)
          </Text>
        </View>
      ) : (
        // 슬롯 선택 UI
        <>
          {/* 시간 선택 UI */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>시간 선택</Text>
          <View style={styles.hoursContainer}>
            {HOURS.map(hour => (
              <TouchableOpacity
                key={`hour-${hour}`}
                style={[
                  styles.hourButton,
                  { 
                    backgroundColor: selectedHour === hour ? 
                      colors.tint : colors.inputBackground,
                    borderColor: selectedHour === hour ?
                      colors.tint : colors.inputBorder
                  }
                ]}
                onPress={() => handleHourSelect(hour)}
              >
                <Text 
                  style={[
                    styles.hourButtonText,
                    { color: selectedHour === hour ? colors.buttonText : colors.text }
                  ]}
                >
                  {hour}시
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          
          {/* 분 선택 UI - 시간이 선택된 경우에만 표시 */}
          {selectedHour !== null && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>분 선택</Text>
              <View style={styles.minutesContainer}>
                {MINUTES.map(minute => (
                  <TouchableOpacity
                    key={`minute-${minute}`}
                    style={[
                      styles.minuteButton,
                      { 
                        backgroundColor: selectedMinute === minute ? 
                          colors.tint : colors.inputBackground,
                        borderColor: selectedMinute === minute ?
                          colors.tint : colors.inputBorder
                      }
                    ]}
                    onPress={() => handleMinuteSelect(minute)}
                  >
                    <Text 
                      style={[
                        styles.minuteButtonText,
                        { color: selectedMinute === minute ? colors.buttonText : colors.text }
                      ]}
                    >
                      {minute}분
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 10,
    marginBottom: 15
  },
  modeToggleButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 15
  },
  modeToggleText: {
    fontSize: 15,
    fontWeight: '500'
  },
  manualInputContainer: {
    borderRadius: 8,
    padding: 15,
    borderWidth: 1,
    marginBottom: 10
  },
  timeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15
  },
  timeInputGroup: {
    width: '42%'
  },
  inputLabel: {
    fontSize: 14,
    marginBottom: 6
  },
  timeInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    textAlign: 'center'
  },
  timeSeparator: {
    fontSize: 24,
    fontWeight: 'bold'
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 14,
    marginBottom: 10
  },
  submitButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600'
  },
  helpText: {
    fontSize: 12,
    textAlign: 'center'
  },
  // 슬롯 선택 UI 스타일
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 8
  },
  hoursContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 15
  },
  hourButton: {
    width: '23%',  // 4개씩 표시
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1
  },
  hourButtonText: {
    fontSize: 14,
    fontWeight: '500'
  },
  minutesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 15
  },
  minuteButton: {
    width: '15%',  // 6개씩 표시
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1
  },
  minuteButtonText: {
    fontSize: 14,
    fontWeight: '500'
  },
  quickTimesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 15
  },
  quickTimeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8
  },
  quickTimeText: {
    fontSize: 14
  }
});
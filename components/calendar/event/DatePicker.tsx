// components/calendar/event/DatePicker.tsx
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet
} from 'react-native';
import { formatDate } from '../../../utils/dateUtils';

// 로컬 타임존으로 날짜 문자열을 파싱 (UTC 문제 방지)
const parseDateString = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// 날짜를 YYYY-MM-DD 형식 문자열로 변환
const formatDateToString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface DatePickerProps {
  startDate: string;
  endDate: string;
  isMultiDay: boolean;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  colors: any;
}

// 간단한 날짜 증가/감소 함수 (로컬 타임존 사용)
const incrementDate = (date: string, days: number): string => {
  const newDate = parseDateString(date);
  newDate.setDate(newDate.getDate() + days);
  return formatDateToString(newDate);
};

const DatePicker = ({ 
  startDate, 
  endDate, 
  isMultiDay, 
  onStartDateChange, 
  onEndDateChange,
  colors 
}: DatePickerProps) => {
  return (
    <View style={styles.datePickerContainer}>
      <View style={styles.dateField}>
        <Text style={[styles.dateLabel, { color: colors.lightGray }]}>시작일</Text>
        <View style={styles.dateControlRow}>
          <TouchableOpacity
            style={[styles.dateControlButton, { backgroundColor: colors.secondary }]}
            onPress={() => onStartDateChange(incrementDate(startDate, -1))}
          >
            <Text style={{ color: colors.text }}>-</Text>
          </TouchableOpacity>
          
          <View
            style={[styles.dateButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
          >
            <Text style={[styles.dateButtonText, { color: colors.text }]}>
              {formatDate(parseDateString(startDate), 'yyyy년 MM월 dd일')}
            </Text>
          </View>
          
          <TouchableOpacity
            style={[styles.dateControlButton, { backgroundColor: colors.secondary }]}
            onPress={() => onStartDateChange(incrementDate(startDate, 1))}
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
                if (parseDateString(newDate) >= parseDateString(startDate)) {
                  onEndDateChange(newDate);
                }
              }}
            >
              <Text style={{ color: colors.text }}>-</Text>
            </TouchableOpacity>

            <View
              style={[styles.dateButton, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
            >
              <Text style={[styles.dateButtonText, { color: colors.text }]}>
                {formatDate(parseDateString(endDate), 'yyyy년 MM월 dd일')}
              </Text>
            </View>
            
            <TouchableOpacity
              style={[styles.dateControlButton, { backgroundColor: colors.secondary }]}
              onPress={() => onEndDateChange(incrementDate(endDate, 1))}
            >
              <Text style={{ color: colors.text }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
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
  }
});

export default DatePicker;
// components/calendar/ZoomableCalendar.tsx
import React from 'react';
import { StyleSheet, View, Text, ColorSchemeName } from 'react-native';
import { ZoomableView } from '../ZoomableView';
import Calendar from './Calendar';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { CalendarDay } from '../../utils/dateUtils';
import { CalendarEvent } from '../../services/calendarService';

// 인터페이스에 필요한 props 추가
interface ZoomableCalendarProps {
  events: Record<string, CalendarEvent[]>;
  onDayPress: (day: CalendarDay, events: CalendarEvent[]) => void;
  colorScheme: ColorSchemeName;  // string | null | undefined 대신 ColorSchemeName 사용
  initialMonth?: Date;
  onMonthChange?: (month: Date) => void;  // Date 타입으로 받는 콜백
  scrollRef?: React.RefObject<any>;
}

export default function ZoomableCalendar({ 
  events, 
  onDayPress,
  colorScheme,
  initialMonth,  // 새로 추가
  onMonthChange,  // 새로 추가
  scrollRef
}: ZoomableCalendarProps) {
  const colors = Colors[colorScheme || 'light'];

  // Calendar의 onMonthChange prop이 direction을 받기 때문에
  // 여기서 어댑터 함수를 생성하여 변환해줍니다
  const handleMonthChange = (direction: 'prev' | 'next') => {
    if (!onMonthChange) return;
    
    // 현재 월을 기준으로 이전/다음 달 계산
    const currentDate = initialMonth || new Date();
    const newMonth = new Date(currentDate);
    
    if (direction === 'prev') {
      newMonth.setMonth(newMonth.getMonth() - 1);
    } else {
      newMonth.setMonth(newMonth.getMonth() + 1);
    }
    
    // 상위 컴포넌트에 Date 객체로 전달
    onMonthChange(newMonth);
  };

  return (
    <View style={styles.container}>
      {/* 확대/축소 안내 텍스트 */}
      <View style={[styles.helpTextContainer, { backgroundColor: colors.card + '80' }]}>
        <Text style={[styles.helpText, { color: colors.text }]}>
          두 손가락으로 확대/축소하세요
        </Text>
      </View>
      
      {/* 확대/축소 가능한 캘린더 */}
      <ZoomableView
        minScale={0.8}
        maxScale={2.0}
        style={styles.zoomableContainer}
        scrollRef={scrollRef}
      >
        <Calendar
          events={events}
          onDayPress={onDayPress}
          colorScheme={colorScheme}
          initialMonth={initialMonth}
          onMonthChange={handleMonthChange}
        />
      </ZoomableView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  zoomableContainer: {
    width: '100%',
  },
  helpTextContainer: {
    alignSelf: 'center',
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  helpText: {
    fontSize: 12,
    textAlign: 'center',
  }
});
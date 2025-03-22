// components/calendar/Calendar.tsx 전체 코드
import React, { useState, useEffect, useMemo } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  FlatList,
  useWindowDimensions,
  LayoutAnimation,
  Platform,
  UIManager
} from 'react-native';
import { addMonths, subMonths } from 'date-fns';

// 유틸리티 함수
import { 
  getCalendarDays, 
  formatDate, 
  getKoreanDayName,
  CalendarDay
} from '../../utils/dateUtils';

// 타입 및 서비스 가져오기
import { CalendarEvent } from '../../services/calendarService';

// 한국 공휴일 데이터
import { getHolidaysForYear } from '../../data/holidays';

// 레이아웃 애니메이션 활성화 (Android)
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

// 타입 정의
interface Holiday {
  name: string;
  isHoliday: boolean;
  date: string;
  isAlternative?: boolean;
  [key: string]: any;
}

interface CalendarProps {
  events?: Record<string, CalendarEvent[]>;
  onDayPress: (day: CalendarDay, events: CalendarEvent[]) => void;
}

const Calendar = ({ events = {}, onDayPress }: CalendarProps) => {
  // 화면 크기 가져오기
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  
  // 달력 가로 너비 계산 (화면 너비보다 약간 작게)
  const calendarWidth = screenWidth - 20; // 양쪽 10px 여백
  
  // 날짜 셀 너비 계산
  const dayWidth = calendarWidth / 7;
  
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [holidays, setHolidays] = useState<Record<string, Holiday>>({});
  
  // 월 변경 핸들러
  const handlePrevMonth = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCurrentDate(prevDate => subMonths(prevDate, 1));
  };
  
  const handleNextMonth = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCurrentDate(prevDate => addMonths(prevDate, 1));
  };
  
  // 주 수 계산
  const weekCount = useMemo(() => {
    return Math.ceil(calendarDays.length / 7);
  }, [calendarDays]);
  
  // 셀 높이 계산
  const cellHeight = useMemo(() => {
    // 화면 높이의 75%에 주 수를 나누어 셀 높이 계산 (헤더 높이 고려)
    const availableHeight = (screenHeight * 0.75 - 100); // 헤더, 요일 행 및 여백 고려
    const heightPerWeek = availableHeight / weekCount;
    
    // 최소 높이는 dayWidth의 1.2배로 조정
    return Math.max(heightPerWeek, dayWidth * 1.2);
  }, [screenHeight, weekCount, dayWidth]);
  
  // 달력 데이터 업데이트
  useEffect(() => {
    const days = getCalendarDays(currentDate);
    setCalendarDays(days);
    
    // 표시되는 모든 날짜의 연도 가져오기
    const years = [...new Set(days.map(day => day.date.getFullYear()))];
    
    // 모든 연도의 공휴일 가져오기
    const allHolidays: Record<string, Holiday> = {};
    years.forEach(year => {
      const yearHolidays = getHolidaysForYear(year);
      Object.assign(allHolidays, yearHolidays);
    });
    
    setHolidays(allHolidays);
  }, [currentDate]);
  
  // 달력 헤더 컴포넌트
  const CalendarHeader = () => {
    return (
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={handlePrevMonth} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>{'<'}</Text>
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>
          {formatDate(currentDate, 'yyyy년 MM월')}
        </Text>
        
        <TouchableOpacity onPress={handleNextMonth} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>{'>'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // 요일 이름 컴포넌트
  const DayNames = () => {
    const dayNames = Array.from({ length: 7 }, (_, i) => getKoreanDayName(i));
    
    return (
      <View style={styles.dayNamesContainer}>
        {dayNames.map((day, index) => (
          <View key={index} style={[styles.dayNameCell, { width: dayWidth }]}>
            <Text style={[
              styles.dayNameText, 
              index === 0 ? styles.sundayText : (index === 6 ? styles.saturdayText : {})
            ]}>
              {day}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  // 날짜 셀 렌더링 함수
  const renderDay = ({ item }: { item: CalendarDay }) => {
    const { date, isCurrentMonth, dayOfMonth, formattedDate, isToday } = item;
    
    // 휴일 정보 확인
    const holiday = holidays[formattedDate];
    
    // 주말 확인
    const dayOfWeek = date.getDay();
    const isSunday = dayOfWeek === 0;
    const isSaturday = dayOfWeek === 6;
    
    // 해당 날짜의 이벤트 가져오기
    const dayEvents = events[formattedDate] || [];
    
    return (
      <TouchableOpacity
        style={[
          styles.dayCell,
          { 
            width: dayWidth, 
            height: cellHeight 
          },
          !isCurrentMonth && styles.outsideMonthCell,
          isToday && styles.todayCell
        ]}
        onPress={() => onDayPress(item, dayEvents)}
      >
        <View style={styles.dayContent}>
          <Text style={[
            styles.dayText,
            !isCurrentMonth && styles.outsideMonthText,
            isSunday && styles.sundayText,
            isSaturday && styles.saturdayText,
            holiday && styles.holidayText,
            isToday && styles.todayText
          ]}>
            {dayOfMonth}
          </Text>
          
          {holiday && (
            <Text style={[
              styles.holidayName, 
              holiday.isAlternative && styles.alternativeHolidayName
            ]} numberOfLines={1} ellipsizeMode="tail">
              {holiday.name}
            </Text>
          )}
          
          {/* 이벤트 표시 (최대 3개) */}
          <View style={styles.eventContainer}>
            {dayEvents.slice(0, 3).map((calendarEvent, index) => (
              <View 
                key={index} 
                style={[
                  styles.eventIndicator,
                  { backgroundColor: calendarEvent.color || '#3c66af' }
                ]}
              >
                <Text style={styles.eventText} numberOfLines={1} ellipsizeMode="tail">
                  {calendarEvent.title}
                </Text>
              </View>
            ))}
            
            {/* 더 많은 이벤트가 있는 경우 +N 표시 */}
            {dayEvents.length > 3 && (
              <Text style={styles.moreEventsText}>+{dayEvents.length - 3}</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };
  
  return (
    <View style={[styles.container, { 
      width: calendarWidth, 
      minHeight: cellHeight * weekCount + 100 // 헤더와 요일 행 포함한 최소 높이
    }]}>
      <CalendarHeader />
      <DayNames />
      
      <FlatList
        data={calendarDays}
        renderItem={renderDay}
        keyExtractor={(item) => item.formattedDate}
        numColumns={7}
        scrollEnabled={false}
        contentContainerStyle={{ alignSelf: 'center' }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
    alignSelf: 'center',
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 15
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  headerButton: {
    padding: 10
  },
  headerButtonText: {
    fontSize: 18,
    color: '#3c66af',
    fontWeight: 'bold'
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333'
  },
  dayNamesContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#f9f9f9'
  },
  dayNameCell: {
    paddingVertical: 8,
    alignItems: 'center'
  },
  dayNameText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666'
  },
  dayCell: {
    padding: 2,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: '#eee'
  },
  dayContent: {
    flex: 1,
    padding: 2
  },
  dayText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
    fontWeight: '500',
    color: '#333'
  },
  outsideMonthCell: {
    backgroundColor: '#f9f9f9'
  },
  outsideMonthText: {
    color: '#bbb'
  },
  todayCell: {
    backgroundColor: '#e6f0ff'
  },
  todayText: {
    fontWeight: 'bold',
    color: '#3c66af'
  },
  sundayText: {
    color: '#ff3b30'
  },
  saturdayText: {
    color: '#007aff'
  },
  holidayText: {
    color: '#ff3b30',
    fontWeight: 'bold'
  },
  holidayName: {
    fontSize: 8,
    color: '#ff3b30',
    marginBottom: 2,
    textAlign: 'center'
  },
  alternativeHolidayName: {
    color: '#ff6a4a',
    fontStyle: 'italic'
  },
  eventContainer: {
    flex: 1,
    marginTop: 2
  },
  eventIndicator: {
    height: 14,
    borderRadius: 2,
    marginBottom: 2,
    paddingHorizontal: 2,
    justifyContent: 'center'
  },
  eventText: {
    fontSize: 8,
    color: '#fff',
    fontWeight: '500'
  },
  moreEventsText: {
    fontSize: 8,
    color: '#666',
    textAlign: 'center',
    marginTop: 2
  }
});

export default Calendar;
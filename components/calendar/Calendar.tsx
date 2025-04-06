// components/calendar/Calendar.tsx
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
  UIManager,
  ColorSchemeName
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
  colorScheme: ColorSchemeName;
  initialMonth?: Date; // 추가
  onMonthChange?: (month: Date) => void; // 추가
}

const Calendar = ({ 
  events = {}, 
  onDayPress, 
  colorScheme,
  initialMonth,  // 추가된 prop
  onMonthChange  // 추가된 prop
}: CalendarProps) => {
  // 다크 모드 여부 확인
  const isDark = colorScheme === 'dark';
  
  // 화면 크기 가져오기
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  
  // 달력 가로 너비 계산 (화면 너비보다 약간 작게)
  const calendarWidth = screenWidth - 20; // 양쪽 10px 여백
  
  // 날짜 셀 너비 계산
  const dayWidth = calendarWidth / 7;
  
  // initialMonth prop이 전달되면 사용, 아니면 현재 날짜 사용
  const [currentDate, setCurrentDate] = useState<Date>(initialMonth || new Date());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [holidays, setHolidays] = useState<Record<string, Holiday>>({});
  
  // initialMonth prop이 변경되면 currentDate 업데이트
  useEffect(() => {
    if (initialMonth) {
      setCurrentDate(initialMonth);
    }
  }, [initialMonth]);
  
  // 월 변경 핸들러
  const handlePrevMonth = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newDate = subMonths(currentDate, 1);
    setCurrentDate(newDate);
    // onMonthChange 콜백 호출 추가
    if (onMonthChange) {
      onMonthChange(newDate);
    }
  };
  
  const handleNextMonth = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newDate = addMonths(currentDate, 1);
    setCurrentDate(newDate);
    // onMonthChange 콜백 호출 추가
    if (onMonthChange) {
      onMonthChange(newDate);
    }
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
      <View style={[styles.headerContainer, { borderBottomColor: isDark ? '#333333' : '#eeeeee' }]}>
        <TouchableOpacity onPress={handlePrevMonth} style={styles.headerButton}>
          <Text style={[styles.headerButtonText, { color: isDark ? '#4e7bd4' : '#3c66af' }]}>{'<'}</Text>
        </TouchableOpacity>
        
        <Text style={[styles.headerTitle, { color: isDark ? '#ffffff' : '#333333' }]}>
          {formatDate(currentDate, 'yyyy년 MM월')}
        </Text>
        
        <TouchableOpacity onPress={handleNextMonth} style={styles.headerButton}>
          <Text style={[styles.headerButtonText, { color: isDark ? '#4e7bd4' : '#3c66af' }]}>{'>'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // 요일 이름 컴포넌트
  const DayNames = () => {
    const dayNames = Array.from({ length: 7 }, (_, i) => getKoreanDayName(i));
    
    return (
      <View style={[styles.dayNamesContainer, { 
        borderBottomColor: isDark ? '#333333' : '#eeeeee',
        backgroundColor: isDark ? '#1e1e1e' : '#f9f9f9'
      }]}>
        {dayNames.map((day, index) => (
          <View key={index} style={[styles.dayNameCell, { width: dayWidth }]}>
            <Text style={[
              styles.dayNameText, 
              { color: isDark ? '#bbbbbb' : '#666666' },
              index === 0 ? { color: isDark ? '#ff6b6b' : '#ff3b30' } : 
                (index === 6 ? { color: isDark ? '#63a4ff' : '#007aff' } : {})
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
            height: cellHeight,
            backgroundColor: isDark ? '#2c2c2c' : '#ffffff', 
            borderColor: isDark ? '#333333' : '#eeeeee'
          },
          !isCurrentMonth && { 
            backgroundColor: isDark ? '#242424' : '#f9f9f9' 
          },
          isToday && { 
            backgroundColor: isDark ? '#3a3a3a' : '#e6f0ff' 
          }
        ]}
        onPress={() => onDayPress(item, dayEvents)}
      >
        <View style={styles.dayContent}>
          <Text style={[
            styles.dayText,
            { color: isDark ? '#e0e0e0' : '#333333' },
            !isCurrentMonth && { color: isDark ? '#666666' : '#bbbbbb' },
            isSunday && { color: isDark ? '#ff6b6b' : '#ff3b30' },
            isSaturday && { color: isDark ? '#63a4ff' : '#007aff' },
            holiday && { color: isDark ? '#ff6b6b' : '#ff3b30' },
            isToday && { color: isDark ? '#4e7bd4' : '#3c66af' }
          ]}>
            {dayOfMonth}
          </Text>
          
          {holiday && (
            <Text style={[
              styles.holidayName, 
              { color: isDark ? '#ff6b6b' : '#ff3b30' },
              holiday.isAlternative && { 
                color: isDark ? '#ff8a80' : '#ff6a4a' 
              }
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
              <Text style={[styles.moreEventsText, { color: isDark ? '#bbbbbb' : '#666666' }]}>
                +{dayEvents.length - 3}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };
  
  return (
    <View style={[
      styles.container, 
      { 
        width: calendarWidth, 
        minHeight: cellHeight * weekCount + 100, // 헤더와 요일 행 포함한 최소 높이
        backgroundColor: isDark ? '#1e1e1e' : '#ffffff',
        shadowColor: isDark ? 'transparent' : '#000000'
      }
    ]}>
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
    borderRadius: 10,
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
    borderBottomWidth: 1
  },
  headerButton: {
    padding: 10
  },
  headerButtonText: {
    fontSize: 18,
    fontWeight: 'bold'
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold'
  },
  dayNamesContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1
  },
  dayNameCell: {
    paddingVertical: 8,
    alignItems: 'center'
  },
  dayNameText: {
    fontSize: 12,
    fontWeight: '600'
  },
  dayCell: {
    padding: 2,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5
  },
  dayContent: {
    flex: 1,
    padding: 2
  },
  dayText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
    fontWeight: '500'
  },
  outsideMonthCell: {
  },
  outsideMonthText: {
  },
  todayCell: {
  },
  todayText: {
    fontWeight: 'bold'
  },
  sundayText: {
  },
  saturdayText: {
  },
  holidayText: {
    fontWeight: 'bold'
  },
  holidayName: {
    fontSize: 8,
    marginBottom: 2,
    textAlign: 'center'
  },
  alternativeHolidayName: {
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
    textAlign: 'center',
    marginTop: 2
  }
});

export default Calendar;
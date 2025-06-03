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
import { addMonths, subMonths, isSameMonth } from 'date-fns';

// 유틸리티 함수
import { 
  getCalendarDays, 
  formatDate, 
  getKoreanDayName,
  CalendarDay,
  getMultiDayPosition
} from '../../utils/dateUtils';

// 타입 및 서비스 가져오기
import { CalendarEvent } from '../../services/calendarService';

// 한국 공휴일 데이터
import { getHolidaysForYear } from '../../data/holidays';
import { getAllHolidaysForYear } from '../../services/holidayService';

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
  isTemporary?: boolean;
  [key: string]: any;
}

interface CalendarProps {
  events?: Record<string, CalendarEvent[]>;
  onDayPress: (day: CalendarDay, events: CalendarEvent[]) => void;
  colorScheme: ColorSchemeName;
  initialMonth?: Date;
  onMonthChange?: (direction: 'prev' | 'next') => void;
}

// 헤더와 요일 행 높이 고정
const HEADER_HEIGHT = 45;
const DAY_NAMES_HEIGHT = 30;

const Calendar = ({ 
  events = {}, 
  onDayPress, 
  colorScheme,
  initialMonth,
  onMonthChange
}: CalendarProps) => {
  // 다크 모드 여부 확인
  const isDark = colorScheme === 'dark';
  
  // 화면 크기 가져오기
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  
  // 달력 가로 너비 계산
  const calendarWidth = screenWidth;
  
  // 날짜 셀 너비 계산
  const dayWidth = calendarWidth / 7;
  
  // 상태 관리
  const [currentDate, setCurrentDate] = useState<Date>(initialMonth || new Date());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [holidays, setHolidays] = useState<Record<string, Holiday>>({});
  const [holidaysLoading, setHolidaysLoading] = useState(false);
  
  // initialMonth prop이 변경될 때 currentDate 업데이트
  useEffect(() => {
    if (initialMonth) {
      if (!isSameMonth(initialMonth, currentDate)) {
        setCurrentDate(initialMonth);
      }
    }
  }, [initialMonth, currentDate]);
  
  // 월 변경 핸들러
  const handlePrevMonth = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    
    if (onMonthChange) {
      onMonthChange('prev');
    } else {
      const newDate = subMonths(currentDate, 1);
      setCurrentDate(newDate);
    }
  };
  
  const handleNextMonth = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    
    if (onMonthChange) {
      onMonthChange('next');
    } else {
      const newDate = addMonths(currentDate, 1);
      setCurrentDate(newDate);
    }
  };
  
  // 주 수 계산
  const weekCount = useMemo(() => {
    return Math.ceil(calendarDays.length / 7);
  }, [calendarDays]);
  
  // 셀 높이 계산
  const cellHeight = useMemo(() => {
    const heightRatio = Platform.OS === 'ios' ? 0.78 : 0.87;
    const availableHeight = screenHeight * heightRatio - HEADER_HEIGHT - DAY_NAMES_HEIGHT;
    return Math.max(availableHeight / weekCount, 40);
  }, [screenHeight, weekCount]);
  
  // 달력 데이터 업데이트 (비동기 처리 추가)
  useEffect(() => {
    const loadCalendarData = async () => {
      setHolidaysLoading(true);
      
      const days = getCalendarDays(currentDate);
      setCalendarDays(days);
      
      // 표시되는 모든 날짜의 연도 가져오기
      const years = [...new Set(days.map(day => day.date.getFullYear()))];
      
      // 모든 연도의 공휴일 가져오기 (임시 공휴일 포함)
      const allHolidays: Record<string, Holiday> = {};
      
      // 비동기로 각 연도의 공휴일 로드
      for (const year of years) {
        try {
          // getAllHolidaysForYear는 비동기 함수 - 정적 + 임시 공휴일 모두 포함
          const yearHolidays = await getAllHolidaysForYear(year);
          Object.assign(allHolidays, yearHolidays);
          
          console.log(`${year}년 공휴일 로드 완료:`, Object.keys(yearHolidays).length, '개');
        } catch (error) {
          console.error(`${year}년 공휴일 로드 오류:`, error);
          // 오류 시 정적 공휴일만 가져오기
          const staticHolidays = getHolidaysForYear(year);
          Object.assign(allHolidays, staticHolidays);
        }
      }
      
      setHolidays(allHolidays);
      setHolidaysLoading(false);
    };
    
    loadCalendarData();
  }, [currentDate]);
  
  // 달력 헤더 컴포넌트
  const CalendarHeader = () => {
    return (
      <View style={[
        styles.headerContainer, 
        { 
          height: HEADER_HEIGHT, 
          borderBottomColor: isDark ? '#333333' : '#eeeeee' 
        }
      ]}>
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
      <View style={[
        styles.dayNamesContainer, 
        { 
          height: DAY_NAMES_HEIGHT,
          borderBottomColor: isDark ? '#333333' : '#eeeeee',
          backgroundColor: isDark ? '#1e1e1e' : '#f9f9f9'
        }
      ]}>
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
    
    // 디버깅: 임시 공휴일 확인
    if (holiday && holiday.isTemporary) {
      console.log(`임시 공휴일 발견: ${formattedDate} - ${holiday.name}`);
    }
    
    // 각 이벤트에 다일 일정 위치 정보 추가
    const eventsWithPositions = dayEvents.map(event => {
      if (event.isMultiDay && event.startDate !== event.endDate) {
        const position = getMultiDayPosition(formattedDate, event.startDate, event.endDate);
        return {
          ...event,
          multiDayPosition: position
        };
      }
      return {
        ...event,
        multiDayPosition: 'single'
      };
    });
    
    // 표시할 이벤트 수 조정
    const maxEventsToShow = cellHeight < 60 ? 2 : (cellHeight < 80 ? 3 : 5);
    
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
            holiday && holiday.isHoliday && { color: isDark ? '#ff6b6b' : '#ff3b30' }, // 공휴일 색상
            isToday && { color: isDark ? '#4e7bd4' : '#3c66af' }
          ]}>
            {dayOfMonth}
          </Text>
          
          {/* 공휴일 이름 표시 (선택사항) */}
          {holiday && holiday.isHoliday && (
            <Text style={[
              styles.holidayNameText,
              { color: isDark ? '#ff6b6b' : '#ff3b30' }
            ]} numberOfLines={1}>
              {holiday.name}
            </Text>
          )}
          
          {/* 이벤트 표시 */}
          <View style={styles.eventContainer}>
            {eventsWithPositions.slice(0, maxEventsToShow).map((calendarEvent, index) => (
              <View 
                key={index}
                style={[
                  styles.eventIndicator,
                  calendarEvent.isMultiDay && calendarEvent.multiDayPosition === 'start' && styles.eventStart,
                  calendarEvent.isMultiDay && calendarEvent.multiDayPosition === 'middle' && styles.eventMiddle,
                  calendarEvent.isMultiDay && calendarEvent.multiDayPosition === 'end' && styles.eventEnd,
                  { backgroundColor: calendarEvent.color || '#3c66af' }
                ]}
              >
                <Text style={styles.eventText} numberOfLines={1} ellipsizeMode="tail">
                  {calendarEvent.title}
                </Text>
              </View>
            ))}
            
            {dayEvents.length > maxEventsToShow && (
              <Text style={[styles.moreEventsText, { color: isDark ? '#bbbbbb' : '#666666' }]}>
                +{dayEvents.length - maxEventsToShow}
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
        backgroundColor: 'transparent',
        ...Platform.select({
          ios: {
            shadowOpacity: 0,
            shadowRadius: 0,
          },
          android: {
            elevation: 0,
          }
        })
      }
    ]}>
      <CalendarHeader />
      <DayNames />
      
      <View style={styles.calendarBody}>
        <FlatList
          data={calendarDays}
          renderItem={renderDay}
          keyExtractor={(item) => item.formattedDate}
          numColumns={7}
          scrollEnabled={false}
          contentContainerStyle={{ alignSelf: 'center' }}
          initialNumToRender={42}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 0,
    overflow: 'hidden',
    alignSelf: 'center',
    marginVertical: 0,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    borderBottomWidth: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  dayNameCell: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  dayNameText: {
    fontSize: 12,
    fontWeight: '600'
  },
  calendarBody: {
  },
  dayCell: {
    padding: 1,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5
  },
  dayContent: {
    flex: 1,
    padding: 1
  },
  dayText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 1,
    fontWeight: '500'
  },
  holidayNameText: {
    fontSize: 8,
    textAlign: 'center',
    marginBottom: 1,
  },
  eventContainer: {
    flex: 1,
    marginTop: 1,
    overflow: 'hidden'
  },
  eventIndicator: {
    height: 13,
    borderRadius: 2,
    marginBottom: 1,
    paddingHorizontal: 2,
    justifyContent: 'center'
  },
  eventStart: {
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    marginRight: 0,
    paddingRight: 4
  },
  eventMiddle: {
    borderRadius: 0,
    marginLeft: 0,
    marginRight: 0,
    paddingLeft: 4,
    paddingRight: 4
  },
  eventEnd: {
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    marginLeft: 0,
    paddingLeft: 4
  },
  eventText: {
    fontSize: 8,
    color: '#fff',
    fontWeight: '500'
  },
  moreEventsText: {
    fontSize: 8,
    textAlign: 'center',
    marginTop: 1
  }
});

export default Calendar;
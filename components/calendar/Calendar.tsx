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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

// 🔥 삭제: 공휴일 데이터 import 제거
// import { getHolidaysForYear } from '../../data/holidays';
// import { getAllHolidaysForYear } from '../../services/holidayService';

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

// 🔥 수정: CalendarProps에 holidays 추가
interface CalendarProps {
  events?: Record<string, CalendarEvent[]>;
  onDayPress: (day: CalendarDay, events: CalendarEvent[]) => void;
  colorScheme: ColorSchemeName;
  initialMonth?: Date;
  onMonthChange?: (direction: 'prev' | 'next') => void;
  containerHeight?: number;
  holidays?: Record<string, Holiday>;  // 🔥 추가: 공휴일 props
}

// 헤더와 요일 행 높이 고정
const HEADER_HEIGHT = 45;
const DAY_NAMES_HEIGHT = 30;

const Calendar = ({ 
  events = {}, 
  onDayPress, 
  colorScheme,
  initialMonth,
  onMonthChange,
  containerHeight,
  holidays = {}  // 🔥 추가: 기본값 설정
}: CalendarProps) => {
  // 다크 모드 여부 확인
  const isDark = colorScheme === 'dark';
  
  // Safe Area Insets 추가
  const insets = useSafeAreaInsets();
  
  // 화면 크기 가져오기
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  
  // 달력 가로 너비 계산
  const calendarWidth = screenWidth;
  
  // 날짜 셀 너비 계산
  const dayWidth = calendarWidth / 7;
  
  // 상태 관리
  const [currentDate, setCurrentDate] = useState<Date>(initialMonth || new Date());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  // 🔥 삭제: 공휴일 관련 상태와 ref들
  // const [holidays, setHolidays] = useState<Record<string, Holiday>>({});
  // const [holidaysLoading, setHolidaysLoading] = useState(false);
  // const loadingMonthRef = useRef<string | null>(null);
  // const loadedHolidaysRef = useRef<Set<number>>(new Set());
  
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
    const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 70 : 60;
    const AD_BANNER_HEIGHT = 60;
    
    // 화면 비율 계산 (높이/너비)
    const screenRatio = screenHeight / screenWidth;
    
    // 화면 비율에 따라 여유 공간 동적 조정
    let EXTRA_PADDING = 0;
    if (screenRatio > 2.3) {
      // Z Flip 같은 매우 긴 화면 (21:9 이상)
      EXTRA_PADDING = 50;
    } else if (screenRatio > 2.1) {
      // 약간 긴 화면
      EXTRA_PADDING = 30;
    } else {
      // 일반 화면 (16:9, 18:9 등)
      EXTRA_PADDING = 10;
    }
    
    const availableHeight = screenHeight - 
      insets.top -
      TAB_BAR_HEIGHT -
      AD_BANNER_HEIGHT -
      HEADER_HEIGHT -
      DAY_NAMES_HEIGHT -
      EXTRA_PADDING;
    
    return Math.max(availableHeight / weekCount, 60);
  }, [screenHeight, screenWidth, weekCount, insets]);
  
  // 🔥 수정: 달력 데이터 업데이트 - 공휴일 로드 로직 제거
  useEffect(() => {
    const days = getCalendarDays(currentDate);
    setCalendarDays(days);
    // 🔥 삭제: 공휴일 로드 로직 전체 제거
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
    
    // 🔥 수정: props에서 공휴일 정보 가져오기
    const holiday = holidays[formattedDate];
    
    // 주말 확인
    const dayOfWeek = date.getDay();
    const isSunday = dayOfWeek === 0;
    const isSaturday = dayOfWeek === 6;
    
    // 해당 날짜의 이벤트 가져오기
    const dayEvents = events[formattedDate] || [];
    
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
            holiday && holiday.isHoliday && { color: isDark ? '#ff6b6b' : '#ff3b30' },
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
// components/calendar/CalendarPager.tsx
import React, { useState, useRef, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  FlatList, 
  ColorSchemeName, 
  Dimensions, 
  ViewToken,
  LayoutAnimation,
  Platform,
  UIManager
} from 'react-native';
import { addMonths, format, isSameMonth } from 'date-fns';
import Calendar from './Calendar';
import { CalendarDay } from '../../utils/dateUtils';
import { CalendarEvent } from '../../services/calendarService';

// Android에서 LayoutAnimation 활성화
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

interface CalendarPagerProps {
  events: Record<string, CalendarEvent[]>;
  onDayPress: (day: CalendarDay, events: CalendarEvent[]) => void;
  colorScheme: ColorSchemeName;
  initialMonth?: Date;
  onMonthChange?: (month: Date) => void;
}

// 화면 너비와 월 범위 설정
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MONTHS_TO_SHOW = 50; // 앞뒤로 각각 50개월까지 표시 가능

const CalendarPager: React.FC<CalendarPagerProps> = ({
  events,
  onDayPress,
  colorScheme,
  initialMonth,
  onMonthChange,
}) => {
  // 현재 표시 중인 월
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const now = initialMonth || new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  
  // 플랫리스트 참조
  const flatListRef = useRef<FlatList>(null);
  
  // 마지막으로 변경을 알린 월
  const lastNotifiedMonthRef = useRef<Date>(currentMonth);
  
  // 스크롤 중인지 여부
  const isScrollingRef = useRef(false);
  
  // 업데이트 소스 추적 (버튼 또는 스와이프)
  const updateSourceRef = useRef<'button' | 'swipe' | null>(null);
  
  // 초기 인덱스 계산 (중간 값)
  const initialIndex = MONTHS_TO_SHOW;
  
  // 월 데이터 생성
  const generateMonths = (baseMonth: Date) => {
    const monthsArray = [];
    
    for (let i = -MONTHS_TO_SHOW; i <= MONTHS_TO_SHOW; i++) {
      const monthDate = addMonths(baseMonth, i);
      monthsArray.push({
        date: monthDate,
        id: format(monthDate, 'yyyy-MM')
      });
    }
    
    return monthsArray;
  };
  
  // 월 데이터 상태
  const [months, setMonths] = useState(() => generateMonths(currentMonth));
  
  // 개발용 로그 함수
  const log = (message: string) => {
    if (__DEV__) console.log(`[CalendarPager] ${message}`);
  };
  
  // 현재 월에 해당하는 인덱스 찾기
  const findMonthIndex = (targetMonth: Date) => {
    const targetFormatted = format(targetMonth, 'yyyy-MM');
    return months.findIndex(m => format(m.date, 'yyyy-MM') === targetFormatted);
  };
  
  // 화살표 버튼으로 월 변경 처리 함수 - Calendar 컴포넌트로 전달됨
  const handleArrowNavigate = (direction: 'prev' | 'next') => {
    updateSourceRef.current = 'button';
    
    const newMonth = direction === 'prev' 
      ? addMonths(currentMonth, -1) 
      : addMonths(currentMonth, 1);
    
    log(`Arrow navigation to: ${format(newMonth, 'yyyy-MM')}`);
    
    // 월 변경 콜백 호출
    if (onMonthChange) {
      onMonthChange(newMonth);
    }
    
    // 현재 월 상태 업데이트
    setCurrentMonth(newMonth);
    
    // FlatList 스크롤 위치 업데이트
    const newIndex = findMonthIndex(newMonth);
    if (newIndex >= 0 && flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index: newIndex,
        animated: true
      });
    } else {
      // 현재 index를 찾을 수 없는 경우 월 배열 재생성
      log(`Month index not found, regenerating months array`);
      setMonths(generateMonths(newMonth));
      
      // 약간의 지연 후 중앙으로 스크롤
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToIndex({
            index: initialIndex,
            animated: false
          });
        }
      }, 50);
    }
  };
  
  // initialMonth prop이 변경될 때 처리
  useEffect(() => {
    if (!initialMonth) return;
    
    // 현재 월과 다른 경우만 처리
    if (!isSameMonth(initialMonth, currentMonth)) {
      log(`External month change: ${format(initialMonth, 'yyyy-MM')}`);
      
      updateSourceRef.current = 'button';
      
      // 새 월로 설정
      const newMonth = new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1);
      setCurrentMonth(newMonth);
      
      // 월 배열 업데이트
      setMonths(generateMonths(newMonth));
      
      // 스크롤 위치 중앙으로 설정
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToIndex({
            index: initialIndex,
            animated: false
          });
        }
      }, 50);
    }
  }, [initialMonth, currentMonth]);
  
  // 현재 보이는 아이템이 변경될 때 호출되는 함수
  const handleViewableItemsChanged = (info: { viewableItems: ViewToken[] }) => {
    if (info.viewableItems.length === 0 || isScrollingRef.current) return;
    
    // 중앙에 표시된 아이템 (가장 많이 보이는 아이템)
    const centerItem = info.viewableItems.find(item => item.isViewable);
    if (!centerItem) return;
    
    const monthItem = centerItem.item as { date: Date; id: string };
    
    // 버튼 내비게이션 중에는 이벤트 무시
    if (updateSourceRef.current === 'button') {
      updateSourceRef.current = null;
      return;
    }
    
    // 현재 월이 변경된 경우만 처리
    if (!isSameMonth(monthItem.date, lastNotifiedMonthRef.current)) {
      const newMonth = monthItem.date;
      log(`Month changed by swipe to: ${format(newMonth, 'yyyy-MM')}`);
      
      updateSourceRef.current = 'swipe';
      
      // 월 변경 콜백 호출
      if (onMonthChange) {
        onMonthChange(newMonth);
      }
      
      // 현재 월 상태 업데이트
      setCurrentMonth(newMonth);
      
      // 마지막으로 알린 월 업데이트
      lastNotifiedMonthRef.current = newMonth;
    }
  };
  
  // 스크롤 시작/종료 이벤트 핸들러
  const handleScrollBegin = () => {
    isScrollingRef.current = true;
  };
  
  const handleScrollEnd = () => {
    isScrollingRef.current = false;
    updateSourceRef.current = null;
  };
  
  // 캘린더 항목 렌더링 함수 - 중앙 정렬을 위한 컨테이너 추가
  const renderCalendarItem = ({ item }: { item: { date: Date; id: string } }) => {
    return (
      <View style={[styles.pageContainer, { width: SCREEN_WIDTH }]}>
        <View style={styles.calendarWrapper}>
          <Calendar
            key={item.id}
            events={events}
            onDayPress={onDayPress}
            colorScheme={colorScheme}
            initialMonth={item.date}
            onMonthChange={handleArrowNavigate}
          />
        </View>
      </View>
    );
  };
  
  // 아이템 키 추출 함수
  const keyExtractor = (item: { date: Date; id: string }) => item.id;
  
  // 초기 스크롤 위치 설정
  useEffect(() => {
    if (flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: initialIndex,
          animated: false
        });
      }, 100);
    }
  }, []);
  
  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={months}
        renderItem={renderCalendarItem}
        keyExtractor={keyExtractor}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        snapToAlignment="center"
        snapToInterval={SCREEN_WIDTH}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index
        })}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 50,
          minimumViewTime: 100
        }}
        onViewableItemsChanged={handleViewableItemsChanged}
        onScrollBeginDrag={handleScrollBegin}
        onScrollEndDrag={handleScrollEnd}
        onMomentumScrollBegin={handleScrollBegin}
        onMomentumScrollEnd={handleScrollEnd}
        contentContainerStyle={styles.flatListContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // height를 자동 조정
    width: '100%',
    backgroundColor: 'transparent',
  },
  flatListContent: {
    // 스크롤 컨텐츠 스타일
  },
  pageContainer: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  calendarWrapper: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 0
  }
});

export default CalendarPager;
// components/calendar/CalendarPager.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  StyleSheet, 
  View, 
  FlatList, 
  ColorSchemeName, 
  Dimensions, 
  ViewToken,
  LayoutAnimation,
  Platform,
  UIManager,
  NativeSyntheticEvent,
  NativeScrollEvent
} from 'react-native';
import { addMonths, format, isSameMonth } from 'date-fns';
import Calendar from './Calendar';
import { CalendarDay } from '../../utils/dateUtils';
import { CalendarEvent, getEventsForMonth } from '../../services/calendarService';
import { useAuth } from '../../context/AuthContext';

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
  // 🔥 Auth context 추가
  const { user } = useAuth();
  
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
  
  // 🔥 프리로드 상태 관리
  const preloadedMonths = useRef<Set<string>>(new Set());
  const isPreloading = useRef<Set<string>>(new Set());
  const scrollProgress = useRef(0);
  const currentIndex = useRef(MONTHS_TO_SHOW);
  
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
  
  // 🔥 프리로드 함수
  const preloadMonth = useCallback(async (monthDate: Date) => {
    if (!user || !user.uid) return;
    
    const monthKey = format(monthDate, 'yyyy-MM');
    
    // 이미 프리로드됐거나 프리로딩 중이면 스킵
    if (preloadedMonths.current.has(monthKey) || isPreloading.current.has(monthKey)) {
      return;
    }
    
    log(`프리로딩 시작: ${monthKey}`);
    isPreloading.current.add(monthKey);
    
    try {
      // 해당 월의 이벤트 미리 로드 (캐시 활용됨)
      await getEventsForMonth(user.uid, monthDate.getFullYear(), monthDate.getMonth());
      
      preloadedMonths.current.add(monthKey);
      log(`프리로딩 완료: ${monthKey}`);
    } catch (error) {
      console.error(`프리로딩 실패: ${monthKey}`, error);
    } finally {
      isPreloading.current.delete(monthKey);
    }
  }, [user]);
  
  // 🔥 스크롤 이벤트 핸들러
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement } = event.nativeEvent;
    const currentOffset = contentOffset.x;
    const currentItemIndex = Math.round(currentOffset / SCREEN_WIDTH);
    
    // 스크롤 진행률 계산 (0 ~ 1)
    const itemOffset = currentOffset % SCREEN_WIDTH;
    const progress = itemOffset / SCREEN_WIDTH;
    
    scrollProgress.current = progress;
    currentIndex.current = currentItemIndex;
    
    // 🔥 프리로딩 트리거 (80% 지점)
    if (progress > 0.8 && currentItemIndex < months.length - 1) {
      // 오른쪽으로 스크롤 중 - 다음 달 프리로드
      const nextMonth = months[currentItemIndex + 1];
      if (nextMonth) {
        preloadMonth(nextMonth.date);
        
        // 그 다음 달도 미리 로드 (더 부드러운 경험)
        if (currentItemIndex + 2 < months.length) {
          const nextNextMonth = months[currentItemIndex + 2];
          if (nextNextMonth) {
            preloadMonth(nextNextMonth.date);
          }
        }
      }
    } else if (progress < -0.8 && currentItemIndex > 0) {
      // 왼쪽으로 스크롤 중 - 이전 달 프리로드
      const prevMonth = months[currentItemIndex - 1];
      if (prevMonth) {
        preloadMonth(prevMonth.date);
        
        // 그 이전 달도 미리 로드
        if (currentItemIndex - 2 >= 0) {
          const prevPrevMonth = months[currentItemIndex - 2];
          if (prevPrevMonth) {
            preloadMonth(prevPrevMonth.date);
          }
        }
      }
    }
  }, [months, preloadMonth]);
  
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
    
    // 🔥 버튼으로 이동할 때도 주변 월 프리로드
    if (direction === 'next') {
      preloadMonth(addMonths(newMonth, 1));
    } else {
      preloadMonth(addMonths(newMonth, -1));
    }
    
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
      
      // 🔥 주변 월 프리로드
      preloadMonth(addMonths(newMonth, -1));
      preloadMonth(addMonths(newMonth, 1));
      
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
  }, [initialMonth, currentMonth, preloadMonth]);
  
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
      
      // 🔥 새로운 월로 변경될 때 주변 월 프리로드
      preloadMonth(addMonths(newMonth, -1));
      preloadMonth(addMonths(newMonth, 1));
      
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
    
    // 🔥 스크롤 종료 후 프리로드 상태 정리
    if (preloadedMonths.current.size > 10) {
      // 너무 많은 프리로드 데이터가 쌓이지 않도록 정리
      const currentMonthKey = format(currentMonth, 'yyyy-MM');
      const keysToKeep = new Set<string>();
      
      // 현재 월 기준 ±3개월만 유지
      for (let i = -3; i <= 3; i++) {
        const monthToKeep = addMonths(currentMonth, i);
        keysToKeep.add(format(monthToKeep, 'yyyy-MM'));
      }
      
      // 나머지는 제거
      preloadedMonths.current.forEach(key => {
        if (!keysToKeep.has(key)) {
          preloadedMonths.current.delete(key);
        }
      });
      
      log(`프리로드 캐시 정리 완료. 남은 개수: ${preloadedMonths.current.size}`);
    }
  };
  
  // 캘린더 항목 렌더링 함수
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
        
        // 🔥 초기 로드 시 주변 월 프리로드
        const initialMonth = months[initialIndex].date;
        preloadMonth(addMonths(initialMonth, -1));
        preloadMonth(addMonths(initialMonth, 1));
      }, 100);
    }
  }, [preloadMonth]);
  
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
        onScroll={handleScroll}  // 🔥 스크롤 이벤트 추가
        scrollEventThrottle={16}  // 🔥 60fps로 스크롤 이벤트 처리
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
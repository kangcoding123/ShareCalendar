// utils/dateUtils.ts
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { CalendarEvent } from '../services/calendarService';

// 타입 정의
export interface CalendarDay {
  date: Date;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  formattedDate: string;
}

/**
 * 특정 월의 달력 데이터 생성
 * @param {Date} date - 기준 날짜
 * @returns {Array} 달력 데이터 (해당 월에 필요한 주 수만)
 */
export const getCalendarDays = (date: Date): CalendarDay[] => {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });
  
  const days: CalendarDay[] = [];
  let day = startDate;
  
  // 필요한 주 수만큼만 추가 (일요일 시작)
  while (day <= endDate) {
    for (let i = 0; i < 7; i++) {
      days.push({
        date: new Date(day),
        dayOfMonth: day.getDate(),
        isCurrentMonth: isSameMonth(day, monthStart),
        isToday: isSameDay(day, new Date()),
        formattedDate: format(day, 'yyyy-MM-dd')
      });
      day = addDays(day, 1);
    }
  }
  
  return days;
};

/**
 * 지정된 형식으로 날짜 포맷팅
 * @param {Date|string} date - 날짜 또는 날짜 문자열
 * @param {string} formatStr - 포맷 문자열
 * @returns {string} 포맷된 날짜 문자열
 */
export const formatDate = (date: Date | string, formatStr = 'yyyy년 MM월 dd일'): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, formatStr, { locale: ko });
};

/**
 * 이벤트를 날짜별로 그룹화
 * @param {Array} events - 이벤트 배열
 * @returns {Object} 날짜별 이벤트 맵
 */
export const groupEventsByDate = <T extends { startDate: string; endDate?: string; isMultiDay?: boolean }>(events: T[]): Record<string, T[]> => {
  const result: Record<string, T[]> = {};

  events.forEach(event => {
    // 기본값 설정 - ISO 형식에서 날짜 부분만 추출
    const startDate = event.startDate.split('T')[0];
    const endDate = (event.endDate || event.startDate).split('T')[0];
    const isMultiDay = event.isMultiDay || (startDate !== endDate);

    if (isMultiDay) {
      // 다일 일정인 경우 모든 날짜에 추가
      const allDates = getDatesBetween(startDate, endDate);

      allDates.forEach(date => {
        if (!result[date]) {
          result[date] = [];
        }
        result[date].push(event);
      });
    } else {
      // 단일 일정인 경우 시작일에만 추가
      if (!result[startDate]) {
        result[startDate] = [];
      }
      result[startDate].push(event);
    }
  });

  return result;
};

/**
 * 한국어 요일 이름 가져오기
 * @param {number} dayIndex - 요일 인덱스 (0: 일요일, 6: 토요일)
 * @returns {string} 요일 이름
 */
export const getKoreanDayName = (dayIndex: number): string => {
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  return dayNames[dayIndex];
};

/**
 * 두 날짜 사이의 모든 날짜를 YYYY-MM-DD 형식의 문자열 배열로 반환
 * @param startDate 시작일
 * @param endDate 종료일
 * @returns 날짜 문자열 배열
 */
export const getDatesBetween = (startDate: string, endDate: string): string[] => {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // 종료일이 시작일보다 빠르면 시작일만 반환
  if (end < start) {
    return [startDate];
  }
  
  // 시작일부터 종료일까지 모든 날짜 추가
  const current = new Date(start);
  while (current <= end) {
    dates.push(format(current, 'yyyy-MM-dd'));
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
};

/**
 * 다일 일정의 각 날짜에 대한 위치 정보 반환
 * @param date 현재 날짜
 * @param startDate 시작일
 * @param endDate 종료일
 * @returns 'start' | 'middle' | 'end' | 'single'
 */
export const getMultiDayPosition = (
  date: string, 
  startDate: string, 
  endDate: string
): 'start' | 'middle' | 'end' | 'single' => {
  if (startDate === endDate) return 'single';
  if (date === startDate) return 'start';
  if (date === endDate) return 'end';
  
  const dateObj = new Date(date);
  const startObj = new Date(startDate);
  const endObj = new Date(endDate);
  
  if (dateObj > startObj && dateObj < endObj) return 'middle';
  
  return 'single'; // 기본값
};
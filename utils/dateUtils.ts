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
export const groupEventsByDate = <T extends { date: string }>(events: T[]): Record<string, T[]> => {
  return events.reduce((acc: Record<string, T[]>, event) => {
    const date = event.date.split('T')[0];
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(event);
    return acc;
  }, {});
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
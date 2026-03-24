import { NativeModules } from 'react-native';
import { CalendarEvent } from './calendarService';
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import { logger } from '../utils/logger';
import { getHolidaysForYear } from '../data/holidays';

const { SharedDataModule } = NativeModules;

interface WidgetEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  time: string | null;
  color: string | null;
  groupName: string | null;
  isMultiDay: boolean;
}

interface WidgetCalendarData {
  today: string;
  events: WidgetEvent[];
  holidays: string[];
  lastUpdated: string;
}

let lastDataHash = '';

export function updateWidgetData(events: CalendarEvent[]): void {
  if (!SharedDataModule) return;

  try {
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');

    // 이번 달 시작/끝 계산 (미니 캘린더 + 오늘 일정용)
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
    // 다음 달까지 포함 (다가오는 일정 표시용)
    const nextMonthEnd = format(endOfMonth(addMonths(now, 1)), 'yyyy-MM-dd');

    // 이번 달 ~ 다음 달 이벤트만 필터링
    const filteredEvents = events.filter(e => {
      if (!e.startDate) return false;
      return e.endDate >= monthStart && e.startDate <= nextMonthEnd;
    });

    const widgetEvents: WidgetEvent[] = filteredEvents.map(e => ({
      id: e.id || '',
      title: e.title,
      startDate: e.startDate,
      endDate: e.endDate,
      time: e.time || null,
      color: e.color || null,
      groupName: e.groupName || null,
      isMultiDay: e.isMultiDay || false,
    }));

    // 이번 달 공휴일 날짜 목록 생성
    const year = now.getFullYear();
    const allHolidays = getHolidaysForYear(year);
    const holidayDates = Object.entries(allHolidays)
      .filter(([, h]) => h.isHoliday)
      .map(([date]) => date);

    const data: WidgetCalendarData = {
      today,
      events: widgetEvents,
      holidays: holidayDates,
      lastUpdated: new Date().toISOString(),
    };

    // 이벤트 데이터가 변경되지 않아도 lastUpdated는 항상 갱신
    const eventsHash = simpleHash(JSON.stringify(widgetEvents) + JSON.stringify(holidayDates));
    const dataChanged = eventsHash !== lastDataHash;
    if (dataChanged) {
      lastDataHash = eventsHash;
    }

    const jsonString = JSON.stringify(data);
    SharedDataModule.updateWidgetData(jsonString);
    if (dataChanged) {
      logger.log(`[Widget] 위젯 데이터 업데이트: ${widgetEvents.length}개 이벤트`);
    }
  } catch (error) {
    logger.error('[Widget] 위젯 데이터 업데이트 실패:', error);
  }
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return String(hash);
}

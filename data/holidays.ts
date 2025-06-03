// data/holidays.ts
import { Lunar, Solar } from 'lunar-javascript';

// 타입 정의
export interface Holiday {
  name: string;
  isHoliday: boolean;
  date: string;
  duration?: number;
  isAlternative?: boolean; // 대체공휴일 여부
  originalDate?: string;   // 대체 발생 원본 날짜
  isTemporary?: boolean;   // 추가: 임시 공휴일 여부
}

// 양력 공휴일 (고정 공휴일)
export const SOLAR_HOLIDAYS: Record<string, Omit<Holiday, 'date'>> = {
  '01-01': { name: '신정', isHoliday: true },
  '03-01': { name: '삼일절', isHoliday: true },
  '05-05': { name: '어린이날', isHoliday: true },
  '06-06': { name: '현충일', isHoliday: true },
  '08-15': { name: '광복절', isHoliday: true },
  '10-03': { name: '개천절', isHoliday: true },
  '10-09': { name: '한글날', isHoliday: true },
  '12-25': { name: '크리스마스', isHoliday: true }
};

// 음력 공휴일 정의 (날짜는 동적으로 계산)
export const LUNAR_HOLIDAY_DEFINITIONS = [
  { month: 1, day: 1, name: '설날', daysOff: [-1, 0, 1] }, // 설날 및 전날, 다음날
  { month: 4, day: 8, name: '부처님오신날', daysOff: [0] }, // 부처님오신날
  { month: 8, day: 15, name: '추석', daysOff: [-1, 0, 1] }  // 추석 및 전날, 다음날
];

/**
 * 날짜를 'YYYY-MM-DD' 형식의 문자열로 변환
 */
function formatDateToString(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 주어진 날짜에서 특정 일수만큼 이동한 날짜를 반환
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(date.getDate() + days);
  return result;
}

/**
 * 음력 날짜를 양력 날짜로 변환
 */
function lunarToSolar(year: number, month: number, day: number): Date {
  const lunar = Lunar.fromYmd(year, month, day);
  const solar = lunar.getSolar();
  return new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay());
}

/**
 * 특정 연도의 음력 공휴일을 계산하여 가져오기
 */
function calculateLunarHolidays(year: number): Record<string, Holiday> {
  const holidays: Record<string, Holiday> = {};

  // 각 음력 공휴일 정의에 대해 양력 날짜 계산
  LUNAR_HOLIDAY_DEFINITIONS.forEach(({ month, day, name, daysOff }) => {
    // 메인 날짜 계산
    const solarDate = lunarToSolar(year, month, day);
    const mainDateString = formatDateToString(solarDate);
    
    // 이전/이후 날짜 포함 (daysOff 배열 활용)
    daysOff.forEach(offset => {
      const offsetDate = addDays(solarDate, offset);
      const offsetDateString = formatDateToString(offsetDate);
      
      const holidayName = offset === 0 ? name : `${name} 연휴`;
      
      holidays[offsetDateString] = {
        name: holidayName,
        isHoliday: true,
        date: offsetDateString
      };
    });
  });

  return holidays;
}

/**
 * 날짜가 공휴일인지 확인
 */
function isDateHoliday(date: Date, holidays: Record<string, Holiday>): boolean {
  const dateString = formatDateToString(date);
  const monthDay = dateString.substring(5); // MM-DD 형식
  
  return !!holidays[dateString] || !!SOLAR_HOLIDAYS[monthDay];
}

/**
 * 대체공휴일 계산
 */
function calculateAlternativeHolidays(year: number, allHolidays: Record<string, Holiday>): Record<string, Holiday> {
  const alternativeHolidays: Record<string, Holiday> = {};
  const yearString = year.toString();
  
  // 1. 어린이날 대체공휴일 계산
  const childrensDayString = `${yearString}-05-05`;
  const childrensDay = new Date(childrensDayString);
  const dayOfWeek = childrensDay.getDay();
  
  // 어린이날이 토요일 또는 일요일이거나 다른 공휴일과 겹치는 경우
  if (dayOfWeek === 0 || dayOfWeek === 6 || 
      (allHolidays[childrensDayString] && 
       allHolidays[childrensDayString].name !== '어린이날')) {
    
    // 대체공휴일 찾기: 다음 평일 중 공휴일이 아닌 날
    let alternativeDay = new Date(childrensDay);
    let daysToAdd = dayOfWeek === 0 ? 1 : (dayOfWeek === 6 ? 2 : 1);
    
    alternativeDay = addDays(childrensDay, daysToAdd);
    let alternativeDayString = formatDateToString(alternativeDay);
    
    // 이미 해당일이 공휴일이면 다음날 찾기
    while (isDateHoliday(alternativeDay, allHolidays)) {
      alternativeDay = addDays(alternativeDay, 1);
      alternativeDayString = formatDateToString(alternativeDay);
    }
    
    // 대체공휴일 추가
    alternativeHolidays[alternativeDayString] = {
      name: '대체공휴일(어린이날)',
      isHoliday: true,
      isAlternative: true,
      originalDate: childrensDayString,
      date: alternativeDayString
    };
  }
  
  // 2. 설날/추석 대체공휴일 계산
  const lunarHolidays = Object.entries(allHolidays).filter(([_, holiday]) => 
    holiday.name === '설날' || holiday.name === '추석'
  );
  
  lunarHolidays.forEach(([holidayDate, holiday]) => {
    const baseDate = new Date(holidayDate);
    
    // 설날/추석 연휴 계산 (전날, 당일, 다음날)
    const holidayDates = [-1, 0, 1].map(dayOffset => {
      const date = addDays(baseDate, dayOffset);
      return formatDateToString(date);
    });
    
    // 연휴 중 일요일이 있는지 확인
    let hasSunday = false;
    let hasCollision = false;
    
    holidayDates.forEach(date => {
      const dateObj = new Date(date);
      // 일요일인 경우
      if (dateObj.getDay() === 0) {
        hasSunday = true;
      }
      
      // 다른 공휴일과 충돌하는 경우
      const monthDay = date.substring(5); // MM-DD 형식
      if (SOLAR_HOLIDAYS[monthDay] && 
          SOLAR_HOLIDAYS[monthDay].name !== holiday.name) {
        hasCollision = true;
      }
    });
    
    // 일요일 포함 또는 다른 공휴일과 충돌이 있으면 대체공휴일 계산
    if (hasSunday || hasCollision) {
      // 연휴 다음날부터 검색 시작
      let alternativeDay = addDays(baseDate, 2);
      let alternativeDayString = formatDateToString(alternativeDay);
      
      // 이미 해당일이 공휴일이면 다음날 찾기
      while (isDateHoliday(alternativeDay, allHolidays)) {
        alternativeDay = addDays(alternativeDay, 1);
        alternativeDayString = formatDateToString(alternativeDay);
      }
      
      // 대체공휴일 추가
      alternativeHolidays[alternativeDayString] = {
        name: `대체공휴일(${holiday.name})`,
        isHoliday: true,
        isAlternative: true,
        originalDate: holidayDate,
        date: alternativeDayString
      };
    }
  });
  
  // 3. 부처님오신날 대체공휴일 계산
  const buddhasBirthdayDates = Object.entries(allHolidays).filter(([_, holiday]) => 
    holiday.name === '부처님오신날'
  );
  
  buddhasBirthdayDates.forEach(([date, holiday]) => {
    const buddhasBirthday = new Date(date);
    const dayOfWeek = buddhasBirthday.getDay();
    const monthDay = date.substring(5); // MM-DD 형식
    
    // 부처님오신날이 일요일이거나 다른 공휴일과 겹치는 경우
    if (dayOfWeek === 0 || SOLAR_HOLIDAYS[monthDay]) {
      // 대체공휴일 찾기
      let alternativeDay = addDays(buddhasBirthday, 1);
      let alternativeDayString = formatDateToString(alternativeDay);
      
      // 이미 해당일이 공휴일이면 다음날 찾기
      while (isDateHoliday(alternativeDay, allHolidays)) {
        alternativeDay = addDays(alternativeDay, 1);
        alternativeDayString = formatDateToString(alternativeDay);
      }
      
      // 대체공휴일 추가
      alternativeHolidays[alternativeDayString] = {
        name: '대체공휴일(부처님오신날)',
        isHoliday: true,
        isAlternative: true,
        originalDate: date,
        date: alternativeDayString
      };
    }
  });
  
  return alternativeHolidays;
}

/**
 * 특정 연도의 모든 공휴일 가져오기
 * @param {number} year - 연도
 * @returns {Record<string, Holiday>} 공휴일 정보
 */
export const getHolidaysForYear = (year: number): Record<string, Holiday> => {
  const holidays: Record<string, Holiday> = {};
  
  // 1. 양력 공휴일 추가
  Object.entries(SOLAR_HOLIDAYS).forEach(([monthDay, holiday]) => {
    const dateString = `${year}-${monthDay}`;
    holidays[dateString] = { ...holiday, date: dateString };
  });
  
  // 2. 음력 공휴일 동적 계산 후 추가
  const lunarHolidays = calculateLunarHolidays(year);
  Object.entries(lunarHolidays).forEach(([dateString, holiday]) => {
    holidays[dateString] = holiday;
  });
  
  // 3. 대체공휴일 계산 및 추가
  const alternativeHolidays = calculateAlternativeHolidays(year, holidays);
  Object.entries(alternativeHolidays).forEach(([dateString, holiday]) => {
    holidays[dateString] = holiday;
  });
  
  return holidays;
};

/**
 * 특정 날짜가 공휴일인지 확인
 * @param {Date} date - 확인할 날짜
 * @returns {Promise<Holiday|null>} 공휴일 정보 또는 null
 */
export const isHoliday = async (date: Date): Promise<Holiday | null> => {
  // YYYY-MM-DD 형식
  const dateString = formatDateToString(date);
  
  // MM-DD 형식
  const monthDay = dateString.substring(5);
  
  // 연도 추출
  const year = date.getFullYear();
  
  // 양력 공휴일 확인
  if (SOLAR_HOLIDAYS[monthDay]) {
    return {
      ...SOLAR_HOLIDAYS[monthDay],
      date: dateString
    };
  }
  
  // 해당 연도의 모든 공휴일 가져오기 (임시 공휴일 포함)
  try {
    const { getAllHolidaysForYear } = require('../services/holidayService');
    const allHolidays = await getAllHolidaysForYear(year);
    
    // 해당 날짜가 공휴일인지 확인
    if (allHolidays[dateString]) {
      return allHolidays[dateString];
    }
  } catch (error) {
    console.error('임시 공휴일 확인 오류:', error);
    
    // 오류 시 기존 로직으로 정적 공휴일만 확인
    const allHolidays = getHolidaysForYear(year);
    
    // 해당 날짜가 공휴일인지 확인
    if (allHolidays[dateString]) {
      return allHolidays[dateString];
    }
  }
  
  return null;
};

// data/holidays.ts

// 타입 정의
export interface Holiday {
  name: string;
  isHoliday: boolean;
  date?: string;
  duration?: number;
}

// 양력 공휴일 (고정 공휴일)
export const SOLAR_HOLIDAYS: Record<string, Holiday> = {
  '01-01': { name: '신정', isHoliday: true },
  '03-01': { name: '삼일절', isHoliday: true },
  '05-05': { name: '어린이날', isHoliday: true },
  '06-06': { name: '현충일', isHoliday: true },
  '08-15': { name: '광복절', isHoliday: true },
  '10-03': { name: '개천절', isHoliday: true },
  '10-09': { name: '한글날', isHoliday: true },
  '12-25': { name: '크리스마스', isHoliday: true }
};

// 음력 공휴일 (2023-2025년 양력 변환 데이터)
export const LUNAR_HOLIDAYS: Record<string, Holiday> = {
  // 설날 (음력 1월 1일, 전날과 다음날 포함 3일)
  '2023-01-21': { name: '설날', isHoliday: true, duration: 3 },
  '2024-02-10': { name: '설날', isHoliday: true, duration: 3 },
  '2025-01-29': { name: '설날', isHoliday: true, duration: 3 },
  
  // 부처님오신날 (음력 4월 8일)
  '2023-05-27': { name: '부처님오신날', isHoliday: true, duration: 1 },
  '2024-05-15': { name: '부처님오신날', isHoliday: true, duration: 1 },
  '2025-05-05': { name: '부처님오신날', isHoliday: true, duration: 1 },
  
  // 추석 (음력 8월 15일, 전날과 다음날 포함 3일)
  '2023-09-29': { name: '추석', isHoliday: true, duration: 3 },
  '2024-09-17': { name: '추석', isHoliday: true, duration: 3 },
  '2025-10-06': { name: '추석', isHoliday: true, duration: 3 }
};

/**
 * 특정 날짜가 공휴일인지 확인
 * @param {Date} date - 확인할 날짜
 * @returns {Holiday|null} 공휴일 정보 또는 null
 */
export const isHoliday = (date: Date): (Holiday & { date: string }) | null => {
  // YYYY-MM-DD 형식
  const dateString = date.toISOString().split('T')[0];
  
  // MM-DD 형식
  const monthDay = dateString.substring(5);
  
  // 양력 공휴일 확인
  if (SOLAR_HOLIDAYS[monthDay]) {
    return {
      ...SOLAR_HOLIDAYS[monthDay],
      date: dateString
    };
  }
  
  // 음력 공휴일 확인
  if (LUNAR_HOLIDAYS[dateString]) {
    return {
      ...LUNAR_HOLIDAYS[dateString],
      date: dateString
    };
  }
  
  return null;
};

/**
 * 특정 연도의 모든 공휴일 가져오기
 * @param {number} year - 연도
 * @returns {Record<string, Holiday & { date: string }>} 공휴일 정보
 */
export const getHolidaysForYear = (year: number): Record<string, Holiday & { date: string }> => {
  const holidays: Record<string, Holiday & { date: string }> = {};
  
  // 양력 공휴일 추가
  Object.entries(SOLAR_HOLIDAYS).forEach(([monthDay, holiday]) => {
    const dateString = `${year}-${monthDay}`;
    holidays[dateString] = { ...holiday, date: dateString };
  });
  
  // 음력 공휴일 추가 (해당 연도에 맞는 것만)
  Object.entries(LUNAR_HOLIDAYS).forEach(([dateString, holiday]) => {
    if (dateString.startsWith(year.toString())) {
      // 기간이 있는 경우 (설날, 추석 등) 시작일로부터 duration만큼 추가
      if (holiday.duration && holiday.duration > 1) {
        const startDate = new Date(dateString);
        
        for (let i = 0; i < holiday.duration; i++) {
          const currentDate = new Date(startDate);
          currentDate.setDate(startDate.getDate() + i - Math.floor(holiday.duration / 2));
          const currentDateString = currentDate.toISOString().split('T')[0];
          
          holidays[currentDateString] = {
            name: holiday.name,
            isHoliday: true,
            date: currentDateString
          };
        }
      } else {
        holidays[dateString] = { ...holiday, date: dateString };
      }
    }
  });
  
  return holidays;
};
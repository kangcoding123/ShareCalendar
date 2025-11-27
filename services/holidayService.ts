// services/holidayService.ts
import { nativeDb } from '../config/firebase';
import { Holiday } from '../data/holidays';

// 임시 공휴일 인터페이스
export interface TemporaryHoliday {
  id?: string;
  name: string;
  date: string; // 'YYYY-MM-DD' 형식
  isHoliday: boolean;
  description?: string;
  createdBy?: string;
  createdAt?: any | string;  // Timestamp 타입 제거
  updatedAt?: any | string;  // Timestamp 타입 제거
  year?: number; // 년도 필드 추가 (검색용)
}

// 결과 인터페이스
interface HolidayResult {
  success: boolean;
  holidays?: TemporaryHoliday[];
  holiday?: TemporaryHoliday;
  error?: string;
  id?: string;
}

/**
 * 임시 공휴일 추가
 * @param holiday 공휴일 데이터
 * @returns 처리 결과
 */
export const addTemporaryHoliday = async (holiday: Omit<TemporaryHoliday, 'id'>): Promise<HolidayResult> => {
  try {
    // 필수 필드 검증
    if (!holiday.name || !holiday.date) {
      return { success: false, error: '이름과 날짜는 필수 입력 항목입니다.' };
    }
    
    // 날짜 형식 검증 (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(holiday.date)) {
      return { success: false, error: '날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식이어야 합니다.' };
    }
    
    // 년도 필드 추가 (검색 최적화)
    const year = parseInt(holiday.date.substring(0, 4));
    
    // undefined 값 제거 (Firestore 오류 방지)
    const cleanHolidayData: Record<string, any> = {};
    
    // holiday 객체의 각 속성을 순회하면서 undefined가 아닌 값만 새 객체에 복사
    Object.keys(holiday).forEach(key => {
      const value = holiday[key as keyof typeof holiday];
      if (value !== undefined) {
        cleanHolidayData[key] = value;
      }
    });
    
    // 저장할 데이터 준비
    const holidayData: Record<string, any> = {
      name: holiday.name,
      date: holiday.date,
      year,
      isHoliday: holiday.isHoliday !== false,
      createdAt: new Date().toISOString()
    };

    // description이 있을 때만 추가
    if (holiday.description && holiday.description.trim()) {
      holidayData.description = holiday.description;
    }

    // createdBy가 있을 때만 추가
    if (holiday.createdBy) {
      holidayData.createdBy = holiday.createdBy;
    }

    // Native SDK로 저장
    const docRef = await nativeDb.collection('temporary_holidays').add(holidayData);
    
    // 새로운 접근 방식: TemporaryHoliday 인터페이스와 완벽히 일치하는 객체 생성
    // 필수 속성만 먼저 포함
    const holidayResult: Partial<TemporaryHoliday> = {
      id: docRef.id,
      name: holidayData.name,
      date: holidayData.date,
      isHoliday: holidayData.isHoliday,
      year: holidayData.year,
      createdAt: holidayData.createdAt
    };
    
    // 선택적 속성은 개별적으로 타입 안전하게 추가
    if (holidayData.description !== undefined) {
      holidayResult.description = holidayData.description;
    }
    
    if (holidayData.createdBy !== undefined) {
      holidayResult.createdBy = holidayData.createdBy;
    }
    
    // 반환 시 완전한 TemporaryHoliday로 타입 단언
    return { 
      success: true, 
      id: docRef.id,
      holiday: holidayResult as TemporaryHoliday 
    };
  } catch (error: any) {
    console.error('임시 공휴일 추가 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 임시 공휴일 수정
 * @param id 공휴일 ID
 * @param holiday 수정할 데이터
 * @returns 처리 결과
 */
export const updateTemporaryHoliday = async (
  id: string, 
  holiday: Partial<TemporaryHoliday>
): Promise<HolidayResult> => {
  try {
    // undefined 값 제거 (Firestore 오류 방지)
    const cleanUpdateData: Record<string, any> = {};
    
    // holiday 객체의 각 속성을 순회하면서 undefined가 아닌 값만 새 객체에 복사
    Object.keys(holiday).forEach(key => {
      const value = holiday[key as keyof typeof holiday];
      if (value !== undefined) {
        cleanUpdateData[key] = value;
      }
    });
    
    // 날짜가 변경된 경우 년도 필드도 업데이트
    if (cleanUpdateData.date) {
      // 날짜 형식 검증
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanUpdateData.date)) {
        return { success: false, error: '날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식이어야 합니다.' };
      }
      
      cleanUpdateData.year = parseInt(cleanUpdateData.date.substring(0, 4));
    }
    
    // 업데이트 시간 추가
    cleanUpdateData.updatedAt = new Date().toISOString();
    
    // Native SDK로 업데이트
    await nativeDb.collection('temporary_holidays').doc(id).update(cleanUpdateData);
    
    return { success: true };
  } catch (error: any) {
    console.error('임시 공휴일 수정 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 임시 공휴일 삭제
 * @param id 공휴일 ID
 * @returns 처리 결과
 */
export const deleteTemporaryHoliday = async (id: string): Promise<HolidayResult> => {
  try {
    await nativeDb.collection('temporary_holidays').doc(id).delete();
    return { success: true };
  } catch (error: any) {
    console.error('임시 공휴일 삭제 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 특정 연도의 임시 공휴일 목록 가져오기
 * @param year 연도
 * @returns 공휴일 목록
 */
export const getTemporaryHolidaysByYear = async (year: number): Promise<HolidayResult> => {
  try {
    const snapshot = await nativeDb
      .collection('temporary_holidays')
      .where('year', '==', year)
      .get();
    
    const holidays: TemporaryHoliday[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data() as TemporaryHoliday
    }));
    
    return { success: true, holidays };
  } catch (error: any) {
    console.error('임시 공휴일 조회 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 특정 연도의 모든 공휴일 가져오기 (정적 + 임시)
 * @param year 연도
 * @returns 공휴일 맵 (날짜 키에 공휴일 객체)
 */
export const getAllHolidaysForYear = async (year: number): Promise<Record<string, Holiday>> => {
  try {
    // 1. 정적 공휴일 가져오기 (기존 함수 import 및 사용)
    const { getHolidaysForYear } = require('../data/holidays');
    const staticHolidays = getHolidaysForYear(year);
    
    // 2. 임시 공휴일 가져오기
    const result = await getTemporaryHolidaysByYear(year);
    const tempHolidays: Record<string, Holiday> = {};
    
    if (result.success && result.holidays) {
      // 임시 공휴일을 정적 공휴일과 같은 형식으로 변환
      result.holidays.forEach(holiday => {
        tempHolidays[holiday.date] = {
          name: holiday.name,
          isHoliday: holiday.isHoliday,
          date: holiday.date,
          isTemporary: true
        };
      });
    }
    
    // 3. 두 객체 병합 (임시 공휴일이 정적 공휴일을 덮어씀)
    return { ...staticHolidays, ...tempHolidays };
  } catch (error) {
    console.error('공휴일 데이터 로드 오류:', error);
    // 오류 발생 시 정적 공휴일만 반환
    const { getHolidaysForYear } = require('../data/holidays');
    return getHolidaysForYear(year);
  }
};
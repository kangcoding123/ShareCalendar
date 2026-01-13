// services/reviewService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';

// 리뷰 관련 상수
const REVIEW_STORAGE_KEYS = {
  FIRST_LAUNCH_DATE: 'review_firstLaunchDate',
  EVENT_CREATED_COUNT: 'review_eventCreatedCount',
  LAST_REQUEST_DATE: 'review_lastRequestDate',
  HAS_REVIEWED: 'review_hasReviewed',
};

// 리뷰 요청 조건
const REVIEW_CONDITIONS = {
  MIN_DAYS_SINCE_INSTALL: 7,    // 설치 후 최소 7일
  MIN_EVENTS_CREATED: 3,         // 최소 3개 일정 등록
  MIN_DAYS_BETWEEN_REQUESTS: 30, // 요청 간 최소 30일
};

// 리뷰 상태 타입
interface ReviewState {
  firstLaunchDate: string | null;
  eventCreatedCount: number;
  lastRequestDate: string | null;
  hasReviewed: boolean;
}

/**
 * 첫 실행 날짜 초기화 (앱 최초 실행 시 호출)
 */
export const initializeFirstLaunchDate = async (): Promise<void> => {
  try {
    const existing = await AsyncStorage.getItem(REVIEW_STORAGE_KEYS.FIRST_LAUNCH_DATE);
    if (!existing) {
      const today = new Date().toISOString().split('T')[0];
      await AsyncStorage.setItem(REVIEW_STORAGE_KEYS.FIRST_LAUNCH_DATE, today);
      console.log('[ReviewService] 첫 실행 날짜 설정:', today);
    }
  } catch (error) {
    console.error('[ReviewService] 첫 실행 날짜 초기화 오류:', error);
  }
};

/**
 * 일정 등록 카운트 증가
 */
export const incrementEventCreatedCount = async (): Promise<void> => {
  try {
    const current = await AsyncStorage.getItem(REVIEW_STORAGE_KEYS.EVENT_CREATED_COUNT);
    const count = current ? parseInt(current, 10) : 0;
    await AsyncStorage.setItem(REVIEW_STORAGE_KEYS.EVENT_CREATED_COUNT, String(count + 1));
    console.log('[ReviewService] 일정 등록 카운트:', count + 1);
  } catch (error) {
    console.error('[ReviewService] 카운트 증가 오류:', error);
  }
};

/**
 * 현재 리뷰 상태 가져오기
 */
export const getReviewState = async (): Promise<ReviewState> => {
  try {
    const [firstLaunchDate, eventCount, lastRequestDate, hasReviewed] = await Promise.all([
      AsyncStorage.getItem(REVIEW_STORAGE_KEYS.FIRST_LAUNCH_DATE),
      AsyncStorage.getItem(REVIEW_STORAGE_KEYS.EVENT_CREATED_COUNT),
      AsyncStorage.getItem(REVIEW_STORAGE_KEYS.LAST_REQUEST_DATE),
      AsyncStorage.getItem(REVIEW_STORAGE_KEYS.HAS_REVIEWED),
    ]);

    return {
      firstLaunchDate,
      eventCreatedCount: eventCount ? parseInt(eventCount, 10) : 0,
      lastRequestDate,
      hasReviewed: hasReviewed === 'true',
    };
  } catch (error) {
    console.error('[ReviewService] 상태 조회 오류:', error);
    return {
      firstLaunchDate: null,
      eventCreatedCount: 0,
      lastRequestDate: null,
      hasReviewed: false,
    };
  }
};

/**
 * 리뷰 요청 조건 충족 여부 확인
 */
export const shouldShowReviewRequest = async (): Promise<boolean> => {
  try {
    const state = await getReviewState();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // 이미 리뷰를 완료했으면 표시하지 않음
    if (state.hasReviewed) {
      console.log('[ReviewService] 이미 리뷰 완료');
      return false;
    }

    // 첫 실행 날짜가 없으면 표시하지 않음
    if (!state.firstLaunchDate) {
      console.log('[ReviewService] 첫 실행 날짜 없음');
      return false;
    }

    // 설치 후 경과일 계산
    const firstLaunch = new Date(state.firstLaunchDate);
    const daysSinceInstall = Math.floor(
      (today.getTime() - firstLaunch.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceInstall < REVIEW_CONDITIONS.MIN_DAYS_SINCE_INSTALL) {
      console.log('[ReviewService] 설치 후 경과일 부족:', daysSinceInstall);
      return false;
    }

    // 일정 등록 수 확인
    if (state.eventCreatedCount < REVIEW_CONDITIONS.MIN_EVENTS_CREATED) {
      console.log('[ReviewService] 일정 등록 수 부족:', state.eventCreatedCount);
      return false;
    }

    // 마지막 요청 후 경과일 확인
    if (state.lastRequestDate) {
      const lastRequest = new Date(state.lastRequestDate);
      const daysSinceLastRequest = Math.floor(
        (today.getTime() - lastRequest.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceLastRequest < REVIEW_CONDITIONS.MIN_DAYS_BETWEEN_REQUESTS) {
        console.log('[ReviewService] 마지막 요청 후 경과일 부족:', daysSinceLastRequest);
        return false;
      }
    }

    console.log('[ReviewService] 리뷰 요청 조건 충족!');
    return true;
  } catch (error) {
    console.error('[ReviewService] 조건 확인 오류:', error);
    return false;
  }
};

/**
 * 리뷰 요청 날짜 기록 (나중에 또는 별로예요 선택 시)
 */
export const recordReviewRequest = async (): Promise<void> => {
  try {
    const today = new Date().toISOString().split('T')[0];
    await AsyncStorage.setItem(REVIEW_STORAGE_KEYS.LAST_REQUEST_DATE, today);
    console.log('[ReviewService] 리뷰 요청 날짜 기록:', today);
  } catch (error) {
    console.error('[ReviewService] 요청 날짜 기록 오류:', error);
  }
};

/**
 * 리뷰 완료 표시
 */
export const markReviewCompleted = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(REVIEW_STORAGE_KEYS.HAS_REVIEWED, 'true');
    console.log('[ReviewService] 리뷰 완료 표시');
  } catch (error) {
    console.error('[ReviewService] 리뷰 완료 표시 오류:', error);
  }
};

/**
 * 스토어 리뷰 요청 (네이티브 API 호출)
 */
export const requestStoreReview = async (): Promise<boolean> => {
  try {
    // expo-store-review 동적 import (네이티브 모듈 없을 때 오류 방지)
    let StoreReview: any = null;
    try {
      StoreReview = await import('expo-store-review');
    } catch {
      console.log('[ReviewService] expo-store-review 모듈 없음, URL fallback 사용');
    }

    // 네이티브 리뷰 가능 여부 확인
    if (StoreReview) {
      try {
        const isAvailable = await StoreReview.isAvailableAsync();
        if (isAvailable) {
          await StoreReview.requestReview();
          console.log('[ReviewService] 네이티브 리뷰 요청 완료');
          return true;
        }
      } catch (e) {
        console.log('[ReviewService] 네이티브 리뷰 불가, URL fallback 사용');
      }
    }

    // 스토어 URL로 이동 (fallback)
    const storeUrl = getStoreUrl();
    if (storeUrl) {
      await Linking.openURL(storeUrl);
      console.log('[ReviewService] 스토어 URL로 이동:', storeUrl);
      return true;
    }

    return false;
  } catch (error) {
    console.error('[ReviewService] 스토어 리뷰 요청 오류:', error);

    // 오류 시 스토어 URL로 fallback
    const storeUrl = getStoreUrl();
    if (storeUrl) {
      try {
        await Linking.openURL(storeUrl);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
};

/**
 * 스토어 URL 가져오기
 */
const getStoreUrl = (): string | null => {
  const appId = 'com.kangcoding.sharecalendar';

  if (Platform.OS === 'ios') {
    // iOS App Store URL (앱 ID가 필요하면 수정)
    return `https://apps.apple.com/app/id6739902737`;
  } else if (Platform.OS === 'android') {
    // Google Play Store URL
    return `https://play.google.com/store/apps/details?id=${appId}`;
  }

  return null;
};

// 테스트/디버그용 - 리뷰 상태 초기화
export const resetReviewState = async (): Promise<void> => {
  try {
    await Promise.all([
      AsyncStorage.removeItem(REVIEW_STORAGE_KEYS.FIRST_LAUNCH_DATE),
      AsyncStorage.removeItem(REVIEW_STORAGE_KEYS.EVENT_CREATED_COUNT),
      AsyncStorage.removeItem(REVIEW_STORAGE_KEYS.LAST_REQUEST_DATE),
      AsyncStorage.removeItem(REVIEW_STORAGE_KEYS.HAS_REVIEWED),
    ]);
    console.log('[ReviewService] 리뷰 상태 초기화 완료');
  } catch (error) {
    console.error('[ReviewService] 상태 초기화 오류:', error);
  }
};

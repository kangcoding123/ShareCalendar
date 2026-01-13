// utils/logger.ts
// 프로덕션 빌드에서 불필요한 로그 출력을 방지하는 유틸리티

const isDevelopment = __DEV__;

/**
 * 개발 환경에서만 로그를 출력하는 유틸리티
 * 프로덕션 빌드에서는 log, warn이 무시됨
 * error는 항상 출력 (문제 추적용)
 */
export const logger = {
  /**
   * 일반 로그 (개발 환경에서만 출력)
   */
  log: (message: string, ...args: any[]) => {
    if (isDevelopment) {
      console.log(message, ...args);
    }
  },

  /**
   * 경고 로그 (개발 환경에서만 출력)
   */
  warn: (message: string, ...args: any[]) => {
    if (isDevelopment) {
      console.warn(message, ...args);
    }
  },

  /**
   * 에러 로그 (항상 출력 - 프로덕션에서도 필요)
   */
  error: (message: string, ...args: any[]) => {
    console.error(message, ...args);
  },

  /**
   * 디버그 로그 (개발 환경에서만, 상세 정보용)
   */
  debug: (message: string, ...args: any[]) => {
    if (isDevelopment) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },
};

export default logger;

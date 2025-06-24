// services/adConfigService.ts
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

// 광고 설정 타입 정의
export interface AdConfig {
  banner_unit_id: string;
  ios_banner_unit_id?: string;      // iOS 전용 추가
  android_banner_unit_id?: string;  // Android 전용 추가
  ad_enabled: boolean;
  test_mode: boolean;
  updated_at: string;
}

// 광고 설정 초기화 함수
export const initializeAdConfig = async (): Promise<boolean> => {
  try {
    const adConfigRef = doc(db, 'app_config', 'ad_settings');
    
    // 기존 문서가 있는지 확인
    const docSnap = await getDoc(adConfigRef);
    
    if (!docSnap.exists()) {
      // 문서가 없으면 새로 생성
      await setDoc(adConfigRef, {
      banner_unit_id: 'DAN-tEpg4818iiZARMn2',
      ios_banner_unit_id: 'DAN-8aVOoPPWLxqWQXF8',      // iOS용 새 ID
      android_banner_unit_id: 'DAN-tEpg4818iiZARMn2',  // Android용 기존 ID
      ad_enabled: true,
      test_mode: false,  // false로 유지
      show_placeholder: true,  // 추가: 심사용 플레이스홀더 표시
      updated_at: new Date().toISOString()
    });
      console.log('광고 설정이 초기화되었습니다.');
    }
    
    return true;
  } catch (error) {
    console.error('광고 설정 초기화 오류:', error);
    return false;
  }
};

// 광고 설정 가져오기 함수
export const getAdConfig = async (): Promise<{
  success: boolean;
  config?: AdConfig;
  error?: any;
}> => {
  try {
    const adConfigRef = doc(db, 'app_config', 'ad_settings');
    const docSnap = await getDoc(adConfigRef);
    
    if (docSnap.exists()) {
      return {
        success: true,
        config: docSnap.data() as AdConfig
      };
    } else {
      // 설정이 없으면 초기화
      await initializeAdConfig();
      
      // 다시 가져오기
      const newDocSnap = await getDoc(adConfigRef);
      return {
        success: newDocSnap.exists(),
        config: newDocSnap.exists() ? newDocSnap.data() as AdConfig : undefined
      };
    }
  } catch (error) {
    console.error('광고 설정 가져오기 오류:', error);
    return {
      success: false,
      error: error
    };
  }
};

// 광고 활성화/비활성화 함수
export const toggleAdEnabled = async (enabled: boolean): Promise<{
  success: boolean;
  error?: any;
}> => {
  try {
    const adConfigRef = doc(db, 'app_config', 'ad_settings');
    await updateDoc(adConfigRef, {
      ad_enabled: enabled,
      updated_at: new Date().toISOString()
    });
    
    return { success: true };
  } catch (error) {
    console.error('광고 설정 업데이트 오류:', error);
    return { success: false, error };
  }
};

// 광고 단위 ID 업데이트 함수
export const updateAdUnitId = async (unitId: string): Promise<{
  success: boolean;
  error?: any;
}> => {
  try {
    const adConfigRef = doc(db, 'app_config', 'ad_settings');
    await updateDoc(adConfigRef, {
      banner_unit_id: unitId,
      updated_at: new Date().toISOString()
    });
    
    return { success: true };
  } catch (error) {
    console.error('광고 ID 업데이트 오류:', error);
    return { success: false, error };
  }
};

// 테스트 모드 설정 함수
export const setTestMode = async (testMode: boolean): Promise<{
  success: boolean;
  error?: any;
}> => {
  try {
    const adConfigRef = doc(db, 'app_config', 'ad_settings');
    await updateDoc(adConfigRef, {
      test_mode: testMode,
      updated_at: new Date().toISOString()
    });
    
    return { success: true };
  } catch (error) {
    console.error('테스트 모드 설정 오류:', error);
    return { success: false, error };
  }
};
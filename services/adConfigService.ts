// services/adConfigService.ts
import { nativeDb } from '../config/firebase';

// 광고 설정 타입 정의
export interface AdConfig {
  ios_banner_unit_id?: string;      // iOS 전용
  android_banner_unit_id?: string;  // Android 전용
  ad_enabled: boolean;
  test_mode: boolean;
  updated_at: string;
}

// 광고 설정 초기화 함수
export const initializeAdConfig = async (): Promise<boolean> => {
  try {
    const adConfigRef = nativeDb.collection('app_config').doc('ad_settings');
    
    // 기존 문서가 있는지 확인
    const docSnap = await adConfigRef.get();
    
    if (!(docSnap as any).exists) {  // Native SDK에서는 속성
      // 문서가 없으면 새로 생성
      await adConfigRef.set({
        ios_banner_unit_id: 'ca-app-pub-7310506169021656/3493072152',      // iOS용 ID
        android_banner_unit_id: 'ca-app-pub-7310506169021656/1974323964',  // Android용 ID
        ad_enabled: true,
        test_mode: false,
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
    const adConfigRef = nativeDb.collection('app_config').doc('ad_settings');
    const docSnap = await adConfigRef.get();
    
    if ((docSnap as any).exists) {  // Native SDK에서는 속성
      return {
        success: true,
        config: docSnap.data() as AdConfig
      };
    } else {
      // 설정이 없으면 초기화
      await initializeAdConfig();
      
      // 다시 가져오기
      const newDocSnap = await adConfigRef.get();
      const exists = (newDocSnap as any).exists;  // Native SDK에서는 속성
      return {
        success: exists,
        config: exists ? newDocSnap.data() as AdConfig : undefined
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
    const adConfigRef = nativeDb.collection('app_config').doc('ad_settings');
    await adConfigRef.update({
      ad_enabled: enabled,
      updated_at: new Date().toISOString()
    });
    
    return { success: true };
  } catch (error) {
    console.error('광고 설정 업데이트 오류:', error);
    return { success: false, error };
  }
};

// 테스트 모드 설정 함수
export const setTestMode = async (testMode: boolean): Promise<{
  success: boolean;
  error?: any;
}> => {
  try {
    const adConfigRef = nativeDb.collection('app_config').doc('ad_settings');
    await adConfigRef.update({
      test_mode: testMode,
      updated_at: new Date().toISOString()
    });
    
    return { success: true };
  } catch (error) {
    console.error('테스트 모드 설정 오류:', error);
    return { success: false, error };
  }
};
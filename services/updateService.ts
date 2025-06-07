// services/updateService.ts
import { Platform } from 'react-native';
import { collection, doc, getDoc } from 'firebase/firestore';
import * as Linking from 'expo-linking';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import Constants from 'expo-constants';
import { db } from '../config/firebase';

// 현재 앱 버전 가져오기
export const getCurrentAppVersion = (): string => {
  return Constants.expoConfig?.version || '1.0.0';
};

// 서버에서 최신 버전 정보 가져오기
export const getLatestVersionInfo = async (): Promise<any> => {
  try {
    const docRef = doc(db, 'app_config', 'version_info');
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        success: true,
        data: docSnap.data()
      };
    } else {
      console.log('버전 정보 문서가 존재하지 않습니다');
      return {
        success: false,
        error: '버전 정보를 찾을 수 없습니다'
      };
    }
  } catch (error) {
    console.error('버전 정보 가져오기 오류:', error);
    return {
      success: false,
      error: '버전 정보를 가져오는 중 오류가 발생했습니다'
    };
  }
};

// 버전 비교 함수
export const compareVersions = (currentVersion: string, latestVersion: string): number => {
  const current = currentVersion.split('.').map(Number);
  const latest = latestVersion.split('.').map(Number);
  
  for (let i = 0; i < Math.max(current.length, latest.length); i++) {
    const a = i < current.length ? current[i] : 0;
    const b = i < latest.length ? latest[i] : 0;
    if (a < b) return -1; // 업데이트 필요
    if (a > b) return 1;  // 최신 버전보다 높음 (개발 중인 경우)
  }
  
  return 0; // 동일한 버전
};

// 업데이트 링크로 이동
export const openUpdateLink = async (updateUrl: string): Promise<boolean> => {
  try {
    // 링크 열기
    const supported = await Linking.canOpenURL(updateUrl);
    
    if (supported) {
      await Linking.openURL(updateUrl);
      return true;
    } else {
      console.log(`링크를 열 수 없습니다: ${updateUrl}`);
      return false;
    }
  } catch (error) {
    console.error('업데이트 링크 열기 오류:', error);
    return false;
  }
};

// Android에서 APK 다운로드 및 설치 (Android만 해당)
export const downloadAndInstallApk = async (apkUrl: string): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    console.log('Android 기기에서만 사용 가능합니다');
    return false;
  }
  
  try {
    const localUri = `${FileSystem.cacheDirectory}update.apk`;
    
    // 진행 상황 콜백
    const callback = (downloadProgress: FileSystem.DownloadProgressData) => {
      const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
      console.log(`다운로드 진행률: ${progress * 100}%`);
    };
    
    // 다운로드
    const downloadResult = await FileSystem.downloadAsync(apkUrl, localUri, {
      md5: false
    });
    
    if (downloadResult.status !== 200) {
      console.log('APK 다운로드 실패');
      return false;
    }
    
    // 설치 시작
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: downloadResult.uri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: 'application/vnd.android.package-archive'
    });
    
    return true;
  } catch (error) {
    console.error('APK 다운로드/설치 오류:', error);
    return false;
  }
};

// 업데이트 체크 함수 - 수정된 부분
export const checkForUpdates = async (): Promise<{
  updateAvailable: boolean;
  requiredUpdate: boolean;
  versionInfo?: any;
}> => {
  try {
    const currentVersion = getCurrentAppVersion();
    const versionResult = await getLatestVersionInfo();
    
    console.log('현재 버전:', currentVersion);
    console.log('버전 결과:', versionResult);
    
    if (!versionResult.success) {
      console.log('버전 정보 가져오기 실패:', versionResult.error);
      return { updateAvailable: false, requiredUpdate: false };
    }
    
    const versionInfo = versionResult.data;
    
    // versionInfo가 null이거나 undefined인지 체크
    if (!versionInfo) {
      console.log('버전 정보가 없습니다');
      return { updateAvailable: false, requiredUpdate: false };
    }
    
    // 플랫폼별 버전 정보 안전하게 가져오기
    const platformVersion = Platform.OS === 'ios' ? 
      versionInfo.ios_version : versionInfo.android_version;
    
    // 플랫폼 버전이 존재하는지 체크
    if (!platformVersion) {
      console.log(`${Platform.OS} 버전 정보가 없습니다`);
      return { updateAvailable: false, requiredUpdate: false };
    }
    
    console.log('플랫폼 버전:', platformVersion);
    
    const comparisonResult = compareVersions(currentVersion, platformVersion);
    console.log('버전 비교 결과:', comparisonResult);
    
    return {
      updateAvailable: comparisonResult < 0,
      requiredUpdate: versionInfo.required_update || false,
      versionInfo: versionInfo
    };
  } catch (error) {
    console.error('업데이트 확인 오류:', error);
    return { updateAvailable: false, requiredUpdate: false };
  }
};
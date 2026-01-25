// config/firebase.ts
import auth from '@react-native-firebase/auth';
import analytics from '@react-native-firebase/analytics';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';

// Firestore - Native SDK
export const nativeDb = firestore();

// Storage - 파일 업로드/다운로드
export const firebaseStorage = storage();

// Auth와 Analytics는 React Native Firebase 사용
export { auth };
export const firebaseAnalytics = analytics();
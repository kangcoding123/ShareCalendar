// config/firebase.ts
import auth from '@react-native-firebase/auth';
import analytics from '@react-native-firebase/analytics';
import firestore from '@react-native-firebase/firestore';

// Firestore - Native SDK
export const nativeDb = firestore();

// Auth와 Analytics는 React Native Firebase 사용
export { auth };
export const firebaseAnalytics = analytics();
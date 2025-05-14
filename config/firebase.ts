// config/firebase.ts 수정
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// Analytics 관련 import 제거

// Firebase 설정 타입 정의
interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string; // 타입에는 유지해도 됨
}

// Your web app's Firebase configuration
const firebaseConfig: FirebaseConfig = {
  apiKey: "AIzaSyAJ9xr0pmdcST5szMHnmndABR1eBbieYvc",
  authDomain: "sharecalendar-c8a9b.firebaseapp.com",
  projectId: "sharecalendar-c8a9b",
  storageBucket: "sharecalendar-c8a9b.firebasestorage.app",
  messagingSenderId: "48436128175",
  appId: "1:48436128175:web:3ae32516dea0a791b6675a",
  measurementId: "G-Z1X9EP26G2" // 설정에는 유지해도 됨
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services (Analytics 제거)
export const auth = getAuth(app);
export const db = getFirestore(app);
// analytics 관련 코드 제거

export default app;
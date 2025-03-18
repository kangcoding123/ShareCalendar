// config/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// Analytics is optional for our app
import { getAnalytics } from "firebase/analytics";

// Firebase 설정 타입 정의
interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
}

// Your web app's Firebase configuration
const firebaseConfig: FirebaseConfig = {
  apiKey: "AIzaSyAJ9xr0pmdcST5szMHnmndABR1eBbieYvc",
  authDomain: "sharecalendar-c8a9b.firebaseapp.com",
  projectId: "sharecalendar-c8a9b",
  storageBucket: "sharecalendar-c8a9b.firebasestorage.app",
  messagingSenderId: "48436128175",
  appId: "1:48436128175:web:3ae32516dea0a791b6675a",
  measurementId: "G-Z1X9EP26G2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services we'll need
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = getAnalytics(app);

export default app;
// services/notificationService.ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { doc, updateDoc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { CalendarEvent } from './calendarService';

// 알림 기본 설정
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// 알림 권한 요청
export async function registerForPushNotificationsAsync() {
  let token;
  
  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('알림 권한을 받지 못했습니다');
      return null;
    }
    
    // 추가: Expo 푸시 토큰 가져오기
    token = (await Notifications.getExpoPushTokenAsync({ 
      projectId: 'acfa6bea-3fb9-4677-8980-6e08d2324c51' // app.json의 projectId 값으로 변경하세요
    })).data;
    
    console.log('알림 권한이 승인되었습니다. 토큰:', token);
  } else {
    console.log('실제 기기에서만 알림이 작동합니다');
  }

  return token;
}

// 새 함수: 사용자의 푸시 알림 토큰 저장
export async function saveUserPushToken(userId: string) {
  if (!Device.isDevice) return null;
  
  try {
    // 알림 권한 확인
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return null;
    }
    
    // Expo 푸시 토큰 가져오기
    const token = (await Notifications.getExpoPushTokenAsync({
      projectId: 'acfa6bea-3fb9-4677-8980-6e08d2324c51' // app.json의 projectId 값으로 변경하세요
    })).data;
    
    // Firestore에 토큰 저장
    await updateDoc(doc(db, 'users', userId), {
      pushToken: token,
      tokenUpdatedAt: new Date().toISOString()
    });
    
    console.log(`사용자 ${userId}의 푸시 토큰 저장됨:`, token);
    return token;
  } catch (error) {
    console.error('푸시 토큰 저장 오류:', error);
    return null;
  }
}

// 새 함수: 그룹 멤버들에게 알림 전송
export async function sendGroupNotification(
  groupId: string, 
  title: string, 
  body: string,
  data: any,
  excludeUserId?: string // 알림을 보낸 사용자는 제외
) {
  try {
    console.log(`그룹 ${groupId} 멤버들에게 알림 전송 시작`);
    
    // 그룹 멤버 가져오기
    const membersQuery = query(
      collection(db, 'groupMembers'),
      where('groupId', '==', groupId)
    );
    
    const membersSnapshot = await getDocs(membersQuery);
    const memberIds = membersSnapshot.docs
      .map(doc => doc.data().userId)
      .filter(id => id !== excludeUserId); // 발신자 제외
    
    console.log(`알림 대상 멤버 수: ${memberIds.length}`);
    
    // 각 멤버의 푸시 토큰 가져오기
    const pushTokens = [];
    for (const userId of memberIds) {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists() && userDoc.data().pushToken) {
        pushTokens.push(userDoc.data().pushToken);
      }
    }
    
    console.log(`유효한 푸시 토큰 수: ${pushTokens.length}`);
    
    // 알림 서버에 전송 요청
    if (pushTokens.length > 0) {
      // Expo 푸시 알림 서비스 사용
      const messages = pushTokens.map(token => ({
        to: token,
        sound: 'default',
        title,
        body,
        data,
      }));
      
      // Expo 푸시 API 호출
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages)
      });
      
      const responseData = await response.json();
      console.log('알림 전송 응답:', responseData);
      
      // 그룹 멤버들의 로컬 알림 카운터 증가
      for (const userId of memberIds) {
        try {
          const userRef = doc(db, 'users', userId);
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const unreadCount = (userData.unreadNotifications || 0) + 1;
            
            await updateDoc(userRef, {
              unreadNotifications: unreadCount,
              lastNotificationAt: new Date().toISOString()
            });
          }
        } catch (err) {
          console.error(`사용자 ${userId} 알림 카운터 업데이트 실패:`, err);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('그룹 알림 전송 오류:', error);
    return false;
  }
}

// 일정에 대한 알림 예약 (수정된 함수)
export async function scheduleEventNotification(event: CalendarEvent, minutesBefore: number = 30) {
  if (!event.date || !event.title) {
    console.log('일정에 날짜와 제목이 필요합니다');
    return null;
  }
  
  try {
    // 일정 시작 시간 계산
    let eventTimeStr = `${event.date}T${event.time || '09:00:00'}`;
    let eventTime = new Date(eventTimeStr);
    
    // 알림 시간 계산 (일정 시작 X분 전)
    const notificationTime = new Date(eventTime.getTime() - (minutesBefore * 60 * 1000));
    const now = new Date();
    
    console.log('Event time:', eventTime);
    console.log('Notification time:', notificationTime);
    console.log('Current time:', now);
    
    // 과거 시간이면 알림 예약하지 않음
    if (notificationTime <= now) {
      console.log('과거 시간에 대한 알림은 예약할 수 없습니다');
      return null;
    }
    
    // 알림 내용 설정
    const notificationContent = {
      title: `일정 알림: ${event.title}`,
      body: `${minutesBefore}분 후에 일정이 시작됩니다${event.description ? `: ${event.description}` : ''}`,
      data: { eventId: event.id, groupId: event.groupId },
    };
    
    // TypeScript 타입 단언을 사용하여 타입 오류 해결
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: notificationContent,
      trigger: {
        date: notificationTime
      } as any, // 타입 오류 해결을 위한 'as any' 타입 단언
    });
    
    console.log(`알림이 예약되었습니다: ${notificationId}, 예정 시간: ${notificationTime.toLocaleString()}`);
    return notificationId;
  } catch (error) {
    console.error('알림 예약 중 오류가 발생했습니다:', error);
    return null;
  }
}

// 알림 취소 (기존 함수)
export async function cancelEventNotification(notificationId: string) {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    console.log(`알림이 취소되었습니다: ${notificationId}`);
    return true;
  } catch (error) {
    console.error('알림 취소 중 오류가 발생했습니다:', error);
    return false;
  }
}

// 예약된 모든 알림 가져오기 (기존 함수)
export async function getAllScheduledNotifications() {
  try {
    const notifications = await Notifications.getAllScheduledNotificationsAsync();
    return notifications;
  } catch (error) {
    console.error('예약된 알림 가져오기 중 오류가 발생했습니다:', error);
    return [];
  }
}

// 새 함수: 사용자의 알림 카운터 초기화
export async function resetUserNotificationCounter(userId: string) {
  try {
    await updateDoc(doc(db, 'users', userId), {
      unreadNotifications: 0
    });
    return true;
  } catch (error) {
    console.error('알림 카운터 초기화 오류:', error);
    return false;
  }
}
// services/notificationService.ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { nativeDb } from '../config/firebase';
import { CalendarEvent } from './calendarService';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? 
                      Constants.easConfig?.projectId ?? 
                      'acfa6bea-3fb9-4677-8980-6e08d2324c51';
    
    token = (await Notifications.getExpoPushTokenAsync({ 
      projectId
    })).data;
    
    console.log('알림 권한이 승인되었습니다. 토큰:', token);
  } else {
    console.log('실제 기기에서만 알림이 작동합니다');
  }

  return token;
}

// 🌟 매일 아침 8시 일일 요약 알림 설정
export async function setupDailySummaryNotification() {
  try {
    // 기존 일일 요약 알림 취소
    const existingNotifications = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of existingNotifications) {
      if (notification.content.data?.type === 'daily_summary') {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
    
    // 새로운 일일 요약 알림 설정 (매일 오전 8시)
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'WE:IN 오늘의 일정 📅',
        body: '오늘 일정을 확인하세요',
        data: { type: 'daily_summary' },
        sound: 'default',
      },
      trigger: {
        hour: 8,
        minute: 0,
        repeats: true,
      } as any,
    });
    
    console.log('일일 요약 알림이 설정되었습니다 (매일 오전 8시):', identifier);
    
    // 설정 정보 저장
    await AsyncStorage.setItem('dailySummaryEnabled', 'true');
    await AsyncStorage.setItem('dailySummaryId', identifier);
    
    return identifier;
  } catch (error) {
    console.error('일일 요약 알림 설정 오류:', error);
    return null;
  }
}

// 🌟 오늘의 일정으로 일일 요약 내용 업데이트
export async function updateDailySummaryWithEvents(userId: string) {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // 사용자가 속한 그룹 먼저 조회
    const membershipsSnapshot = await nativeDb
      .collection('groupMembers')
      .where('userId', '==', userId)
      .get();
    
    const userGroupIds = membershipsSnapshot.docs.map(doc => doc.data().groupId);
    
    // 그룹 일정과 개인 일정 모두 조회
    let allEvents: CalendarEvent[] = [];
    
    // 오늘 날짜가 일정 기간에 포함되는지 체크하는 함수
    const isEventOnToday = (event: CalendarEvent): boolean => {
      const startDate = event.startDate;
      const endDate = event.endDate || event.startDate;
      return startDate <= todayStr && todayStr <= endDate;
    };

    if (userGroupIds.length > 0) {
      // 그룹 일정 조회 (in 연산자는 최대 10개까지만 가능)
      // startDate <= today 조건으로 조회 후 클라이언트에서 endDate 필터링
      const chunks = [];
      for (let i = 0; i < userGroupIds.length; i += 10) {
        chunks.push(userGroupIds.slice(i, i + 10));
      }

      for (const chunk of chunks) {
        const groupEventsSnapshot = await nativeDb
          .collection('events')
          .where('groupId', 'in', chunk)
          .where('startDate', '<=', todayStr)
          .get();

        const groupEvents = groupEventsSnapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data()
          } as CalendarEvent))
          .filter(isEventOnToday);

        allEvents = [...allEvents, ...groupEvents];
      }
    }

    // 개인 일정 조회
    const personalEventsSnapshot = await nativeDb
      .collection('events')
      .where('userId', '==', userId)
      .where('groupId', '==', 'personal')
      .where('startDate', '<=', todayStr)
      .get();

    const personalEvents = personalEventsSnapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      } as CalendarEvent))
      .filter(isEventOnToday);

    allEvents = [...allEvents, ...personalEvents];
    
    // 중복 제거 (같은 이벤트가 여러 번 조회되는 경우 방지)
    const uniqueEvents = Array.from(
      new Map(allEvents.map(event => [event.id, event])).values()
    );
    
    // 기존 일일 요약 알림 취소
    const existingNotifications = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of existingNotifications) {
      if (notification.content.data?.type === 'daily_summary') {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
    
    // 알림 내용 생성
    let body = '오늘 일정을 확인하세요';

    if (uniqueEvents.length > 0) {
      // 시간순 정렬
      uniqueEvents.sort((a, b) => {
        const timeA = a.time || '00:00';
        const timeB = b.time || '00:00';
        return timeA.localeCompare(timeB);
      });

      // 최대 3개까지 표시, 각 일정을 줄바꿈으로 구분
      const maxDisplay = 3;
      const displayEvents = uniqueEvents.slice(0, maxDisplay);

      const eventLines = displayEvents.map(event => {
        const time = event.time || '종일';
        const title = event.title || '제목 없음';
        return `• ${time} ${title}`;
      });

      body = eventLines.join('\n');

      // 3개 이상이면 추가 일정 수 표시
      if (uniqueEvents.length > maxDisplay) {
        body += `\n외 ${uniqueEvents.length - maxDisplay}개 일정`;
      }
    } else {
      body = '오늘은 일정이 없습니다';
    }
    
    // 새로운 알림 예약 (매일 오전 8시)
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'WE:IN 오늘의 일정 📅',
        body,
        data: { type: 'daily_summary', eventCount: uniqueEvents.length },
        sound: 'default',
      },
      trigger: {
        hour: 8,
        minute: 0,
        repeats: true,
      } as any,
    });
    
    console.log(`일일 요약 알림 업데이트: ${body}`);
    
    // 설정 정보 저장
    await AsyncStorage.setItem('dailySummaryId', identifier);
    await AsyncStorage.setItem('dailySummaryLastUpdate', new Date().toISOString());
    
    return identifier;
  } catch (error) {
    console.error('일일 요약 내용 업데이트 오류:', error);
    return null;
  }
}

// 🌟 일정 1시간 전 알림 예약
export async function scheduleEventNotification(event: CalendarEvent): Promise<string | null> {
  if (!event.startDate || !event.title) {
    console.log('일정에 날짜와 제목이 필요합니다');
    return null;
  }
  
  try {
    // 일정 시작 시간 계산
    const eventTimeStr = `${event.startDate}T${event.time || '09:00:00'}`;
    const eventTime = new Date(eventTimeStr);
    
    // 알림 시간 계산 (일정 시작 1시간 전)
    const notificationTime = new Date(eventTime.getTime() - (60 * 60 * 1000));
    const now = new Date();
    
    // 과거 시간이면 알림 예약하지 않음
    if (notificationTime <= now) {
      console.log('과거 시간에 대한 알림은 예약할 수 없습니다');
      return null;
    }
    
    // 알림 예약
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '일정 알림 ⏰',
        body: `1시간 후: ${event.title}${event.description ? '\n' + event.description : ''}`,
        data: { 
          type: 'event_reminder',
          eventId: event.id, 
          groupId: event.groupId 
        },
        sound: 'default',
      },
      trigger: notificationTime as any,
    });
    
    console.log(`일정 알림이 예약되었습니다: ${event.title}, 시간: ${notificationTime.toLocaleString()}`);
    
    // 알림 ID를 이벤트에 저장 (나중에 취소할 때 필요)
    if (event.id) {
      await nativeDb.collection('events').doc(event.id).update({
        notificationId: notificationId,
        notificationTime: notificationTime.toISOString()
      });
    }
    
    return notificationId;
  } catch (error) {
    console.error('일정 알림 예약 오류:', error);
    return null;
  }
}

// 🌟 일정 알림 취소
export async function cancelEventNotification(eventId: string) {
  try {
    // Firestore에서 알림 ID 조회
    const eventDoc = await nativeDb.collection('events').doc(eventId).get();
    const eventData = eventDoc.data();
    
    if (eventData?.notificationId) {
      await Notifications.cancelScheduledNotificationAsync(eventData.notificationId);
      console.log(`일정 알림이 취소되었습니다: ${eventData.notificationId}`);
      
      // 알림 ID 제거
      await nativeDb.collection('events').doc(eventId).update({
        notificationId: null,
        notificationTime: null
      });
    }
    
    return true;
  } catch (error) {
    console.error('일정 알림 취소 오류:', error);
    return false;
  }
}

// 🌟 일정 수정 시 알림 재예약
export async function rescheduleEventNotification(event: CalendarEvent) {
  try {
    // 기존 알림 취소
    if (event.id) {
      await cancelEventNotification(event.id);
    }
    
    // 새로운 알림 예약
    const newNotificationId = await scheduleEventNotification(event);
    return newNotificationId;
  } catch (error) {
    console.error('일정 알림 재예약 오류:', error);
    return null;
  }
}

// 로컬 알림 테스트 함수
export async function testLocalNotification() {
  if (!Device.isDevice) {
    console.log('실제 기기에서만 알림이 작동합니다');
    return false;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'WE:IN 테스트 알림 🔔',
      body: '알림이 정상적으로 작동합니다!',
      data: { type: 'test' },
      sound: 'default',
    },
    trigger: { seconds: 2 } as any,
  });
  
  console.log('테스트 알림이 2초 후 표시됩니다');
  return true;
}

// 예약된 모든 알림 조회
export async function getAllScheduledNotifications() {
  const notifications = await Notifications.getAllScheduledNotificationsAsync();
  console.log('예약된 알림:', notifications);
  return notifications;
}

// 모든 알림 취소
export async function cancelAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
  console.log('모든 예약된 알림이 취소되었습니다');
}

// 사용자 푸시 토큰 저장
export async function saveUserPushToken(userId: string, token: string) {
  try {
    await nativeDb.collection('users').doc(userId).update({
      pushToken: token,
      tokenUpdatedAt: new Date().toISOString(),
      deviceInfo: {
        platform: Platform.OS,
        version: Platform.Version,
        isDevice: Device.isDevice,
      }
    });
    console.log('푸시 토큰이 Firestore에 저장됨');
    
    // AsyncStorage에도 백업
    await AsyncStorage.setItem('lastPushToken', token);
    await AsyncStorage.setItem('lastPushTokenUser', userId);
  } catch (error) {
    console.error('푸시 토큰 저장 오류:', error);
  }
}

// 그룹 멤버들에게 알림 전송
export async function sendGroupNotification(
  groupId: string,
  title: string,
  body: string,
  data: any,
  excludeUserId?: string
) {
  // 개발 모드에서는 로컬 알림만 표시
  if (__DEV__) {
    console.log('[개발 모드] 그룹 알림:', { groupId, title, body });
    return;
  }

  try {
    // 그룹 멤버 조회
    const membersSnapshot = await nativeDb
      .collection('groupMembers')
      .where('groupId', '==', groupId)
      .get();

    const tokens: string[] = [];
    
    for (const doc of membersSnapshot.docs) {
      const memberData = doc.data();
      
      // 알림을 보낸 사용자는 제외
      if (memberData.userId === excludeUserId) continue;
      
      // 사용자의 푸시 토큰 조회
      const userDoc = await nativeDb
        .collection('users')
        .doc(memberData.userId)
        .get();
      
      const userData = userDoc.data();
      if (userData?.pushToken) {
        tokens.push(userData.pushToken);
      }
    }

    if (tokens.length > 0) {
      // Expo 푸시 알림 서비스로 전송
      const messages = tokens.map(token => ({
        to: token,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high',
        badge: 1,
      }));

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      const result = await response.json();
      console.log('그룹 알림 전송 결과:', result);
      
      // 알림 기록 저장
      await nativeDb.collection('notificationLogs').add({
        groupId,
        title,
        body,
        data,
        sentBy: excludeUserId,
        sentTo: tokens.length,
        createdAt: new Date().toISOString(),
        result: result,
      });
    }
  } catch (error) {
    console.error('그룹 알림 전송 오류:', error);
  }
}

// 알림 설정 상태 확인
export async function getNotificationSettings() {
  try {
    const dailySummaryEnabled = await AsyncStorage.getItem('dailySummaryEnabled');
    const eventReminderEnabled = await AsyncStorage.getItem('eventReminderEnabled');
    const groupNotificationEnabled = await AsyncStorage.getItem('groupNotificationEnabled');
    
    return {
      dailySummary: dailySummaryEnabled === 'true',
      eventReminder: eventReminderEnabled !== 'false', // 기본값 true
      groupNotification: groupNotificationEnabled !== 'false', // 기본값 true
    };
  } catch (error) {
    console.error('알림 설정 조회 오류:', error);
    return {
      dailySummary: true,
      eventReminder: true,
      groupNotification: true,
    };
  }
}

// 알림 설정 업데이트
export async function updateNotificationSettings(settings: {
  dailySummary?: boolean;
  eventReminder?: boolean;
  groupNotification?: boolean;
}) {
  try {
    if (settings.dailySummary !== undefined) {
      await AsyncStorage.setItem('dailySummaryEnabled', String(settings.dailySummary));
      
      if (settings.dailySummary) {
        await setupDailySummaryNotification();
      } else {
        // 일일 요약 알림 취소
        const notifications = await Notifications.getAllScheduledNotificationsAsync();
        for (const notification of notifications) {
          if (notification.content.data?.type === 'daily_summary') {
            await Notifications.cancelScheduledNotificationAsync(notification.identifier);
          }
        }
      }
    }
    
    if (settings.eventReminder !== undefined) {
      await AsyncStorage.setItem('eventReminderEnabled', String(settings.eventReminder));
    }
    
    if (settings.groupNotification !== undefined) {
      await AsyncStorage.setItem('groupNotificationEnabled', String(settings.groupNotification));
    }
    
    console.log('알림 설정이 업데이트되었습니다:', settings);
  } catch (error) {
    console.error('알림 설정 업데이트 오류:', error);
  }
}

export default {
  registerForPushNotificationsAsync,
  setupDailySummaryNotification,
  updateDailySummaryWithEvents,
  scheduleEventNotification,
  cancelEventNotification,
  rescheduleEventNotification,
  testLocalNotification,
  getAllScheduledNotifications,
  cancelAllNotifications,
  saveUserPushToken,
  sendGroupNotification,
  getNotificationSettings,
  updateNotificationSettings,
};
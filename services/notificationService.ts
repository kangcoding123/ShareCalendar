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
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 8,
        minute: 0,
      },
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

// 🌟 오늘의 일정으로 일일 요약 내용 업데이트 (매일 8시 예약 알림)
export async function updateDailySummaryWithEvents(userId: string) {
  try {
    const today = new Date();
    // 로컬 시간 기준으로 날짜 문자열 생성 (UTC가 아닌 로컬 시간대 사용)
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
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
      // 날짜 부분만 추출하여 비교 (시간 부분 제거)
      const startDateStr = event.startDate.split('T')[0];
      const endDateStr = (event.endDate || event.startDate).split('T')[0];
      return startDateStr <= todayStr && todayStr <= endDateStr;
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
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 8,
        minute: 0,
      },
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
// - 개인 일정: 로컬 알림만 (작성자에게)
// - 그룹 일정: 로컬 알림 (작성자) + Firestore 예약 저장 (Cloud Functions가 그룹 멤버에게 푸시)
export async function scheduleEventNotification(event: CalendarEvent, creatorUserId?: string): Promise<string | null> {
  if (!event.startDate || !event.title) {
    console.log('일정에 날짜와 제목이 필요합니다');
    return null;
  }

  try {
    // 일정 시작 시간 계산
    let eventTime: Date;

    // startDate에 시간 정보가 포함되어 있는지 확인
    if (event.startDate.includes('T')) {
      // 이미 ISO 형식 (예: 2025-12-10T14:00:00)
      eventTime = new Date(event.startDate);
    } else {
      // 날짜만 있는 경우 (예: 2025-12-10)
      const timeStr = event.time || '09:00';
      // time이 HH:MM 형식인지 HH:MM:SS 형식인지 확인
      const formattedTime = timeStr.includes(':') ? timeStr : '09:00';
      eventTime = new Date(`${event.startDate}T${formattedTime}:00`);
    }

    // 유효한 날짜인지 확인
    if (isNaN(eventTime.getTime())) {
      console.log('유효하지 않은 날짜:', event.startDate, event.time);
      return null;
    }

    // 알림 시간 계산 (일정 시작 1시간 전)
    const notificationTime = new Date(eventTime.getTime() - (60 * 60 * 1000));
    const now = new Date();

    console.log(`[알림 예약] 이벤트: ${event.title}, 시작: ${eventTime.toLocaleString()}, 알림: ${notificationTime.toLocaleString()}`);

    // 과거 시간이면 알림 예약하지 않음
    if (notificationTime <= now) {
      console.log('과거 시간에 대한 알림은 예약할 수 없습니다');
      return null;
    }

    // 1. 로컬 알림 예약 (작성자 본인에게)
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

    // 2. 그룹 일정인 경우: Firestore에 예약 알림 저장 (Cloud Functions가 그룹 멤버들에게 푸시)
    if (event.groupId && event.groupId !== 'personal' && event.id) {
      await saveScheduledNotificationForGroup(event, notificationTime, creatorUserId);
    }

    return notificationId;
  } catch (error) {
    console.error('일정 알림 예약 오류:', error);
    return null;
  }
}

// 🌟 그룹 일정 알림 예약 저장 (Cloud Functions용)
async function saveScheduledNotificationForGroup(
  event: CalendarEvent,
  notificationTime: Date,
  creatorUserId?: string
): Promise<void> {
  try {
    await nativeDb.collection('scheduledNotifications').add({
      performAt: notificationTime,
      status: 'scheduled',
      eventId: event.id,
      eventTitle: event.title,
      groupId: event.groupId,
      creatorId: creatorUserId || event.userId,
      createdAt: new Date().toISOString()
    });
    console.log(`그룹 알림 예약 저장: ${event.title}, 시간: ${notificationTime.toLocaleString()}`);
  } catch (error) {
    console.error('그룹 알림 예약 저장 오류:', error);
  }
}

// 🌟 일정 알림 취소 (로컬 알림 + Cloud Functions 예약 알림)
export async function cancelEventNotification(eventId: string) {
  try {
    // 1. 로컬 알림 취소
    const eventDoc = await nativeDb.collection('events').doc(eventId).get();
    const eventData = eventDoc.data();

    if (eventData?.notificationId) {
      await Notifications.cancelScheduledNotificationAsync(eventData.notificationId);
      console.log(`로컬 알림이 취소되었습니다: ${eventData.notificationId}`);

      // 알림 ID 제거
      await nativeDb.collection('events').doc(eventId).update({
        notificationId: null,
        notificationTime: null
      });
    }

    // 2. Cloud Functions 예약 알림 취소 (그룹 일정인 경우)
    await cancelScheduledNotificationForGroup(eventId);

    return true;
  } catch (error) {
    console.error('일정 알림 취소 오류:', error);
    return false;
  }
}

// 🌟 Cloud Functions 예약 알림 취소
async function cancelScheduledNotificationForGroup(eventId: string): Promise<void> {
  try {
    // eventId로 예약된 알림 조회
    const scheduledSnapshot = await nativeDb.collection('scheduledNotifications')
      .where('eventId', '==', eventId)
      .where('status', '==', 'scheduled')
      .get();

    if (scheduledSnapshot.empty) {
      return;
    }

    // 각 문서의 상태를 cancelled로 변경
    const batch = nativeDb.batch();
    scheduledSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        status: 'cancelled',
        cancelledAt: new Date().toISOString()
      });
    });

    await batch.commit();
    console.log(`${scheduledSnapshot.size}개의 예약 알림이 취소되었습니다 (eventId: ${eventId})`);
  } catch (error) {
    console.error('예약 알림 취소 오류:', error);
  }
}

// 🌟 일정 수정 시 알림 재예약
export async function rescheduleEventNotification(event: CalendarEvent, creatorUserId?: string) {
  try {
    // 기존 알림 취소
    if (event.id) {
      await cancelEventNotification(event.id);
    }

    // 새로운 알림 예약
    const newNotificationId = await scheduleEventNotification(event, creatorUserId);
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

// 🌟 개별 사용자에게 알림 전송 (댓글 알림용)
export async function sendUserNotification(
  userId: string,
  title: string,
  body: string,
  data: any
) {
  try {
    const userDoc = await nativeDb.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (userData?.pushToken) {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: userData.pushToken,
          sound: 'default',
          title,
          body,
          data,
          priority: 'high',
          badge: 1,
        }),
      });

      const result = await response.json();
      console.log('개별 사용자 알림 전송 결과:', result);
    }
  } catch (error) {
    console.error('개별 사용자 알림 전송 오류:', error);
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
  console.log('[그룹 알림 전송 시작]:', { groupId, title, body });

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

// 🌟 앱 시작 시 그룹 일정 알림 동기화
// - 사용자가 속한 그룹의 미래 일정 중 scheduledNotifications에 없는 것들을 추가
export async function syncGroupEventNotifications(userId: string): Promise<number> {
  try {
    console.log('[알림 동기화] 시작 - userId:', userId);

    // 1. 사용자가 속한 그룹 조회
    const membershipsSnapshot = await nativeDb
      .collection('groupMembers')
      .where('userId', '==', userId)
      .get();

    const userGroupIds = membershipsSnapshot.docs.map(doc => doc.data().groupId);

    if (userGroupIds.length === 0) {
      console.log('[알림 동기화] 속한 그룹 없음');
      return 0;
    }

    // 2. 현재 시간 기준 1시간 후 ~ 7일 이내 일정만 대상 (쿼리 최적화)
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const oneHourLaterStr = oneHourLater.toISOString().split('T')[0];
    const sevenDaysLaterStr = sevenDaysLater.toISOString().split('T')[0];

    // 3. 그룹 일정 조회 (in 연산자는 최대 10개까지, 7일 이내만)
    let futureEvents: CalendarEvent[] = [];
    const chunks = [];
    for (let i = 0; i < userGroupIds.length; i += 10) {
      chunks.push(userGroupIds.slice(i, i + 10));
    }

    for (const chunk of chunks) {
      const eventsSnapshot = await nativeDb
        .collection('events')
        .where('groupId', 'in', chunk)
        .where('startDate', '>=', oneHourLaterStr)
        .where('startDate', '<=', sevenDaysLaterStr)
        .get();

      const events = eventsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as CalendarEvent));

      futureEvents = [...futureEvents, ...events];
    }

    if (futureEvents.length === 0) {
      console.log('[알림 동기화] 미래 그룹 일정 없음');
      return 0;
    }

    console.log(`[알림 동기화] 미래 그룹 일정 ${futureEvents.length}개 발견`);

    // 4. 각 일정에 대해 scheduledNotifications 존재 여부 확인 후 추가
    let addedCount = 0;

    for (const event of futureEvents) {
      if (!event.id) continue;

      // 이미 예약된 알림이 있는지 확인
      const existingSnapshot = await nativeDb
        .collection('scheduledNotifications')
        .where('eventId', '==', event.id)
        .where('status', '==', 'scheduled')
        .limit(1)
        .get();

      if (!existingSnapshot.empty) {
        // 이미 예약되어 있음
        continue;
      }

      // 알림 시간 계산
      let eventTime: Date;
      if (event.startDate.includes('T')) {
        eventTime = new Date(event.startDate);
      } else {
        const timeStr = event.time || '09:00';
        eventTime = new Date(`${event.startDate}T${timeStr}:00`);
      }

      if (isNaN(eventTime.getTime())) {
        continue;
      }

      const notificationTime = new Date(eventTime.getTime() - 60 * 60 * 1000);

      // 과거 시간이면 스킵
      if (notificationTime <= now) {
        continue;
      }

      // scheduledNotifications에 추가
      const eventStartDate = event.startDate.includes('T')
        ? event.startDate.split('T')[0]
        : event.startDate;

      await nativeDb.collection('scheduledNotifications').add({
        performAt: notificationTime,
        status: 'scheduled',
        eventId: event.id,
        eventTitle: event.title || '제목 없음',
        eventStartDate: eventStartDate,
        groupId: event.groupId,
        creatorId: event.userId,
        createdAt: new Date().toISOString(),
        source: 'sync' // 동기화로 생성됨을 표시
      });

      addedCount++;
      console.log(`[알림 동기화] 추가: ${event.title}, 알림시간: ${notificationTime.toLocaleString()}`);
    }

    console.log(`[알림 동기화] 완료 - ${addedCount}개 알림 추가됨`);
    return addedCount;
  } catch (error) {
    console.error('[알림 동기화] 오류:', error);
    return 0;
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
  sendUserNotification,
  sendGroupNotification,
  getNotificationSettings,
  updateNotificationSettings,
  syncGroupEventNotifications,
};
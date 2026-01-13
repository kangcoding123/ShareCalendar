import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';

admin.initializeApp();
const db = admin.firestore();
const expo = new Expo();

/**
 * 매 분마다 실행 - 예약된 알림 전송
 * scheduledNotifications 컬렉션에서 전송 시간이 된 알림을 찾아 푸시 전송
 */
export const sendScheduledNotifications = functions
  .region('asia-northeast3') // 서울 리전
  .pubsub.schedule('* * * * *') // 매 분 실행
  .timeZone('Asia/Seoul')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    try {
      // 전송 대기 중인 알림 조회
      const snapshot = await db.collection('scheduledNotifications')
        .where('status', '==', 'scheduled')
        .where('performAt', '<=', now)
        .limit(100) // 한 번에 최대 100개 처리
        .get();

      if (snapshot.empty) {
        console.log('전송할 알림이 없습니다.');
        return null;
      }

      console.log(`${snapshot.size}개의 알림을 처리합니다.`);

      for (const doc of snapshot.docs) {
        const task = doc.data();

        try {
          // 그룹 멤버들의 푸시 토큰 조회
          const membersSnapshot = await db.collection('groupMembers')
            .where('groupId', '==', task.groupId)
            .get();

          const messages: ExpoPushMessage[] = [];

          for (const member of membersSnapshot.docs) {
            const memberData = member.data();

            // 작성자는 제외 (이미 로컬 알림을 받음)
            if (memberData.userId === task.creatorId) continue;

            // 사용자의 푸시 토큰 조회
            const userDoc = await db.collection('users').doc(memberData.userId).get();
            const userData = userDoc.data();
            const pushToken = userData?.pushToken;

            if (pushToken && Expo.isExpoPushToken(pushToken)) {
              messages.push({
                to: pushToken,
                sound: 'default',
                priority: 'high',
                title: '일정 알림 ⏰',
                body: `1시간 후: ${task.eventTitle}`,
                data: {
                  type: 'event_reminder',
                  eventId: task.eventId,
                  eventStartDate: task.eventStartDate || '',
                  groupId: task.groupId
                }
              });
            }
          }

          // 푸시 알림 전송
          if (messages.length > 0) {
            const chunks = expo.chunkPushNotifications(messages);

            for (const chunk of chunks) {
              try {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                console.log(`알림 전송 완료: ${task.eventTitle}, 대상: ${chunk.length}명`);

                // 티켓 로그 (디버깅용)
                ticketChunk.forEach((ticket, index) => {
                  if (ticket.status === 'error') {
                    console.error(`알림 전송 실패: ${ticket.message}`);
                  }
                });
              } catch (sendError) {
                console.error('푸시 전송 오류:', sendError);
              }
            }
          }

          // 상태 업데이트
          await doc.ref.update({
            status: 'sent',
            sentAt: admin.firestore.Timestamp.now(),
            sentCount: messages.length
          });

        } catch (taskError) {
          console.error(`알림 처리 오류 (${doc.id}):`, taskError);

          // 오류 발생 시 상태 업데이트
          await doc.ref.update({
            status: 'error',
            errorMessage: String(taskError),
            errorAt: admin.firestore.Timestamp.now()
          });
        }
      }

      return null;
    } catch (error) {
      console.error('스케줄 함수 실행 오류:', error);
      return null;
    }
  });

/**
 * 일정 생성 시 자동으로 알림 예약 (onCreate 트리거)
 * - 그룹 일정만 처리 (개인 일정은 제외)
 * - 클라이언트에서 이미 생성한 경우 중복 방지
 */
export const onEventCreated = functions
  .region('asia-northeast3')
  .firestore.document('events/{eventId}')
  .onCreate(async (snapshot, context) => {
    const event = snapshot.data();
    const eventId = context.params.eventId;

    // 개인 일정은 제외
    if (!event.groupId || event.groupId === 'personal') {
      console.log('개인 일정은 알림 예약 제외:', eventId);
      return null;
    }

    // 시작 시간 계산 (한국 시간 기준)
    let eventTime: Date;
    if (event.startDate.includes('T')) {
      eventTime = new Date(event.startDate);
    } else {
      const timeStr = event.time || '09:00';
      // 한국 시간(+09:00)으로 명시적 지정
      eventTime = new Date(`${event.startDate}T${timeStr}:00+09:00`);
    }

    // 유효한 날짜인지 확인
    if (isNaN(eventTime.getTime())) {
      console.log('유효하지 않은 날짜:', event.startDate);
      return null;
    }

    // 알림 시간 (1시간 전)
    const notificationTime = new Date(eventTime.getTime() - 60 * 60 * 1000);
    const now = new Date();

    // 과거 시간이면 알림 예약 안 함
    if (notificationTime <= now) {
      console.log('과거 시간에 대한 알림은 예약 안 함:', eventId);
      return null;
    }

    try {
      // 중복 체크: 이미 같은 eventId로 예약된 알림이 있는지 확인
      const existingSnapshot = await db.collection('scheduledNotifications')
        .where('eventId', '==', eventId)
        .where('status', '==', 'scheduled')
        .limit(1)
        .get();

      if (!existingSnapshot.empty) {
        console.log('이미 알림이 예약되어 있음:', eventId);
        return null;
      }

      // 알림 예약 생성
      const eventStartDate = event.startDate.includes('T')
        ? event.startDate.split('T')[0]
        : event.startDate;

      await db.collection('scheduledNotifications').add({
        performAt: admin.firestore.Timestamp.fromDate(notificationTime),
        status: 'scheduled',
        eventId: eventId,
        eventTitle: event.title || '제목 없음',
        eventStartDate: eventStartDate,
        groupId: event.groupId,
        creatorId: event.userId,
        createdAt: admin.firestore.Timestamp.now(),
        source: 'server' // 서버에서 생성됨을 표시
      });

      console.log(`알림 예약 완료: ${event.title}, 시간: ${notificationTime.toISOString()}`);
      return null;
    } catch (error) {
      console.error('알림 예약 오류:', error);
      return null;
    }
  });

/**
 * 오래된 알림 기록 정리 (매일 자정 실행)
 * 7일 이상 지난 sent/cancelled/error 상태의 알림 삭제
 */
export const cleanupOldNotifications = functions
  .region('asia-northeast3')
  .pubsub.schedule('0 0 * * *') // 매일 자정
  .timeZone('Asia/Seoul')
  .onRun(async () => {
    const sevenDaysAgo = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );

    try {
      // 7일 이상 된 전송 완료/취소/오류 알림 조회
      const oldNotifications = await db.collection('scheduledNotifications')
        .where('status', 'in', ['sent', 'cancelled', 'error'])
        .where('performAt', '<', sevenDaysAgo)
        .limit(500)
        .get();

      if (oldNotifications.empty) {
        console.log('삭제할 오래된 알림이 없습니다.');
        return null;
      }

      const batch = db.batch();
      oldNotifications.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      console.log(`${oldNotifications.size}개의 오래된 알림을 삭제했습니다.`);

      return null;
    } catch (error) {
      console.error('알림 정리 오류:', error);
      return null;
    }
  });

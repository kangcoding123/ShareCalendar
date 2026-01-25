// components/calendar/event/EventItem.tsx
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet
} from 'react-native';
import { CalendarEvent } from '../../../services/calendarService';
import { formatDate } from '../../../utils/dateUtils';
import AttachmentList from '../../board/AttachmentList';

interface EventItemProps {
  event: CalendarEvent;
  onEdit: ((event: CalendarEvent) => void) | null;
  onDelete: ((event: CalendarEvent) => void) | null;
  userId: string;
  colors: any;
  readOnly?: boolean; // 읽기 전용 모드 추가
}

const EventItem = ({ event, onEdit, onDelete, userId, colors, readOnly = false }: EventItemProps) => {
  // 이벤트가 그룹 일정인지 확인
  const isGroupEvent = event.groupId !== 'personal';
  // 현재 사용자가 작성자인지 확인
  const isCreator = event.userId === userId;

  // 다일 일정인지 확인
  const isMultiDay = event.isMultiDay && event.startDate !== event.endDate;

  // 반복 일정인지 확인
  const isRecurring = event.recurrence && event.recurrence.type !== 'none';
  const isRecurringInstance = event.isRecurringInstance;
  
  return (
    <View style={[styles.eventItem, { backgroundColor: colors.eventCardBackground }]}>
      <View style={[styles.eventColor, { backgroundColor: event.color || colors.tint }]} />
      
      <View style={styles.eventDetails}>
        <View style={styles.eventTitleRow}>
          <Text
            style={[styles.eventTitle, { color: colors.text }]}
            numberOfLines={1}
            ellipsizeMode="tail"
            allowFontScaling={false}
          >
            {event.title}
          </Text>
          {/* 반복 일정 아이콘 */}
          {(isRecurring || isRecurringInstance) && (
            <Text style={styles.recurringIcon}>🔄</Text>
          )}
        </View>
        
        {/* 다일 일정인 경우 기간 표시 */}
        {isMultiDay && (
          <Text
            style={[styles.eventDate, { color: colors.lightGray }]}
            numberOfLines={1}
            allowFontScaling={false}
          >
            {formatDate(new Date(event.startDate), 'yyyy-MM-dd')} ~ {formatDate(new Date(event.endDate), 'yyyy-MM-dd')}
          </Text>
        )}

        {/* 시간 표시 */}
        {event.time && (
          <Text
            style={[styles.eventTime, { color: colors.lightGray }]}
            numberOfLines={1}
            allowFontScaling={false}
          >
            {event.time}
          </Text>
        )}
        
        {event.description ? (
          <Text style={[styles.eventDescription, { color: colors.lightGray }]}>
            {event.description}
          </Text>
        ) : null}

        {/* 첨부파일 표시 */}
        {event.attachments && event.attachments.length > 0 && (
          <View style={styles.attachmentSection}>
            <AttachmentList attachments={event.attachments} colors={colors} />
          </View>
        )}

        <View style={styles.eventMetaContainer}>
          <View style={[styles.eventGroupContainer, { backgroundColor: colors.secondary }]}>
            <Text
              style={[styles.eventGroupText, { color: colors.darkGray }]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {event.groupName || '개인 일정'}
            </Text>
          </View>
          
          {/* 다일 일정 배지 추가 */}
          {isMultiDay && (
            <View style={[styles.eventBadge, { backgroundColor: colors.tint + '20' }]}>
              <Text style={[styles.eventBadgeText, { color: colors.tint }]}>
                다일 일정
              </Text>
            </View>
          )}

          {/* 반복 일정 배지 추가 */}
          {(isRecurring || isRecurringInstance) && (
            <View style={[styles.eventBadge, { backgroundColor: '#9C27B0' + '20' }]}>
              <Text style={[styles.eventBadgeText, { color: '#9C27B0' }]}>
                {event.recurrence?.type === 'weekly' ? '매주' :
                 event.recurrence?.type === 'monthly' ? '매월' :
                 event.recurrence?.type === 'yearly' ? '매년' : '반복'}
                {/* 반복 종료일 표시 */}
                {event.recurrence?.endType === 'until' && event.recurrence?.endDate && (
                  ` (~${event.recurrence.endDate.substring(0, 4)}년 ${parseInt(event.recurrence.endDate.substring(5, 7), 10)}월)`
                )}
              </Text>
            </View>
          )}
          
          {/* 알림 표시 */}
          {event.notificationEnabled && (
            <View style={[styles.notificationBadge, { backgroundColor: colors.tint + '20' }]}>
              <Text style={[styles.notificationBadgeText, { color: colors.tint }]}>
                알림 {event.notificationMinutesBefore}분 전
              </Text>
            </View>
          )}
          
          {/* 그룹 일정일 경우 작성자 표시 */}
          {isGroupEvent && (
            <View style={[styles.eventCreatorContainer, { backgroundColor: colors.secondary }]}>
              <Text
                style={[styles.eventCreatorText, { color: colors.darkGray }]}
                numberOfLines={1}
                allowFontScaling={false}
              >
                작성자: {event.createdByName || (event.userId === userId ? '나' : '그룹 멤버')}
              </Text>
            </View>
          )}
        </View>
      </View>
      
      {/* 읽기 전용 모드가 아니고 작성자인 경우에만 편집/삭제 버튼 표시 */}
      {!readOnly && isCreator && onEdit && onDelete ? (
        <View style={styles.eventActions}>
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: colors.secondary }]} 
            onPress={() => onEdit(event)}
          >
            <Text style={[styles.actionButtonText, { color: colors.darkGray }]}>편집</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionButton, styles.deleteButton, { backgroundColor: '#ffebee' }]} 
            onPress={() => onDelete(event)}
          >
            <Text style={styles.deleteButtonText}>삭제</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // 읽기 전용이거나 작성자가 아닌 경우 메시지 표시
        <View style={styles.eventActionsDisabled}>
          {readOnly ? (
            <Text style={[styles.eventCreatorOnlyText, { color: colors.lightGray }]}>로그인 필요</Text>
          ) : (
            <Text style={[styles.eventCreatorOnlyText, { color: colors.lightGray }]}>작성자만 수정 가능</Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  eventItem: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10
  },
  eventColor: {
    width: 4,
    borderRadius: 2,
    marginRight: 10
  },
  eventDetails: {
    flex: 1
  },
  eventTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1
  },
  recurringIcon: {
    fontSize: 14,
    marginLeft: 6
  },
  eventTime: {
    fontSize: 14,
    marginBottom: 3
  },
  eventDate: {
    fontSize: 14,
    marginBottom: 3
  },
  eventDescription: {
    fontSize: 14,
    marginBottom: 5
  },
  attachmentSection: {
    marginTop: 8,
    marginBottom: 8,
  },
  eventMetaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center'
  },
  eventGroupContainer: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 8,
    marginBottom: 4
  },
  eventGroupText: {
    fontSize: 12
  },
  eventCreatorContainer: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4
  },
  eventCreatorText: {
    fontSize: 12
  },
  notificationBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 8,
    marginBottom: 4
  },
  notificationBadgeText: {
    fontSize: 12,
  },
  eventBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 8,
    marginBottom: 4
  },
  eventBadgeText: {
    fontSize: 12,
  },
  eventActions: {
    marginLeft: 10,
    justifyContent: 'center'
  },
  actionButton: {
    marginBottom: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4
  },
  actionButtonText: {
    fontSize: 12
  },
  deleteButton: {
  },
  deleteButtonText: {
    color: '#f44336',
    fontSize: 12
  },
  eventActionsDisabled: {
    marginLeft: 10,
    justifyContent: 'center',
    padding: 5
  },
  eventCreatorOnlyText: {
    fontSize: 10
  }
});

export default EventItem;
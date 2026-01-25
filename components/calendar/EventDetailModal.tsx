// components/calendar/EventDetailModal.tsx
import React, { useState, useEffect, useRef } from 'react';  // useRef는 wasVisibleRef, isInitialLoadRef에 사용
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ColorSchemeName,
  ActivityIndicator,
  InteractionManager
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addEvent, updateEvent, deleteEvent, CalendarEvent } from '../../services/calendarService';
import { Group } from '../../services/groupService';
import { formatDate } from '../../utils/dateUtils';
import EventItem from './event/EventItem';
import EventForm, { AttachmentChanges } from './event/EventForm';
import { useRouter } from 'expo-router';
import { uploadEventFiles, deleteFiles } from '../../services/fileService';
import { Attachment } from '../../types/board';

// 타입 정의 수정
interface CalendarDay {
  date: Date;
  formattedDate: string;
  [key: string]: any;
}

interface EventDetailModalProps {
  visible: boolean;
  selectedDate: CalendarDay | null;
  events: CalendarEvent[];
  groups: Group[];
  userId: string;
  user: { displayName?: string | null; uid?: string } | null;
  onClose: () => void;
  onEventUpdated: (action: string, eventData: any) => void;
  colorScheme: ColorSchemeName;
  colors: any;
}

const EventDetailModal = ({
  visible,
  selectedDate,
  events,
  groups,
  userId,
  user,
  onClose,
  onEventUpdated,
  colorScheme,
  colors
}: EventDetailModalProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 모달 내부에서 사용할 로컬 events 상태 (모달이 열릴 때 캡처)
  const [localEvents, setLocalEvents] = useState<CalendarEvent[]>([]);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // 삭제 확인 모달 상태
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'deleting' | 'completed'>('idle');

  // 이전 visible 상태를 추적하는 ref
  const wasVisibleRef = useRef(visible);
  // 초기 로드 완료 상태 추적
  const isInitialLoadRef = useRef(true);
  // ScrollView ref
  const scrollViewRef = useRef<ScrollView>(null);

  // visible이 변경될 때만 실행 (events 변경에는 반응하지 않음)
  useEffect(() => {
    // visible이 false → true로 변경되었을 때만 실행
    if (visible && !wasVisibleRef.current) {
      console.log('[EventDetailModal] 모달 열림, events 캡처:', events?.length || 0);
      // 모달이 열릴 때 events를 로컬 상태로 캡처
      setLocalEvents(events || []);

      // 모달이 새로 열릴 때만 자동 편집 모드 전환
      if (events && events.length === 0 && user) {
        setIsEditing(true);
        setEditingEvent(null);
      } else {
        setIsEditing(false);
        setEditingEvent(null);
      }

      // 초기 로드 완료 표시
      isInitialLoadRef.current = false;

      // 모달 애니메이션 완료 후 스크롤 초기화
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      }, 150);
    }

    // 현재 visible 상태 저장
    wasVisibleRef.current = visible;

    // 모달이 닫힐 때 상태 초기화
    if (!visible) {
      setTimeout(() => {
        setIsEditing(false);
        setEditingEvent(null);
        setLocalEvents([]);
        isInitialLoadRef.current = true;
      }, 300);
    }
  }, [visible, user]); // events를 의존성에서 제거 - 모달이 열릴 때만 캡처

  // ✅ 추가: 모달이 열려있고 localEvents가 비어있는데 events가 로드되면 업데이트
  useEffect(() => {
    if (visible && localEvents.length === 0 && events && events.length > 0) {
      console.log('[EventDetailModal] 이벤트 지연 로드 감지, 업데이트:', events.length);
      setLocalEvents(events);
      // 이벤트가 있으면 편집 모드 해제
      setIsEditing(false);
      setEditingEvent(null);
    }
  }, [visible, events, localEvents.length]);

  // 이벤트 ID 제거 핸들러
  const handleRemoveEventId = () => {
    if (editingEvent) {
      const { id, ...eventDataWithoutId } = editingEvent;
      setEditingEvent(eventDataWithoutId as CalendarEvent);
    }
  };
  
  const handleAddEvent = () => {
    if (!user) {
      onClose();
      router.push('/(auth)/login');
      return;
    }
    
    setIsEditing(true);
    setEditingEvent(null);
  };
  
  const handleEditEvent = (event: CalendarEvent) => {
    if (!user) {
      onClose();
      router.push('/(auth)/login');
      return;
    }

    // 반복 일정 인스턴스인 경우 마스터 이벤트를 찾아서 수정
    if (event.isRecurringInstance && event.masterEventId) {
      Alert.alert(
        '반복 일정 수정',
        '이 반복 일정의 모든 인스턴스가 수정됩니다.',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '수정',
            onPress: () => {
              // 마스터 이벤트 정보로 편집 모드 진입
              // masterEventId를 id로 사용하고 반복 설정 유지
              const masterEvent: CalendarEvent = {
                ...event,
                id: event.masterEventId,
                isRecurringInstance: false,
                masterEventId: undefined
              };
              setEditingEvent(masterEvent);
              setIsEditing(true);
            }
          }
        ]
      );
    } else {
      setEditingEvent(event);
      setIsEditing(true);
    }
  };
  
  // 삭제 확인 모달 열기
  const handleDeleteEvent = (event: CalendarEvent) => {
    if (!user) {
      onClose();
      router.push('/(auth)/login');
      return;
    }

    setDeleteTarget(event);
    setDeleteStatus('idle');
    setDeleteModalVisible(true);
  };

  // 실제 삭제 실행
  const executeDelete = async () => {
    if (!deleteTarget) return;

    // 반복 일정 인스턴스인 경우 마스터 이벤트 삭제
    const isRecurringInstance = deleteTarget.isRecurringInstance && deleteTarget.masterEventId;
    const eventIdToDelete = isRecurringInstance ? deleteTarget.masterEventId : deleteTarget.id;

    if (!eventIdToDelete) return;

    setDeleteStatus('deleting');

    try {
      console.log('Deleting event:', eventIdToDelete, isRecurringInstance ? '(recurring master)' : '');

      // 🔥 삭제는 서비스에서 낙관적 업데이트 처리
      await deleteEvent(eventIdToDelete);

      setDeleteStatus('completed');

      // 완료 애니메이션 후 모달 닫기
      setTimeout(() => {
        setDeleteModalVisible(false);
        setDeleteTarget(null);
        onEventUpdated('delete', eventIdToDelete);
        onClose();
      }, 400);
    } catch (error) {
      console.error('Event deletion error:', error);
      setDeleteStatus('idle');
      Alert.alert('오류', '일정 삭제 중 오류가 발생했습니다.');
    }
  };

  // 삭제 모달 닫기
  const closeDeleteModal = () => {
    if (deleteStatus === 'deleting') return; // 삭제 중에는 닫기 불가
    setDeleteModalVisible(false);
    setDeleteTarget(null);
    setDeleteStatus('idle');
  };
  
  const handleSubmitEvent = async (eventData: CalendarEvent, attachmentChanges?: AttachmentChanges) => {
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);

      eventData.notificationEnabled = false;
      eventData.notificationMinutesBefore = null;
      eventData.notificationId = null;

      const mainGroupId = eventData.groupId;
      const targetGroupIds = eventData.targetGroupIds || [mainGroupId];

      if (eventData.id) {
        // 🔥 업데이트는 서비스에서 낙관적 업데이트 처리

        // 첨부파일 처리
        let finalAttachments: Attachment[] = attachmentChanges?.existingAttachments || [];

        // 새 첨부파일 업로드
        if (attachmentChanges?.pendingAttachments && attachmentChanges.pendingAttachments.length > 0) {
          try {
            const uploadedAttachments = await uploadEventFiles(
              attachmentChanges.pendingAttachments,
              mainGroupId,
              eventData.id
            );
            finalAttachments = [...finalAttachments, ...uploadedAttachments];
          } catch (uploadError) {
            console.error('첨부파일 업로드 오류:', uploadError);
            Alert.alert('오류', '첨부파일 업로드 중 오류가 발생했습니다.');
            return;
          }
        }

        // 삭제된 첨부파일 처리 (기존 첨부파일 중 existingAttachments에 없는 것들)
        const originalAttachments = editingEvent?.attachments || [];
        const removedAttachments = originalAttachments.filter(
          orig => !finalAttachments.some(kept => kept.id === orig.id)
        );
        if (removedAttachments.length > 0) {
          try {
            await deleteFiles(removedAttachments.map(att => att.storagePath));
          } catch (deleteError) {
            console.error('첨부파일 삭제 오류:', deleteError);
            // 삭제 실패해도 진행
          }
        }

        const updatedEventData = {
          ...eventData,
          userId: userId,
          updatedAt: new Date().toISOString(),
          attachments: finalAttachments.length > 0 ? finalAttachments : undefined,
        };

        console.log('Updating event:', updatedEventData);
        const result = await updateEvent(eventData.id, updatedEventData);

        if (result.success) {
          console.log('Event updated successfully:', updatedEventData);
          onEventUpdated('update', updatedEventData);
          // 모달 애니메이션 완료 후 닫기 (레이아웃 깜빡임 방지)
          InteractionManager.runAfterInteractions(() => {
            onClose();
          });
        } else {
          Alert.alert('오류', '일정 업데이트 중 오류가 발생했습니다.');
        }
      } else {
        // 🔥 생성은 서비스에서 낙관적 업데이트 처리
        const createdEvents = [];
        const { id, targetGroupIds: _, ...baseEventData } = eventData as any;

        const baseEvent = {
          ...baseEventData,
          userId,
          createdByName: baseEventData.groupId !== 'personal' ? user?.displayName : null,
        };

        const createPromises = targetGroupIds.map(async (groupId, index) => {
          const groupEventData = {
            ...baseEvent,
            groupId,
            groupName: groupId === 'personal'
              ? '개인 일정'
              : groups.find(g => g.id === groupId)?.name || '그룹 일정',
            color: groupId === 'personal'
              ? (baseEventData.color || colors.tint)  // EventForm에서 전달된 색상 우선 사용
              : groups.find(g => g.id === groupId)?.color || '#4CAF50',
            isSharedEvent: targetGroupIds.length > 1
          };

          // 첫 번째 그룹에만 첨부파일 업로드 (임시 eventId 사용)
          if (index === 0 && attachmentChanges?.pendingAttachments && attachmentChanges.pendingAttachments.length > 0) {
            const tempEventId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            try {
              const uploadedAttachments = await uploadEventFiles(
                attachmentChanges.pendingAttachments,
                groupId,
                tempEventId
              );
              groupEventData.attachments = uploadedAttachments;
            } catch (uploadError) {
              console.error('첨부파일 업로드 오류:', uploadError);
              // 첨부파일 업로드 실패해도 이벤트 생성은 진행
            }
          }

          return addEvent(groupEventData);
        });

        const results = await Promise.all(createPromises);
        const successResults = results.filter(r => r.success);

        if (successResults.length > 0) {
          console.log(`Created ${successResults.length} events for ${targetGroupIds.length} groups`);

          const firstSuccessResult = successResults[0];
          onEventUpdated('add', {
            ...baseEvent,
            id: firstSuccessResult.eventId
          });

          // 모달 애니메이션 완료 후 닫기 (레이아웃 깜빡임 방지)
          InteractionManager.runAfterInteractions(() => {
            onClose();
          });
        } else {
          Alert.alert('오류', '일정 저장 중 오류가 발생했습니다.');
        }
      }
    } catch (error) {
      console.error('Event submission error:', error);
      Alert.alert('오류', '일정 저장 중 오류가 발생했습니다.');
    } finally {
      setTimeout(() => {
        setIsSubmitting(false);
      }, 500);
    }
  };
  
  const renderContent = () => {
    if (isEditing && selectedDate) {
      return (
        <EventForm
          selectedDate={selectedDate}
          event={editingEvent || undefined}
          groups={groups}
          onSubmit={handleSubmitEvent}
          onCancel={onClose}
          colors={colors}
          onRemoveEventId={handleRemoveEventId}
          isSubmitting={isSubmitting}
        />
      );
    }
    
    if (!user) {
      return (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={true}
          bounces={true}
        >
          <Text style={[styles.dateHeader, { color: colors.text }]}>
            {selectedDate ? formatDate(selectedDate.date, 'yyyy년 MM월 dd일 (eee)') : ''}
          </Text>

          {localEvents && localEvents.length > 0 ? (
            <View style={styles.eventList}>
              {localEvents.map((event) => (
                <EventItem
                  key={event.id || event.title}
                  event={event}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  userId=""
                  colors={colors}
                  readOnly={true}
                />
              ))}
            </View>
          ) : (
            <View style={styles.noEventsContainer}>
              <Text style={[styles.noEventsText, { color: colors.lightGray }]}>일정이 없습니다.</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.loginButton, { backgroundColor: colors.tint }]}
            onPress={() => {
              onClose();
              router.push('/(auth)/login');
            }}
          >
            <Text style={[styles.loginButtonText, { color: colors.buttonText }]}>로그인하여 일정 관리하기</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }

    return (
      <View style={styles.contentWrapper}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={true}
          bounces={true}
          scrollEventThrottle={16}
        >
          <Text style={[styles.dateHeader, { color: colors.text }]}>
            {selectedDate ? formatDate(selectedDate.date, 'yyyy년 MM월 dd일 (eee)') : ''}
          </Text>

          {localEvents && localEvents.length > 0 ? (
            <View style={styles.eventList}>
              {localEvents.map((event) => (
                <EventItem
                  key={event.id || event.title}
                  event={event}
                  onEdit={handleEditEvent}
                  onDelete={handleDeleteEvent}
                  userId={userId}
                  colors={colors}
                />
              ))}
            </View>
          ) : (
            <View style={styles.noEventsContainer}>
              <Text style={[styles.noEventsText, { color: colors.lightGray }]}>일정이 없습니다.</Text>
            </View>
          )}
        </ScrollView>

        {/* 하단 고정 버튼 */}
        <View style={[styles.bottomButtonContainer, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.buttonBackground }]}
            onPress={handleAddEvent}
          >
            <Text style={[styles.addButtonText, { color: colors.buttonText }]}>일정 추가</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };
  
  // 삭제 메시지 생성
  const getDeleteMessage = () => {
    if (!deleteTarget) return '이 일정을 삭제하시겠습니까?';
    const isRecurringInstance = deleteTarget.isRecurringInstance && deleteTarget.masterEventId;
    return isRecurringInstance
      ? '이 반복 일정의 모든 인스턴스가 삭제됩니다.'
      : '이 일정을 삭제하시겠습니까?';
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <View style={styles.modalContainer}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.card,
                paddingBottom: insets.bottom
              }
            ]}
          >
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>
                {isEditing ? (editingEvent?.id ? '일정 편집' : '새 일정') : '일정 상세'}
              </Text>

              {!isEditing && (
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                  <Text style={[styles.closeButtonText, { color: colors.tint }]}>닫기</Text>
                </TouchableOpacity>
              )}
            </View>

            {renderContent()}
          </View>

          {/* 삭제 확인 오버레이 (모달 내부에 표시) */}
          {deleteModalVisible && (
            <View style={styles.deleteModalOverlay}>
              <View style={[styles.deleteModalContent, { backgroundColor: colors.card }]}>
                {deleteStatus === 'idle' && (
                  <>
                    <View style={[styles.deleteIconContainer, { backgroundColor: '#ffebee' }]}>
                      <Feather name="trash-2" size={32} color="#f44336" />
                    </View>
                    <Text style={[styles.deleteTitle, { color: colors.text }]}>일정 삭제</Text>
                    <Text style={[styles.deleteMessage, { color: colors.lightGray }]}>
                      {getDeleteMessage()}
                    </Text>
                    {deleteTarget?.title && (
                      <Text style={[styles.deleteEventTitle, { color: colors.text }]} numberOfLines={1}>
                        "{deleteTarget.title}"
                      </Text>
                    )}
                    <View style={styles.deleteButtons}>
                      <TouchableOpacity
                        style={[styles.deleteButton, styles.cancelButton, { borderColor: colors.border }]}
                        onPress={closeDeleteModal}
                      >
                        <Text style={[styles.cancelButtonText, { color: colors.text }]}>취소</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.deleteButton, styles.confirmDeleteButton]}
                        onPress={executeDelete}
                      >
                        <Text style={styles.confirmDeleteButtonText}>삭제</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {deleteStatus === 'deleting' && (
                  <View style={styles.deleteStatusContainer}>
                    <ActivityIndicator size="large" color={colors.tint} />
                    <Text style={[styles.deleteStatusText, { color: colors.text }]}>삭제 중...</Text>
                    <Text style={[styles.deleteStatusSubtext, { color: colors.lightGray }]}>
                      첨부파일을 정리하고 있습니다
                    </Text>
                  </View>
                )}

                {deleteStatus === 'completed' && (
                  <View style={styles.deleteStatusContainer}>
                    <View style={[styles.deleteIconContainer, { backgroundColor: '#e8f5e9' }]}>
                      <Feather name="check-circle" size={32} color="#4CAF50" />
                    </View>
                    <Text style={[styles.deleteStatusText, { color: colors.text }]}>삭제 완료</Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)'
  },
  modalContent: {
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    height: '90%',
    paddingBottom: 0
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold'
  },
  closeButton: {
    padding: 5
  },
  closeButtonText: {
    fontSize: 16
  },
  content: {
    flex: 1,
    padding: 15
  },
  contentContainer: {
    paddingBottom: 30
  },
  dateHeader: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 15
  },
  eventList: {
    marginBottom: 15
  },
  noEventsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  noEventsText: {
    fontSize: 16,
    textAlign: 'center'
  },
  addButton: {
    borderRadius: 8,
    padding: 12,
    alignItems: 'center'
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600'
  },
  loginButton: {
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 15
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '600'
  },
  contentWrapper: {
    flex: 1
  },
  bottomButtonContainer: {
    padding: 15,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)'
  },
  // 삭제 확인 오버레이 스타일 (모달 내부에 절대 위치로 표시)
  deleteModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 1000,
  },
  deleteModalContent: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8
  },
  deleteIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16
  },
  deleteTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8
  },
  deleteMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20
  },
  deleteEventTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 20,
    paddingHorizontal: 12,
    textAlign: 'center'
  },
  deleteButtons: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    marginTop: 8
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600'
  },
  confirmDeleteButton: {
    backgroundColor: '#f44336'
  },
  confirmDeleteButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff'
  },
  deleteStatusContainer: {
    alignItems: 'center',
    paddingVertical: 20
  },
  deleteStatusText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16
  },
  deleteStatusSubtext: {
    fontSize: 13,
    marginTop: 8
  }
});

export default EventDetailModal;
// app/(tabs)/index.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { 
  CalendarEvent, 
  getUserEvents,
  subscribeToUserEvents
} from '../../services/calendarService';
import { formatDate } from '../../utils/dateUtils';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getDoc, doc, updateDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db, auth } from '../../config/firebase';
import { deleteAccount } from '../../services/authService';

export default function HomeScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  
  // 색상 테마 설정
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  
  // 구독 취소 함수 참조 저장을 위한 ref 추가
  const unsubscribeRef = useRef<(() => void) | null>(null);
  
  // 프로필 관련 상태 추가
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [userDetails, setUserDetails] = useState<any>(null);
  
  // 이벤트 데이터 처리 함수 (분리된 로직)
  const processEvents = useCallback((events: CalendarEvent[]) => {
    if (!Array.isArray(events)) return;
    
    // 오늘 날짜 문자열 가져오기 (YYYY-MM-DD 형식)
    const now = new Date();
    const todayString = formatDate(now, 'yyyy-MM-dd');
    
    console.log('오늘 날짜 문자열:', todayString);
    
    // 오늘 일정 필터링
    const todayEvts = events.filter((event: CalendarEvent) => {
      return event.date === todayString;
    });
    
    setTodayEvents(todayEvts);
    
    // 다가오는 일정 필터링 (오늘 이후 날짜)
    const upcoming = events.filter((event: CalendarEvent) => {
      return event.date > todayString;
    }).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    // 다가오는 일정 중 최대 5개만 표시
    setUpcomingEvents(upcoming.slice(0, 5));
  }, []);
  
  // 실시간 구독 설정
  useEffect(() => {
    if (user && user.uid) {
      console.log('[HomeScreen] 실시간 이벤트 구독 설정...');
      
      // 로딩 상태 표시
      setLoading(true);
      
      // 중앙 구독 시스템 사용
      const unsubscribe = subscribeToUserEvents(user.uid, (updatedEvents) => {
        console.log(`[HomeScreen] 이벤트 업데이트 수신: ${updatedEvents.length}개`);
        processEvents(updatedEvents);
        setLoading(false);
      });
      
      unsubscribeRef.current = unsubscribe;
      
      // 컴포넌트 언마운트 시 구독 해제
      return () => {
        console.log('[HomeScreen] 이벤트 구독 해제');
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }
      };
    }
  }, [user, processEvents]);
  
  // 사용자 상세 정보 가져오기
  useEffect(() => {
    if (user && user.uid) {
      // Firestore에서 사용자 추가 정보 가져오기
      const fetchUserDetails = async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setUserDetails(userDoc.data());
          }
        } catch (error) {
          console.error('사용자 정보 가져오기 오류:', error);
        }
      };
      
      fetchUserDetails();
    }
  }, [user]);
  
  // 화면이 포커스될 때마다 데이터 새로고침(백업용)
  useFocusEffect(
    useCallback(() => {
      if (user && !unsubscribeRef.current) {
        // 구독이 활성화되지 않은 경우에만 데이터 새로고침
        loadEvents();
      }
      return () => {};
    }, [user])
  );
  
  // 기존 로드 함수 (백업용)
  const loadEvents = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const result = await getUserEvents(user.uid);
      
      if (result.success && Array.isArray(result.events)) {
        processEvents(result.events);
      }
    } catch (error) {
      console.error('일정 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const navigateToCalendar = () => {
    router.push('/(tabs)/calendar');
  };
  
  // 로그아웃 처리 함수
  const handleLogout = async () => {
    Alert.alert(
      '로그아웃',
      '정말 로그아웃하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        { 
          text: '로그아웃', 
          onPress: async () => {
            try {
              const result = await logout();
              if (result.success) {
                // 로그아웃 후 처리는 _layout.tsx에서 처리됨
              } else {
                Alert.alert('오류', '로그아웃 중 문제가 발생했습니다.');
              }
            } catch (error) {
              console.error('로그아웃 오류:', error);
              Alert.alert('오류', '로그아웃 중 문제가 발생했습니다.');
            }
          } 
        }
      ]
    );
  };
  
  // 프로필 수정 모달을 열 때 현재 이름으로 초기화
  const handleOpenProfileModal = () => {
    setProfileName(user?.displayName || '');
    setProfileModalVisible(true);
  };

  // 프로필 업데이트 함수
  const handleUpdateProfile = async () => {
    if (!user) return;
    
    if (!profileName.trim()) {
      Alert.alert('오류', '이름을 입력해주세요.');
      return;
    }
    
    setUpdatingProfile(true);
    try {
      // auth.currentUser를 직접 사용
      if (auth.currentUser) {
        // Firebase Auth 사용자 프로필 업데이트
        await updateProfile(auth.currentUser, { displayName: profileName });
        
        // Firestore 사용자 문서 업데이트
        await updateDoc(doc(db, 'users', user.uid), {
          displayName: profileName,
          updatedAt: new Date().toISOString()
        });
        
        // 성공 알림
        Alert.alert('성공', '프로필이 업데이트되었습니다.');
        setProfileModalVisible(false);
      } else {
        throw new Error('사용자가 로그인되어 있지 않습니다.');
      }
    } catch (error) {
      console.error('프로필 업데이트 오류:', error);
      Alert.alert('오류', '프로필 업데이트 중 오류가 발생했습니다.');
    } finally {
      setUpdatingProfile(false);
    }
  };

  // 회원탈퇴 처리 함수
  const handleDeleteAccount = () => {
    Alert.alert(
      '회원 탈퇴',
      '정말로 회원 탈퇴하시겠습니까? 모든 개인 정보와 일정이 삭제되며 이 작업은 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        { 
          text: '탈퇴', 
          style: 'destructive',
          onPress: async () => {
            try {
              setUpdatingProfile(true);
              const result = await deleteAccount();
              
              if (result.success) {
                Alert.alert('성공', '회원 탈퇴가 완료되었습니다.', [
                  { text: '확인' }
                ]);
                // 로그아웃은 자동으로 처리됨 (AuthContext에서)
              } else {
                Alert.alert('오류', result.error || '회원 탈퇴 중 오류가 발생했습니다.');
              }
            } catch (error) {
              console.error('회원 탈퇴 오류:', error);
              Alert.alert('오류', '회원 탈퇴 중 오류가 발생했습니다.');
            } finally {
              setUpdatingProfile(false);
              setProfileModalVisible(false);
            }
          }
        }
      ]
    );
  };

  // 디버깅용 코드 - 실행 환경 확인
  useEffect(() => {
    console.log(`[디버깅] Platform: ${Platform.OS}, isEmulator: ${__DEV__}, colorScheme: ${colorScheme}`);
  }, [colorScheme]);
  
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.secondary }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.secondary }]}>
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          <Text style={[styles.headerTitle, { color: colors.tint }]}>WE:IN</Text>
          
          <View style={styles.profileContainer}>
            <TouchableOpacity onPress={handleOpenProfileModal} style={styles.avatarContainer}>
              <View style={[styles.profileAvatar, { backgroundColor: colors.tint }]}>
                <Text style={styles.avatarText}>
                  {user?.displayName ? user.displayName.charAt(0).toUpperCase() : '?'}
                </Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={handleLogout} style={[styles.logoutButton, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.logoutButtonText, { color: colors.darkGray }]}>로그아웃</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.headerBottom}>
          <Text style={[styles.headerSubtitle, { color: colors.lightGray }]}>
            안녕하세요, {user?.displayName || '사용자'}님
          </Text>
        </View>
      </View>
      
      <ScrollView style={styles.content}>
        {/* 오늘 일정 섹션 */}
        <View style={[styles.section, { backgroundColor: colors.card, shadowColor: colorScheme === 'dark' ? 'transparent' : '#000' }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>오늘 일정</Text>
          <Text style={[styles.dateText, { color: colors.lightGray }]}>{formatDate(new Date(), 'yyyy년 MM월 dd일 (eee)')}</Text>
          
          {todayEvents.length > 0 ? (
            todayEvents.map((calendarEvent: CalendarEvent) => (
              <View key={calendarEvent.id} style={[styles.eventCard, { backgroundColor: colors.eventCardBackground }]}>
                <View 
                  style={[
                    styles.eventColor, 
                    { backgroundColor: calendarEvent.color || colors.tint }
                  ]} 
                />
                <View style={styles.eventInfo}>
                  <Text style={[styles.eventTitle, { color: colors.text }]}>{calendarEvent.title}</Text>
                  
                  {/* 시간 정보 추가 */}
                  {calendarEvent.time && (
                    <Text style={[styles.eventTime, { color: colors.lightGray }]}>
                      {calendarEvent.time}
                    </Text>
                  )}
                  
                  <Text style={[styles.eventGroup, { color: colors.darkGray }]}>{calendarEvent.groupName || '개인 일정'}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: colorScheme === 'dark' ? '#999' : '#999' }]}>오늘은 일정이 없습니다.</Text>
          )}
        </View>
        
        {/* 다가오는 일정 섹션 */}
        <View style={[styles.section, { backgroundColor: colors.card, shadowColor: colorScheme === 'dark' ? 'transparent' : '#000' }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>다가오는 일정</Text>
          
          {upcomingEvents.length > 0 ? (
            upcomingEvents.map((calendarEvent: CalendarEvent) => (
              <View key={calendarEvent.id} style={[styles.eventCard, { backgroundColor: colors.eventCardBackground }]}>
                <View 
                  style={[
                    styles.eventColor, 
                    { backgroundColor: calendarEvent.color || colors.tint }
                  ]} 
                />
                <View style={styles.eventInfo}>
                  <Text style={[styles.eventTitle, { color: colors.text }]}>{calendarEvent.title}</Text>
                  <Text style={[styles.eventDate, { color: colors.lightGray }]}>
                    {formatDate(new Date(calendarEvent.date), 'MM월 dd일 (eee)')}
                    {calendarEvent.time && ` ${calendarEvent.time}`} {/* 날짜와 시간 함께 표시 */}
                  </Text>
                  <Text style={[styles.eventGroup, { color: colors.darkGray }]}>{calendarEvent.groupName || '개인 일정'}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: colorScheme === 'dark' ? '#999' : '#999' }]}>다가오는 일정이 없습니다.</Text>
          )}
        </View>
        
        <TouchableOpacity 
          style={[styles.calendarButton, { backgroundColor: colors.buttonBackground }]} 
          onPress={navigateToCalendar}
        >
          <Text style={[styles.calendarButtonText, { color: colors.buttonText }]}>캘린더 보기</Text>
        </TouchableOpacity>
      </ScrollView>
      
      {/* 프로필 수정 모달 */}
      <Modal
        visible={profileModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>프로필 수정</Text>
            
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>이름</Text>
              <TextInput
                style={[styles.input, { 
                  backgroundColor: colors.inputBackground, 
                  borderColor: colors.inputBorder, 
                  color: colors.text 
                }]}
                placeholder="이름"
                placeholderTextColor={colors.lightGray}
                value={profileName}
                onChangeText={setProfileName}
              />
            </View>
            
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>이메일</Text>
              <Text style={[styles.emailValue, { 
                backgroundColor: colors.inputBackground, 
                borderColor: colors.inputBorder, 
                color: colors.lightGray 
              }]}>
                {user?.email || ''}
              </Text>
              <Text style={[styles.emailNote, { color: colors.lightGray }]}>
                이메일은 변경할 수 없습니다.
              </Text>
            </View>
            
            <View style={styles.deleteAccountContainer}>
              <TouchableOpacity 
                style={[styles.deleteAccountButton, updatingProfile && styles.disabledButton]}
                onPress={handleDeleteAccount}
                disabled={updatingProfile}
              >
                <Text style={styles.deleteAccountText}>회원 탈퇴</Text>
              </TouchableOpacity>
              <Text style={[styles.deleteAccountWarning, { color: colors.lightGray }]}>
                탈퇴 시 모든 데이터가 삭제됩니다
              </Text>
            </View>
            
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton, { backgroundColor: colors.secondary }]} 
                onPress={() => setProfileModalVisible(false)}
                disabled={updatingProfile}
              >
                <Text style={[styles.cancelButtonText, { color: colors.darkGray }]}>취소</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  styles.modalButton, 
                  { backgroundColor: colors.buttonBackground }, 
                  updatingProfile && { backgroundColor: colors.disabledButton }
                ]} 
                onPress={handleUpdateProfile}
                disabled={updatingProfile}
              >
                {updatingProfile ? (
                  <ActivityIndicator size="small" color={colors.buttonText} />
                ) : (
                  <Text style={[styles.submitButtonText, { color: colors.buttonText }]}>저장</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  headerBottom: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 14,
  },
  profileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    marginRight: 10,
  },
  profileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  logoutButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5
  },
  logoutButtonText: {
    fontSize: 12,
  },
  content: {
    flex: 1,
    padding: 15
  },
  section: {
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  dateText: {
    fontSize: 14,
    marginBottom: 15
  },
  eventCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10
  },
  eventColor: {
    width: 5,
    borderRadius: 3,
    marginRight: 10
  },
  eventInfo: {
    flex: 1
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 3
  },
  eventTime: {
    fontSize: 14,
    marginBottom: 3
  },
  eventDate: {
    fontSize: 14,
    marginBottom: 3
  },
  eventGroup: {
    fontSize: 12,
  },
  emptyText: {
    textAlign: 'center',
    padding: 20,
    fontStyle: 'italic'
  },
  calendarButton: {
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20
  },
  calendarButtonText: {
    fontSize: 16,
    fontWeight: 'bold'
  },
  // 모달 관련 스타일
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    borderRadius: 10,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
  },
  emailValue: {
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    paddingTop: 14, // TextInput과 비슷한 정렬을 위한 패딩
  },
  emailNote: {
    fontSize: 12,
    marginTop: 5,
    fontStyle: 'italic',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    marginRight: 10,
  },
  cancelButtonText: {
    fontWeight: '600',
  },
  submitButtonText: {
    fontWeight: '600',
  },
  // 회원 탈퇴 관련 스타일
  deleteAccountContainer: {
    marginTop: 10,
    marginBottom: 20,
    alignItems: 'center',
  },
  deleteAccountButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#ff3b30',
  },
  deleteAccountText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteAccountWarning: {
    fontSize: 12,
    marginTop: 5,
    fontStyle: 'italic',
  },
  disabledButton: {
    opacity: 0.7,
  },
});
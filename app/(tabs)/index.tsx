// app/(tabs)/index.tsx
import { Feather } from '@expo/vector-icons';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert, 
  Platform, 
  Modal, 
  TextInput, 
  useWindowDimensions,
  AppState
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useEvents } from '../../context/EventContext';
import { CalendarEvent } from '../../services/calendarService';
import { formatDate } from '../../utils/dateUtils';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
// Web SDK imports 제거
// import { getDoc, doc, updateDoc } from 'firebase/firestore';
// import { db } from '../../config/firebase';
import { auth, nativeDb } from '../../config/firebase';  // Native SDK만 사용
import { deleteAccount } from '../../services/authService';
import PrivacyPolicyModal from '@/components/PrivacyPolicyModal';
import { isCurrentUserAdmin } from '@/services/adminService';
import { IconSymbol } from '@/components/ui/IconSymbol';
import UpdatePopup from '@/components/UpdatePopup';
import { checkForUpdates } from '@/services/updateService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

export default function HomeScreen() {
  const router = useRouter();
  const { user, logout, loading: authLoading } = useAuth();
  const { events, groups, refreshAll } = useEvents();
  
  const [loading, setLoading] = useState(false);
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const screenRatio = screenHeight / screenWidth;
  
  const lastProcessedDate = useRef<string>('');
  
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  
  const insets = useSafeAreaInsets();
  
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [userDetails, setUserDetails] = useState<any>(null);
  
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [updateInfo, setUpdateInfo] = useState<{
    visible: boolean;
    versionInfo: any;
    isRequired: boolean;
  }>({
    visible: false,
    versionInfo: null,
    isRequired: false
  });
  
  // 사용자 상태에 따른 데이터 초기화 처리
  useEffect(() => {
    if (!user) {
      console.log('비로그인 상태 감지 - 홈 화면 데이터 초기화');
      setTodayEvents([]);
      setUpcomingEvents([]);
      setLoading(false);
      lastProcessedDate.current = '';
    }
  }, [user]);
  
  // 관리자 상태 확인
  useEffect(() => {
    const checkAdmin = async () => {
      if (user) {
        try {
          const adminStatus = await isCurrentUserAdmin();
          console.log('관리자 상태 확인:', adminStatus);
          setIsAdmin(adminStatus);
        } catch (error) {
          console.error('관리자 상태 확인 오류:', error);
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
    };
    
    checkAdmin();
  }, [user]);

  // 버전 체크를 비동기로 변경
  useEffect(() => {
    const checkForDailyUpdate = async () => {
      if (!user) return;
      
      try {
        const today = new Date().toDateString();
        const lastCheckDate = await AsyncStorage.getItem('lastUpdateCheck');
        
        if (lastCheckDate === today) {
          return;
        }
        
        checkForUpdates().then(updateResult => {
          if (updateResult.updateAvailable) {
            setUpdateInfo({
              visible: true,
              versionInfo: updateResult.versionInfo,
              isRequired: updateResult.requiredUpdate
            });
          }
        }).catch(error => {
          console.log('업데이트 체크 실패 (무시):', error);
        });
        
        await AsyncStorage.setItem('lastUpdateCheck', today);
      } catch (error) {
        console.error('업데이트 체크 오류:', error);
      }
    };
    
    setTimeout(() => {
      checkForDailyUpdate();
    }, 1000);
  }, [user]);

  const handleCloseUpdatePopup = () => {
    setUpdateInfo(prev => ({ ...prev, visible: false }));
  };  
  
  // ✅ 수정된 processEvents 함수 - 실시간 반영을 위해 스킵 로직 제거
  const processEvents = useCallback(() => {
    if (!Array.isArray(events)) return;
    
    const now = new Date();
    const todayString = formatDate(now, 'yyyy-MM-dd');
    
    // 실시간 반영을 위해 스킵 로직 제거 - 항상 이벤트 재처리
    console.log('[HomeScreen] 이벤트 처리 - 전체:', events.length, '개');
    lastProcessedDate.current = todayString;
    
    const todayEvts = events.filter((event: CalendarEvent) => {
      const eventDate = event.startDate.split('T')[0];
      if (event.isMultiDay) {
        const startDate = event.startDate.split('T')[0];
        const endDate = event.endDate.split('T')[0];
        return startDate <= todayString && endDate >= todayString;
      }
      return eventDate === todayString;
    });
    
    console.log('[HomeScreen] 오늘 이벤트:', todayEvts.length, '개');
    setTodayEvents(todayEvts);
    
    const upcoming = events.filter((event: CalendarEvent) => {
      const eventDate = event.startDate.split('T')[0];
      return eventDate > todayString;
    }).sort((a, b) => 
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
    
    console.log('[HomeScreen] 예정된 이벤트:', upcoming.length, '개');
    setUpcomingEvents(upcoming.slice(0, 5));
  }, [events]); // ✅ todayEvents.length 의존성 제거
  
  // ✅ useEffect 수정 - processEvents 의존성 추가
  useEffect(() => {
    processEvents();
  }, [events, processEvents]);
  
  // AppState 이벤트 리스너 - 앱 활성화 시 날짜 변경 체크
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        console.log('[HomeScreen] 앱 활성화 감지');
        const currentDate = formatDate(new Date(), 'yyyy-MM-dd');
        
        // 날짜가 변경되었을 때만 처리
        if (lastProcessedDate.current !== currentDate) {
          processEvents();
        }
      }
    });
    
    return () => {
      subscription.remove();
    };
  }, [processEvents]);
  
  // ✅ useFocusEffect 수정 - 화면 포커스 시 항상 이벤트 재처리
  useFocusEffect(
    useCallback(() => {
      console.log('[HomeScreen] 화면 포커스 - 이벤트 재처리');
      
      // 화면 포커스 시 항상 이벤트 재처리
      processEvents();
      
      // 선택: 필요시 전체 데이터 새로고침 (주석 해제하여 사용 가능)
      // refreshAll();
      
      return () => {
        // cleanup if needed
      };
    }, [processEvents])
  );
  
  // 사용자 상세 정보 가져오기 - Native SDK 사용
  useEffect(() => {
    if (user && user.uid) {
      const fetchUserDetails = async () => {
        try {
          const userDoc = await nativeDb.collection('users').doc(user.uid).get();
          if ((userDoc as any).exists) {
            setUserDetails(userDoc.data());
          }
        } catch (error) {
          console.error('사용자 정보 가져오기 오류:', error);
        }
      };
      
      fetchUserDetails();
    }
  }, [user]);
  
  const navigateToAdmin = () => {
    router.push('/admin' as any);
  };
  
  const handleLogout = async () => {
    Alert.alert(
      '로그아웃',
      '정말 로그아웃하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '로그아웃',
          onPress: async () => {
            setLoading(true);
            try {
              setTodayEvents([]);
              setUpcomingEvents([]);
              await logout();
              // 네비게이션은 AuthContext 상태 변화에 따라 자동 처리됨
            } catch (error) {
              console.error('로그아웃 오류:', error);
              Alert.alert('오류', '로그아웃 중 문제가 발생했습니다.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };
  
  const handleOpenProfileModal = () => {
    setProfileName(user?.displayName || '');
    setProfileModalVisible(true);
  };

  const handleUpdateProfile = async () => {
    if (!user) return;
    
    if (!profileName.trim()) {
      Alert.alert('오류', '이름을 입력해주세요.');
      return;
    }
    
    setUpdatingProfile(true);
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        throw new Error('사용자가 로그인되어 있지 않습니다.');
      }
      
      // React Native Firebase 방식으로 프로필 업데이트
      await currentUser.updateProfile({
        displayName: profileName
      });
      
      // Native SDK 사용
      await nativeDb.collection('users').doc(user.uid).update({
        displayName: profileName,
        updatedAt: new Date().toISOString()
      });
      
      Alert.alert('성공', '프로필이 업데이트되었습니다.');
      setProfileModalVisible(false);
    } catch (error) {
      console.error('프로필 업데이트 오류:', error);
      Alert.alert('오류', '프로필 업데이트 중 오류가 발생했습니다.');
    } finally {
      setUpdatingProfile(false);
    }
  };

const handleDeleteAccount = () => {
  Alert.alert(
    '회원 탈퇴',
    '정말 탈퇴하시겠습니까?\n모든 데이터가 삭제되며 복구할 수 없습니다.',
    [
      { text: '취소', style: 'cancel' },
      { 
        text: '탈퇴', 
        style: 'destructive',
        onPress: async () => {
          // 비밀번호 입력 부분 제거하고 바로 삭제 진행
          setUpdatingProfile(true);
          try {
            const result = await deleteAccount(); // ✅ 인자 없이 호출
            
            if (result.success) {
              Alert.alert('알림', '계정이 성공적으로 삭제되었습니다.');
              router.replace('/(auth)/login' as any);
            } else {
              Alert.alert('오류', result.error || '계정 삭제 중 오류가 발생했습니다.');
            }
          } catch (error: any) {
            console.error('계정 삭제 오류:', error);
            Alert.alert('오류', error.message || '계정 삭제 중 오류가 발생했습니다.');
          } finally {
            setUpdatingProfile(false);
          }
        }
      }
    ]
  );
};
  
  const handleNavigateToLogin = () => {
    router.push('/(auth)/login' as any);
  };
  
  // ✅ formatEventTime 함수 수정 - TypeScript 오류 해결
  const formatEventTime = (event: CalendarEvent) => {
    if (event.isMultiDay) {
      return '여러 날';
    }
    
    // startDate에서 시간 부분만 추출
    const timeMatch = event.startDate.match(/T(\d{2}:\d{2})/);
    if (timeMatch && timeMatch[1] !== '00:00') {
      return timeMatch[1];
    }
    
    return '종일';
  };
  
  const getGroupName = (event: CalendarEvent) => {
    const group = groups.find(g => g.id === event.groupId);
    return group ? group.name : '개인 일정';
  };
  
  const getGroupColor = (groupId: string | null) => {
    const group = groups.find(g => g.id === groupId);
    return group?.color || '#4A90E2';
  };
  
  // ✅ buildNumber 타입 수정
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const buildNumber = Platform.select({
    ios: Constants.expoConfig?.ios?.buildNumber?.toString(),
    android: Constants.expoConfig?.android?.versionCode?.toString()
  }) || '1';
  
  const userDisplayName = user?.displayName || userDetails?.displayName || user?.email?.split('@')[0] || '사용자';
  
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <UpdatePopup
        visible={updateInfo.visible}
        onClose={handleCloseUpdatePopup}
        versionInfo={updateInfo.versionInfo}
        isRequired={updateInfo.isRequired}
      />
      
      <View style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          <View style={styles.titleContainer}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>WE:IN</Text>
            <Text style={[styles.headerVersion, { color: colors.lightGray }]}>v{appVersion}.{buildNumber}</Text>
          </View>
          <View style={styles.profileContainer}>
            {isAdmin && (
              <TouchableOpacity 
                style={styles.adminIconContainer}
                onPress={navigateToAdmin}
              >
                <IconSymbol 
                  name="shield.lefthalf.filled" 
                  size={24} 
                  color={colors.tint} 
                />
              </TouchableOpacity>
            )}
            {user ? (
              <>
                <TouchableOpacity 
                  style={styles.avatarContainer}
                  onPress={handleOpenProfileModal}
                >
                  <View style={[styles.profileAvatar, { backgroundColor: colors.tint }]}>
                    <Text style={styles.avatarText}>
                      {userDisplayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.logoutButton, { backgroundColor: colors.secondary }]} 
                  onPress={handleLogout}
                >
                  <Text style={[styles.logoutButtonText, { color: colors.darkGray }]}>로그아웃</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.loginButton, { backgroundColor: colors.tint }]}
                onPress={handleNavigateToLogin}
              >
                <Text style={[styles.loginButtonText, { color: colors.buttonText }]}>로그인</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={styles.headerBottom}>
          <Text style={[styles.headerSubtitle, { color: colors.lightGray }]}>
            {user ? `안녕하세요, ${userDisplayName}님` : '공유 캘린더'}
          </Text>
        </View>
      </View>
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* ✅ cardBackground를 card로 수정 */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>오늘 일정</Text>
          <Text style={[styles.dateText, { color: colors.lightGray }]}>
            {formatDate(new Date(), 'M월 d일 EEEE')}
          </Text>
          
          {todayEvents.length > 0 ? (
            todayEvents.map((event) => (
              <TouchableOpacity
                key={event.id}
                style={[styles.eventCard, { backgroundColor: colors.background }]}
                onPress={() => router.push('/(tabs)/calendar' as any)}
              >
                <View style={[styles.eventColor, { backgroundColor: getGroupColor(event.groupId) }]} />
                <View style={styles.eventInfo}>
                  <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
                  <Text style={[styles.eventTime, { color: colors.darkGray }]}>
                    <Feather name="clock" size={12} /> {formatEventTime(event)}
                  </Text>
                  <Text style={[styles.eventGroup, { color: colors.lightGray }]}>
                    <Feather name="users" size={12} /> {getGroupName(event)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: colors.lightGray }]}>오늘 예정된 일정이 없습니다</Text>
          )}
        </View>
        
        {/* ✅ cardBackground를 card로 수정 */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>다가오는 일정</Text>
          
          {upcomingEvents.length > 0 ? (
            upcomingEvents.map((event) => (
              <TouchableOpacity
                key={event.id}
                style={[styles.eventCard, { backgroundColor: colors.background }]}
                onPress={() => router.push('/(tabs)/calendar' as any)}
              >
                <View style={[styles.eventColor, { backgroundColor: getGroupColor(event.groupId) }]} />
                <View style={styles.eventInfo}>
                  <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
                  <Text style={[styles.eventDate, { color: colors.darkGray }]}>
                    <Feather name="calendar" size={12} /> {formatDate(new Date(event.startDate), 'M월 d일')}
                  </Text>
                  <Text style={[styles.eventTime, { color: colors.darkGray }]}>
                    <Feather name="clock" size={12} /> {formatEventTime(event)}
                  </Text>
                  <Text style={[styles.eventGroup, { color: colors.lightGray }]}>
                    <Feather name="users" size={12} /> {getGroupName(event)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: colors.lightGray }]}>예정된 일정이 없습니다</Text>
          )}
        </View>
      </ScrollView>
      
      <Modal
        visible={profileModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>프로필 수정</Text>
            
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>이름</Text>
              <TextInput
                style={[styles.input, { 
                  backgroundColor: colors.inputBackground, 
                  borderColor: colors.inputBorder, 
                  color: colors.text 
                }]}
                value={profileName}
                onChangeText={setProfileName}
                placeholder="이름을 입력하세요"
                placeholderTextColor={colors.lightGray}
                maxLength={20}
                editable={!updatingProfile}
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
            
            <TouchableOpacity 
              style={styles.privacyPolicyContainer}
              onPress={() => {
                setProfileModalVisible(false);
                setPrivacyModalVisible(true);
              }}
            >
              <Text style={[styles.privacyPolicyText, { color: colors.tint }]}>
                개인정보처리방침
              </Text>
            </TouchableOpacity>
            
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
                onPress={() => {
                  setProfileModalVisible(false);
                  setPrivacyModalVisible(false);
                }}
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
      
      <PrivacyPolicyModal
        visible={privacyModalVisible}
        onClose={() => setPrivacyModalVisible(false)}
      />
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
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerVersion: {
    fontSize: 12,
    marginLeft: 8,
    fontStyle: 'italic',
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
  adminIconContainer: {
    marginRight: 12,
    padding: 4,
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
    paddingTop: 14,
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
  privacyPolicyContainer: {
    marginBottom: 20,
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  privacyPolicyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  loginButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  loginButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
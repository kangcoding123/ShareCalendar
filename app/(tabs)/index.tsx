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
  AppState  // ✅ 추가
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
import { getDoc, doc, updateDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db, auth } from '../../config/firebase';
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
  
  // ✅ 추가: 마지막 처리 날짜 저장
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
      lastProcessedDate.current = '';  // ✅ 추가
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
  
  // ✅ 수정: processEvents 함수에 중복 체크 추가
  const processEvents = useCallback(() => {
    if (!Array.isArray(events)) return;
    
    const now = new Date();
    const todayString = formatDate(now, 'yyyy-MM-dd');
    
    // ✅ 날짜가 같으면 스킵 (중복 실행 방지)
    if (lastProcessedDate.current === todayString && todayEvents.length > 0) {
      console.log('[HomeScreen] 같은 날짜 - 이벤트 처리 스킵');
      return;
    }
    
    console.log('[HomeScreen] 날짜 변경 감지 또는 초기 로드:', todayString);
    lastProcessedDate.current = todayString;
    
    // startDate 사용 (date 대신)
    const todayEvts = events.filter((event: CalendarEvent) => {
      const eventDate = event.startDate.split('T')[0];
      // 다일 일정인 경우 오늘이 기간에 포함되는지 확인
      if (event.isMultiDay) {
        const startDate = event.startDate.split('T')[0];
        const endDate = event.endDate.split('T')[0];
        return startDate <= todayString && endDate >= todayString;
      }
      return eventDate === todayString;
    });
    
    setTodayEvents(todayEvts);
    
    const upcoming = events.filter((event: CalendarEvent) => {
      const eventDate = event.startDate.split('T')[0];
      return eventDate > todayString;
    }).sort((a, b) => 
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
    
    setUpcomingEvents(upcoming.slice(0, 5));
  }, [events, todayEvents.length]);
  
  // ✅ 기존 useEffect 유지 (초기 로드 및 events 변경 시)
  useEffect(() => {
    processEvents();
  }, [events]);
  
  // ✅ 추가: 앱 활성화 감지
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        console.log('[HomeScreen] 앱 활성화 감지');
        const currentDate = formatDate(new Date(), 'yyyy-MM-dd');
        
        // 날짜가 변경되었거나 이벤트가 없으면 처리
        if (lastProcessedDate.current !== currentDate || todayEvents.length === 0) {
          processEvents();
        }
      }
    });
    
    return () => {
      subscription.remove();
    };
  }, [processEvents, todayEvents.length]);
  
  // ✅ 추가: 화면 포커스 감지
  useFocusEffect(
    useCallback(() => {
      console.log('[HomeScreen] 화면 포커스');
      const currentDate = formatDate(new Date(), 'yyyy-MM-dd');
      
      // 날짜가 변경되었거나 초기 로드면 처리
      if (lastProcessedDate.current !== currentDate || lastProcessedDate.current === '') {
        processEvents();
      }
      
      return () => {
        // cleanup if needed
      };
    }, [processEvents])
  );
  
  // 사용자 상세 정보 가져오기
  useEffect(() => {
    if (user && user.uid) {
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
              await logout();
              setTodayEvents([]);
              setUpcomingEvents([]);
              router.replace('/(auth)/login' as any);
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
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: profileName });
        
        await updateDoc(doc(db, 'users', user.uid), {
          displayName: profileName,
          updatedAt: new Date().toISOString()
        });
        
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

  const handleDeleteAccount = () => {
    Alert.alert(
      '회원 탈퇴',
      '정말로 회원 탈퇴하시겠습니까? 모든 개인정보와 일정이 삭제되며 이 작업은 되돌릴 수 없습니다.',
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

  // 새로고침 핸들러
  const handleRefresh = async () => {
    setLoading(true);
    await refreshAll();
    setLoading(false);
  };

  useEffect(() => {
    console.log(`[디버깅] Platform: ${Platform.OS}, isEmulator: ${__DEV__}, colorScheme: ${colorScheme}`);
  }, [colorScheme]);
  
  if (loading || authLoading) { 
    return (
      <SafeAreaView 
        style={[styles.container, { backgroundColor: colors.secondary }]}
        edges={['top', 'right', 'left', 'bottom']}
      >
        <ActivityIndicator size="large" color={colors.tint} />
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView 
      style={[styles.container, { backgroundColor: colors.secondary }]}
      edges={['top', 'right', 'left']}
    >
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          <View style={styles.titleContainer}>
            <Text style={[styles.headerTitle, { color: colors.tint }]}>WE:IN</Text>
            <Text style={[styles.headerVersion, { color: colors.lightGray }]}>
              v{Constants.expoConfig?.version || '1.0.0'}
            </Text>
          </View>
          
          {user ? (
            <View style={styles.profileContainer}>
              {isAdmin && (
                <TouchableOpacity 
                  onPress={navigateToAdmin}
                  style={styles.adminIconContainer}
                >
                  <Feather 
                    name="settings" 
                    size={22} 
                    color={colors.tint} 
                  />
                </TouchableOpacity>
              )}
              
              <TouchableOpacity onPress={handleOpenProfileModal} style={styles.avatarContainer}>
                <View style={[styles.profileAvatar, { backgroundColor: colors.tint }]}>
                  <Text style={styles.avatarText}>
                    {user.displayName ? user.displayName.charAt(0).toUpperCase() : '?'}
                  </Text>
                </View>
              </TouchableOpacity>
              
              <TouchableOpacity onPress={handleLogout} style={[styles.logoutButton, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.logoutButtonText, { color: colors.darkGray }]}>로그아웃</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              onPress={() => router.push('/(auth)/login' as any)} 
              style={[styles.loginButton, { backgroundColor: colors.tint }]}
            >
              <Text style={[styles.loginButtonText, { color: '#fff' }]}>로그인</Text>
            </TouchableOpacity>
          )}
        </View>
        
        <View style={styles.headerBottom}>
          <Text style={[styles.headerSubtitle, { color: colors.lightGray }]}>
            {user 
              ? `안녕하세요, ${user.displayName || '사용자'}님` 
              : '로그인하여 개인 일정을 관리하세요'}
          </Text>
        </View>
      </View>
      
      <ScrollView 
        style={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingBottom: 30
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.section, { backgroundColor: colors.card, shadowColor: colorScheme === 'dark' ? 'transparent' : '#000' }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>오늘 일정</Text>
          <Text style={[styles.dateText, { color: colors.lightGray }]}>{formatDate(new Date(), 'yyyy년 MM월 dd일 (eee)')}</Text>
          
          {todayEvents.length > 0 ? (
            todayEvents.map((calendarEvent: CalendarEvent) => {
              const group = groups.find(g => g.id === calendarEvent.groupId);
              return (
                <View key={calendarEvent.id} style={[styles.eventCard, { backgroundColor: colors.eventCardBackground }]}>
                  <View 
                    style={[
                      styles.eventColor, 
                      { backgroundColor: group?.color || calendarEvent.color || colors.tint }
                    ]} 
                  />
                  <View style={styles.eventInfo}>
                    <Text style={[styles.eventTitle, { color: colors.text }]}>{calendarEvent.title}</Text>
                    
                    {calendarEvent.time && (
                      <Text style={[styles.eventTime, { color: colors.lightGray }]}>
                        {calendarEvent.time}
                      </Text>
                    )}
                    
                    <Text style={[styles.eventGroup, { color: colors.darkGray }]}>
                      {group?.name || calendarEvent.groupName || '개인 일정'}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={[styles.emptyText, { color: colorScheme === 'dark' ? '#999' : '#999' }]}>오늘은 일정이 없습니다.</Text>
          )}
        </View>
        
        <View style={[styles.section, { backgroundColor: colors.card, shadowColor: colorScheme === 'dark' ? 'transparent' : '#000' }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>다가오는 일정</Text>
          
          {upcomingEvents.length > 0 ? (
            upcomingEvents.map((calendarEvent: CalendarEvent) => {
              const group = groups.find(g => g.id === calendarEvent.groupId);
              return (
                <View key={calendarEvent.id} style={[styles.eventCard, { backgroundColor: colors.eventCardBackground }]}>
                  <View 
                    style={[
                      styles.eventColor, 
                      { backgroundColor: group?.color || calendarEvent.color || colors.tint }
                    ]} 
                  />
                  <View style={styles.eventInfo}>
                    <Text style={[styles.eventTitle, { color: colors.text }]}>{calendarEvent.title}</Text>
                    <Text style={[styles.eventDate, { color: colors.lightGray }]}>
                      {formatDate(new Date(calendarEvent.startDate), 'MM월 dd일 (eee)')}
                      {calendarEvent.time && ` ${calendarEvent.time}`}
                    </Text>
                    <Text style={[styles.eventGroup, { color: colors.darkGray }]}>
                      {group?.name || calendarEvent.groupName || '개인 일정'}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={[styles.emptyText, { color: colorScheme === 'dark' ? '#999' : '#999' }]}>다가오는 일정이 없습니다.</Text>
          )}
        </View>

      </ScrollView>

      <UpdatePopup
        visible={updateInfo.visible}
        versionInfo={updateInfo.versionInfo}
        isRequired={updateInfo.isRequired}
        onClose={handleCloseUpdatePopup}
      />   

      {/* 프로필 모달 */}
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

// styles는 기존과 동일
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
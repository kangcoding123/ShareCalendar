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
  AppState,
  Linking,
  Pressable
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
import PrivacyPolicyModal from '@/components/PrivacyPolicyModal';
import { isCurrentUserAdmin } from '@/services/adminService';
import { IconSymbol } from '@/components/ui/IconSymbol';
import UpdatePopup from '@/components/UpdatePopup';
import { checkForUpdates } from '@/services/updateService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import ReviewRequestModal from '@/components/ReviewRequestModal';
import { initializeFirstLaunchDate, shouldShowReviewRequest } from '@/services/reviewService';
import { initializeAdMob } from '@/components/AdMobBanner';
import { logger } from '@/utils/logger';
import GroupSelectModal from '@/components/board/GroupSelectModal';
import { hasAnyUnreadPosts, getUnreadPostCounts, hasAnyUnreadComments, getUnreadCommentCountsByGroup } from '@/services/boardService';

export default function HomeScreen() {
  const router = useRouter();
  const { user, logout, deleteAccount, loading: authLoading } = useAuth();
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

  const [menuVisible, setMenuVisible] = useState(false);

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

  const [reviewModalVisible, setReviewModalVisible] = useState(false);

  // 회원탈퇴 비밀번호 입력 상태
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  // 게시판 그룹 선택 모달 상태
  const [boardModalVisible, setBoardModalVisible] = useState(false);

  // 게시판 알림 배지 상태
  const [hasUnreadPosts, setHasUnreadPosts] = useState(false);
  const [hasUnreadComments, setHasUnreadComments] = useState(false);
  const [unreadPostCounts, setUnreadPostCounts] = useState<{ [groupId: string]: number }>({});
  const [unreadCommentCounts, setUnreadCommentCounts] = useState<{ [groupId: string]: number }>({});

  // 게시판 새 게시글/댓글 확인
  const checkUnreadPosts = useCallback(async () => {
    if (!user?.uid || groups.length === 0) {
      setHasUnreadPosts(false);
      setHasUnreadComments(false);
      setUnreadPostCounts({});
      setUnreadCommentCounts({});
      return;
    }

    try {
      const groupIds = groups.map(g => g.id);
      const [hasUnreadPost, hasUnreadComment, postCounts, commentCounts] = await Promise.all([
        hasAnyUnreadPosts(user.uid, groupIds),
        hasAnyUnreadComments(user.uid, groupIds),
        getUnreadPostCounts(user.uid, groupIds),
        getUnreadCommentCountsByGroup(user.uid, groupIds)
      ]);
      setHasUnreadPosts(hasUnreadPost);
      setHasUnreadComments(hasUnreadComment);
      setUnreadPostCounts(postCounts);
      setUnreadCommentCounts(commentCounts);
    } catch (error) {
      logger.error('게시판 알림 배지 확인 오류:', error);
    }
  }, [user?.uid, groups]);

  // 게시판 실시간 리스너 - 새 게시글 감지 시 배지 업데이트
  useEffect(() => {
    if (!user?.uid || groups.length === 0) return;

    const groupIds = groups.map(g => g.id);
    if (groupIds.length === 0) return;

    // 각 그룹의 게시글을 실시간으로 감시
    const unsubscribes: (() => void)[] = [];

    groupIds.forEach(groupId => {
      const unsubscribe = nativeDb
        .collection('posts')
        .where('groupId', '==', groupId)
        .onSnapshot(
          () => {
            // 게시글 변경 감지 시 배지 상태 재확인
            checkUnreadPosts();
          },
          (error) => {
            logger.error('게시판 실시간 리스너 오류:', error);
          }
        );
      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [user?.uid, groups, checkUnreadPosts]);

  // 사용자 문서 변경 감지 리스너 (boardLastViewedAt, postLastViewedAt 업데이트 감지)
  useEffect(() => {
    if (!user?.uid) return;

    const unsubscribe = nativeDb
      .collection('users')
      .doc(user.uid)
      .onSnapshot(
        () => {
          // 사용자 문서 변경 시 배지 상태 재확인
          checkUnreadPosts();
        },
        (error) => {
          logger.error('사용자 문서 실시간 리스너 오류:', error);
        }
      );

    return () => unsubscribe();
  }, [user?.uid, checkUnreadPosts]);

  // 댓글 실시간 리스너 - 새 댓글 감지 시 배지 업데이트
  useEffect(() => {
    if (!user?.uid || groups.length === 0) return;

    // 전체 댓글 컬렉션을 감시 (본인 게시글의 댓글은 서비스에서 필터링)
    const unsubscribe = nativeDb
      .collection('comments')
      .onSnapshot(
        () => {
          // 댓글 변경 감지 시 배지 상태 재확인
          checkUnreadPosts();
        },
        (error) => {
          logger.error('댓글 실시간 리스너 오류:', error);
        }
      );

    return () => unsubscribe();
  }, [user?.uid, groups, checkUnreadPosts]);

  // 앱 시작 시 AdMob 미리 초기화 (캘린더 화면 진입 전 프리로드)
  useEffect(() => {
    if (!__DEV__) {
      initializeAdMob();
    }
  }, []);

  // 사용자 상태에 따른 데이터 초기화 처리
  useEffect(() => {
    if (!user) {
      logger.log('비로그인 상태 감지 - 홈 화면 데이터 초기화');
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
          logger.log('관리자 상태 확인:', adminStatus);
          setIsAdmin(adminStatus);
        } catch (error) {
          logger.error('관리자 상태 확인 오류:', error);
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
          logger.log('업데이트 체크 실패 (무시):', error);
        });
        
        await AsyncStorage.setItem('lastUpdateCheck', today);
      } catch (error) {
        logger.error('업데이트 체크 오류:', error);
      }
    };
    
    setTimeout(() => {
      checkForDailyUpdate();
    }, 1000);
  }, [user]);

  const handleCloseUpdatePopup = () => {
    setUpdateInfo(prev => ({ ...prev, visible: false }));
  };

  // 리뷰 요청 체크
  useEffect(() => {
    const checkReviewRequest = async () => {
      if (!user) return;

      // 첫 실행 날짜 초기화
      await initializeFirstLaunchDate();

      // 업데이트 팝업이 표시 중이면 리뷰 요청 스킵
      if (updateInfo.visible) return;

      // 리뷰 요청 조건 체크
      const shouldShow = await shouldShowReviewRequest();
      if (shouldShow) {
        // 약간의 딜레이 후 표시 (UX 개선)
        setTimeout(() => {
          setReviewModalVisible(true);
        }, 2000);
      }
    };

    checkReviewRequest();
  }, [user, updateInfo.visible]);

  // ✅ 수정된 processEvents 함수 - 실시간 반영을 위해 스킵 로직 제거
  const processEvents = useCallback(() => {
    if (!Array.isArray(events)) return;
    
    const now = new Date();
    const todayString = formatDate(now, 'yyyy-MM-dd');
    
    // 실시간 반영을 위해 스킵 로직 제거 - 항상 이벤트 재처리
    logger.log('[HomeScreen] 이벤트 처리 - 전체:', events.length, '개');
    lastProcessedDate.current = todayString;
    
    const todayEvts = events.filter((event: CalendarEvent) => {
      const eventDate = event.startDate.split('T')[0];
      // 다일일정 체크: isMultiDay 플래그 또는 startDate와 endDate가 다른 경우
      const startDateStr = event.startDate.split('T')[0];
      const endDateStr = event.endDate ? event.endDate.split('T')[0] : startDateStr;
      const isMultiDayEvent = event.isMultiDay || (startDateStr !== endDateStr);

      if (isMultiDayEvent) {
        const isInRange = startDateStr <= todayString && endDateStr >= todayString;
        return isInRange;
      }
      return eventDate === todayString;
    });
    
    logger.log('[HomeScreen] 오늘 이벤트:', todayEvts.length, '개');
    setTodayEvents(todayEvts);
    
    const upcoming = events.filter((event: CalendarEvent) => {
      const eventDate = event.startDate.split('T')[0];
      return eventDate > todayString;
    }).sort((a, b) => 
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
    
    logger.log('[HomeScreen] 예정된 이벤트:', upcoming.length, '개');
    setUpcomingEvents(upcoming.slice(0, 5));
  }, [events]); // ✅ todayEvents.length 의존성 제거
  
  // ✅ useEffect 수정 - processEvents 의존성 추가
  useEffect(() => {
    processEvents();
  }, [events, processEvents]);
  
  // AppState 이벤트 리스너 - 앱 활성화 시 날짜 변경 체크 및 광고 프리로드
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        logger.log('[HomeScreen] 앱 활성화 감지');

        // 앱이 포그라운드로 돌아올 때 광고 프리로드
        if (!__DEV__) {
          initializeAdMob();
        }

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
      logger.log('[HomeScreen] 화면 포커스 - 이벤트 재처리');

      // 화면 포커스 시 항상 이벤트 재처리
      processEvents();

      // 게시판 배지 상태 새로고침
      checkUnreadPosts();

      // 선택: 필요시 전체 데이터 새로고침 (주석 해제하여 사용 가능)
      // refreshAll();

      return () => {
        // cleanup if needed
      };
    }, [processEvents, checkUnreadPosts])
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
          logger.error('사용자 정보 가져오기 오류:', error);
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
              logger.error('로그아웃 오류:', error);
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
      logger.error('프로필 업데이트 오류:', error);
      Alert.alert('오류', '프로필 업데이트 중 오류가 발생했습니다.');
    } finally {
      setUpdatingProfile(false);
    }
  };

// 메뉴 핸들러 함수들
  const handleOpenWebsite = () => {
    setMenuVisible(false);
    Linking.openURL('https://sharecalendar-c8a9b.web.app/');
  };

  const handleReportBug = () => {
    setMenuVisible(false);
    const subject = encodeURIComponent('[WE:IN 버그신고]');
    const body = encodeURIComponent(`앱 버전: v${appVersion}\n\n[버그 내용을 작성해주세요]\n\n`);
    Linking.openURL(`mailto:gangseogju106@gmail.com?subject=${subject}&body=${body}`);
  };

  const handleOpenBlog = () => {
    setMenuVisible(false);
    Linking.openURL('https://blog.naver.com/sjkang912');
  };

  const handleMenuProfile = () => {
    setMenuVisible(false);
    handleOpenProfileModal();
  };

  const handleMenuLogout = () => {
    setMenuVisible(false);
    handleLogout();
  };

const handleDeleteAccount = () => {
  // 프로필 모달 먼저 닫기 (iOS 모달 충돌 방지)
  setProfileModalVisible(false);

  // 모달 닫힘 애니메이션 완료 후 Alert 표시
  setTimeout(() => {
    Alert.alert(
      '회원 탈퇴',
      '정말 탈퇴하시겠습니까?\n모든 데이터가 삭제되며 복구할 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴',
          style: 'destructive',
          onPress: () => {
            // 비밀번호 입력 모달 표시
            setDeletePassword('');
            setDeleteModalVisible(true);
          }
        }
      ]
    );
  }, 300);
};

const handleConfirmDeleteAccount = async () => {
  if (!deletePassword.trim()) {
    Alert.alert('오류', '비밀번호를 입력해주세요.');
    return;
  }

  setUpdatingProfile(true);
  try {
    // AuthContext의 deleteAccount는 성공 시 반환값 없이 완료, 실패 시 throw
    await deleteAccount(deletePassword);

    setDeleteModalVisible(false);
    setDeletePassword('');
    Alert.alert('알림', '계정이 성공적으로 삭제되었습니다.');
    router.replace('/(auth)/login' as any);
  } catch (error: any) {
    logger.error('계정 삭제 오류:', error);
    Alert.alert('오류', error.message || '계정 삭제 중 오류가 발생했습니다.');
  } finally {
    setUpdatingProfile(false);
  }
};
  
  const handleNavigateToLogin = () => {
    router.push('/(auth)/login' as any);
  };
  
  const formatEventTime = (event: CalendarEvent) => {
    // 다일일정: 시작일 ~ 종료일 표시
    if (event.isMultiDay && event.endDate) {
      const startDate = new Date(event.startDate);
      const endDate = new Date(event.endDate);
      const startStr = `${startDate.getMonth() + 1}/${startDate.getDate()}`;
      const endStr = `${endDate.getMonth() + 1}/${endDate.getDate()}`;
      return `${startStr} ~ ${endStr}`;
    }

    // 1. event.time 필드 확인 (별도 저장된 시간)
    if (event.time) {
      return event.time;
    }

    // 2. startDate에서 시간 부분 추출 (fallback)
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
  
  const getGroupColor = (groupId: string | null, event?: CalendarEvent) => {
    // 개인일정: 이벤트에 저장된 색상 사용
    if (groupId === 'personal' && event?.color) {
      return event.color;
    }
    // 그룹일정: 그룹 색상 사용
    const group = groups.find(g => g.id === groupId);
    return group?.color || event?.color || '#4A90E2';
  };
  
  // 앱 버전 및 출시 날짜
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const releaseDate = Constants.expoConfig?.extra?.releaseDate || '';
  
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <UpdatePopup
        visible={updateInfo.visible}
        onClose={handleCloseUpdatePopup}
        versionInfo={updateInfo.versionInfo}
        isRequired={updateInfo.isRequired}
      />

      <ReviewRequestModal
        visible={reviewModalVisible}
        onClose={() => setReviewModalVisible(false)}
      />

      <GroupSelectModal
        visible={boardModalVisible}
        onClose={() => setBoardModalVisible(false)}
        groups={groups}
        onSelectGroup={(groupId, groupName) => {
          setBoardModalVisible(false);
          router.push({
            pathname: '/(tabs)/board',
            params: { groupId, groupName }
          });
        }}
        colors={colors}
        unreadCounts={Object.fromEntries(
          groups.map(g => [
            g.id,
            (unreadPostCounts[g.id] || 0) + (unreadCommentCounts[g.id] || 0)
          ])
        )}
      />

      {/* 회원탈퇴 비밀번호 입력 모달 */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDeleteModalVisible(false);
          setDeletePassword('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>회원 탈퇴</Text>

            <Text style={[styles.deleteWarningText, { color: colors.lightGray }]}>
              보안을 위해 비밀번호를 입력해주세요.
            </Text>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>비밀번호</Text>
              <TextInput
                style={[styles.input, {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.inputBorder,
                  color: colors.text
                }]}
                value={deletePassword}
                onChangeText={setDeletePassword}
                placeholder="비밀번호를 입력하세요"
                placeholderTextColor={colors.lightGray}
                secureTextEntry
                editable={!updatingProfile}
              />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.cancelButton, { backgroundColor: colors.lightGray, flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' }]}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setDeletePassword('');
                }}
                disabled={updatingProfile}
              >
                <Text style={[styles.cancelButtonText, { color: colors.text }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteAccountButton, { backgroundColor: '#FF3B30', flex: 1 }]}
                onPress={handleConfirmDeleteAccount}
                disabled={updatingProfile}
              >
                {updatingProfile ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.deleteAccountButtonText}>탈퇴하기</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={[styles.header, { backgroundColor: colors.headerBackground, borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          <View style={styles.titleContainer}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>WE:IN</Text>
          </View>
          <View style={styles.headerRightContainer}>
            {user && groups.length > 0 && (
              <TouchableOpacity
                style={styles.boardButton}
                onPress={() => setBoardModalVisible(true)}
              >
                <Feather name="message-square" size={22} color={colors.text} />
                {(hasUnreadPosts || hasUnreadComments) && (
                  <View style={styles.unreadBadge} />
                )}
              </TouchableOpacity>
            )}
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
            {!user && (
              <TouchableOpacity
                style={[styles.loginButton, { backgroundColor: colors.tint }]}
                onPress={handleNavigateToLogin}
              >
                <Text style={[styles.loginButtonText, { color: colors.buttonText }]}>로그인</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => setMenuVisible(!menuVisible)}
            >
              <Feather name="menu" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.headerBottom}>
          <Text style={[styles.headerSubtitle, { color: colors.lightGray }]}>
            {user ? `안녕하세요, ${userDisplayName}님` : '공유 캘린더'}
          </Text>
        </View>
      </View>
      
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 100 : 20 }}
      >
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
                onPress={() => {
                  const eventDate = event.startDate.split('T')[0];
                  const endDate = event.endDate ? event.endDate.split('T')[0] : eventDate;
                  const highlightKey = Date.now().toString(); // 매번 고유한 키 생성
                  // 다일 일정인 경우 종료일도 전달
                  if (event.isMultiDay && eventDate !== endDate) {
                    router.push({
                      pathname: '/(tabs)/calendar',
                      params: { highlightDate: eventDate, highlightEndDate: endDate, highlightKey }
                    });
                  } else {
                    router.push({
                      pathname: '/(tabs)/calendar',
                      params: { highlightDate: eventDate, highlightKey }
                    });
                  }
                }}
              >
                <View style={[styles.eventColor, { backgroundColor: getGroupColor(event.groupId, event) }]} />
                <View style={styles.eventInfo}>
                  <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
                  <Text style={[styles.eventTime, { color: colors.darkGray }]}>
                    <Feather name="clock" size={12} /> {formatEventTime(event)}
                  </Text>
                  <Text style={[styles.eventGroup, { color: colors.lightGray }]}>
                    <Feather name={event.groupId === 'personal' ? 'user' : 'users'} size={12} /> {getGroupName(event)}
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
                onPress={() => {
                  const eventDate = event.startDate.split('T')[0];
                  const endDate = event.endDate ? event.endDate.split('T')[0] : eventDate;
                  const highlightKey = Date.now().toString(); // 매번 고유한 키 생성
                  // 다일 일정인 경우 종료일도 전달
                  if (event.isMultiDay && eventDate !== endDate) {
                    router.push({
                      pathname: '/(tabs)/calendar',
                      params: { highlightDate: eventDate, highlightEndDate: endDate, highlightKey }
                    });
                  } else {
                    router.push({
                      pathname: '/(tabs)/calendar',
                      params: { highlightDate: eventDate, highlightKey }
                    });
                  }
                }}
              >
                <View style={[styles.eventColor, { backgroundColor: getGroupColor(event.groupId, event) }]} />
                <View style={styles.eventInfo}>
                  <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
                  <Text style={[styles.eventDate, { color: colors.darkGray }]}>
                    <Feather name="calendar" size={12} /> {formatDate(new Date(event.startDate), 'M월 d일 (E)')}
                  </Text>
                  <Text style={[styles.eventTime, { color: colors.darkGray }]}>
                    <Feather name="clock" size={12} /> {formatEventTime(event)}
                  </Text>
                  <Text style={[styles.eventGroup, { color: colors.lightGray }]}>
                    <Feather name={event.groupId === 'personal' ? 'user' : 'users'} size={12} /> {getGroupName(event)}
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

      {/* 드롭다운 메뉴 - Modal로 구현하여 항상 최상단에 표시 */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={styles.menuModalOverlay}
          onPress={() => setMenuVisible(false)}
        >
          <View style={[styles.dropdownMenu, { backgroundColor: colors.background, borderColor: colors.border }]}>
            {user && (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={handleMenuProfile}>
                  <Feather name="user" size={18} color={colors.text} />
                  <Text style={[styles.menuItemText, { color: colors.text }]}>프로필</Text>
                </TouchableOpacity>
                <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity style={styles.menuItem} onPress={handleMenuLogout}>
                  <Feather name="log-out" size={18} color={colors.text} />
                  <Text style={[styles.menuItemText, { color: colors.text }]}>로그아웃</Text>
                </TouchableOpacity>
                <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
              </>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={handleOpenWebsite}>
              <Feather name="globe" size={18} color={colors.text} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>공식 홈페이지</Text>
            </TouchableOpacity>
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.menuItem} onPress={handleOpenBlog}>
              <Feather name="book-open" size={18} color={colors.text} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>개발자 이야기</Text>
            </TouchableOpacity>
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.menuItem} onPress={handleReportBug}>
              <Feather name="mail" size={18} color={colors.text} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>버그/오류 신고</Text>
            </TouchableOpacity>
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            <View style={styles.menuItem}>
              <Feather name="info" size={18} color={colors.lightGray} />
              <Text style={[styles.menuItemText, { color: colors.lightGray }]}>v{appVersion} ({releaseDate})</Text>
            </View>
          </View>
        </Pressable>
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
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuButton: {
    padding: 8,
    marginLeft: 8,
  },
  boardButton: {
    padding: 8,
    marginLeft: 4,
    position: 'relative',
  },
  unreadBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  menuModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 100,
    paddingRight: 15,
  },
  dropdownMenu: {
    width: 200,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontSize: 15,
    marginLeft: 12,
  },
  menuDivider: {
    height: 1,
    marginHorizontal: 12,
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
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#ff3b30',
    alignItems: 'center',
  },
  deleteAccountButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteWarningText: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 10,
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
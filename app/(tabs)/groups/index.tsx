// app/(tabs)/groups/index.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Platform,
  useWindowDimensions,
  Keyboard,
  KeyboardAvoidingView  // ✅ 이미 import 되어 있음
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../../context/AuthContext';
import { useEvents } from '../../../context/EventContext';
import { Group, createGroup, inviteToGroup } from '../../../services/groupService';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

// 그룹 항목 컴포넌트
interface GroupItemProps {
  group: Group;
  onPress: (group: Group) => void;
  onInvite?: (group: Group) => void;
  colors: any;
}

const GroupItem = ({ group, onPress, onInvite, colors }: GroupItemProps) => {
  const isOwner = typeof group.role === 'string' && group.role.toLowerCase() === 'owner';
  
  return (
    <TouchableOpacity 
      style={[styles.groupItem, {backgroundColor: colors.card}]} 
      onPress={() => onPress(group)}
    >
      <View style={styles.groupInfo}>
        <Text style={[styles.groupName, {color: colors.text}]}>{group.name}</Text>
        <Text style={[styles.groupDescription, {color: colors.lightGray}]}>{group.description || '설명 없음'}</Text>
        <View style={styles.groupMeta}>
          <Text style={[styles.groupMetaText, {color: colors.darkGray}]}>
            {group.memberCount || '?'}명의 멤버
          </Text>
          {isOwner && (
            <View style={[styles.ownerBadge, {backgroundColor: colors.tint + '20'}]}>
              <Text style={[styles.ownerBadgeText, {color: colors.tint}]}>관리자</Text>
            </View>
          )}
          
          {isOwner && onInvite && (
            <TouchableOpacity 
              style={[styles.quickInviteButton, {backgroundColor: colors.tint}]}
              onPress={(e) => {
                e.stopPropagation();
                onInvite(group);
              }}
            >
              <Text style={[styles.quickInviteText, {color: colors.buttonText}]}>초대하기</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.arrowContainer}>
        <Text style={[styles.arrow, {color: colors.lightGray}]}>{'>'}</Text>
      </View>
    </TouchableOpacity>
  );
};

// ✅ 수정된 CreateGroupModal 컴포넌트
interface CreateGroupModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (groupData: { name: string; description: string }) => void;
  loading: boolean;
  colors: any;
}

const CreateGroupModal = ({ visible, onClose, onSubmit, loading, colors }: CreateGroupModalProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ name?: string }>({});

  // 모달 닫힐 때 초기화
  useEffect(() => {
    if (!visible) {
      const timer = setTimeout(() => {
        setName('');
        setDescription('');
        setErrors({});
      }, 300);
      
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const handleSubmit = () => {
    const newErrors: { name?: string } = {};
    
    if (!name.trim()) {
      newErrors.name = '그룹 이름을 입력해주세요.';
    }
    
    setErrors(newErrors);
    
    if (Object.keys(newErrors).length === 0) {
      Keyboard.dismiss();
      onSubmit({
        name: name.trim(),
        description: description.trim()
      });
    }
  };

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      {/* ✅ View를 KeyboardAvoidingView로 변경 */}
      <KeyboardAvoidingView 
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.modalContent, {backgroundColor: colors.card}]}>
          <Text style={[styles.modalTitle, {color: colors.text}]}>새 그룹 생성</Text>
          
          <View style={styles.formGroup}>
            <Text style={[styles.label, {color: colors.text}]}>그룹 이름</Text>
            <TextInput
              style={[
                styles.input, 
                {backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text},
                errors.name && styles.inputError
              ]}
              placeholder="그룹 이름"
              placeholderTextColor={colors.lightGray}
              value={name}
              onChangeText={setName}
            />
            {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
          </View>
          
          <View style={styles.formGroup}>
            <Text style={[styles.label, {color: colors.text}]}>설명 (선택사항)</Text>
            <TextInput
              style={[
                styles.input, 
                styles.textArea, 
                {backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text}
              ]}
              placeholder="그룹에 대한 설명"
              placeholderTextColor={colors.lightGray}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
          
          <View style={styles.modalActions}>
            <TouchableOpacity 
              style={[styles.modalButton, styles.cancelButton, {backgroundColor: colors.secondary}]} 
              onPress={handleClose}
              disabled={loading}
            >
              <Text style={[styles.cancelButtonText, {color: colors.darkGray}]}>취소</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.modalButton, 
                {backgroundColor: colors.buttonBackground}, 
                loading && {backgroundColor: colors.disabledButton}
              ]} 
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.buttonText} />
              ) : (
                <Text style={[styles.submitButtonText, {color: colors.buttonText}]}>생성</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default function GroupListScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { groups, refreshGroups, resubscribeToEvents } = useEvents();
  
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const screenRatio = screenHeight / screenWidth;
  
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    console.log(`[디버깅] Platform: ${Platform.OS}, isEmulator: ${__DEV__}, colorScheme: ${colorScheme}`);
  }, [colorScheme]);

  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        const now = Date.now();
        if (now - lastRefreshRef.current < 1000) {
          return;
        }
        lastRefreshRef.current = now;
        
        console.log('그룹 목록 화면 포커스');
        refreshGroups();
      }
      return () => {};
    }, [user?.uid])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshGroups();
    setRefreshing(false);
  };

  const handleGroupPress = (group: Group) => {
    router.push(`/groups/${group.id}`);
  };
  
  const handleNavigateToLogin = () => {
    router.push('/(auth)/login');
  };
  
  const handleInvitePress = (group: Group) => {
    setSelectedGroup(group);
    setInviteModalVisible(true);
  };
  
  const handleInvite = async (email: string) => {
    console.log(`[handleInvite] 초대 시도. 이메일: ${email}, 선택된 그룹:`, selectedGroup);
    
    if (!selectedGroup) {
      console.error('[handleInvite] 선택된 그룹 없음');
      Alert.alert('오류', '그룹 정보가 없습니다.');
      return;
    }
    
    if (!email || !email.trim()) {
      Alert.alert('오류', '이메일을 입력해주세요.');
      return;
    }
    
    if (!/\S+@\S+\.\S+/.test(email)) {
      Alert.alert('오류', '유효한 이메일 형식이 아닙니다.');
      return;
    }
    
    try {
      setInviting(true);
      
      console.log(`[handleInvite] inviteToGroup 호출: groupId=${selectedGroup.id}, email=${email}`);
      const result = await inviteToGroup(selectedGroup.id, email);
      
      console.log('[handleInvite] 초대 결과:', result);
      
      if (result.success) {
        setInviteModalVisible(false);
        setInviteEmail('');
        Keyboard.dismiss();
        Alert.alert('성공', `${email} 님을 그룹에 초대했습니다.`);
        handleRefresh();
      } else {
        Alert.alert('초대 실패', result.error || '사용자 초대 중 오류가 발생했습니다.');
      }
    } catch (error) {
      console.error('[handleInvite] 초대 중 오류:', error);
      Alert.alert('오류', '사용자 초대 중 오류가 발생했습니다.');
    } finally {
      setInviting(false);
    }
  };

  const handleCreateGroup = async (groupData: { name: string; description: string }) => {
    try {
      setCreatingGroup(true);
      
      if (!user || !user.uid) return;
      
      const result = await createGroup({
        ...groupData,
        createdBy: user.uid,
        memberCount: 1
      } as Group);
      
      if (result.success) {
        setCreateModalVisible(false);
        await refreshGroups();
        // 그룹 생성 후 이벤트 리스너 재설정 (새 그룹 일정 실시간 동기화용)
        await resubscribeToEvents();
      } else {
        Alert.alert('오류', '그룹 생성 중 오류가 발생했습니다.');
      }
    } catch (error) {
      console.error('그룹 생성 중 오류:', error);
      Alert.alert('오류', '그룹 생성 중 오류가 발생했습니다.');
    } finally {
      setCreatingGroup(false);
    }
  };

  return (
    <SafeAreaView 
      style={[styles.container, {backgroundColor: colors.secondary}]}
      edges={['top', 'right', 'left']}
    >
      <View style={[styles.header, {backgroundColor: colors.headerBackground, borderBottomColor: colors.border}]}>
        <Text style={[styles.headerTitle, {color: colors.text}]}>내 그룹</Text>
      </View>
      
      {!user ? (
        <View style={styles.guestModeContainer}>
          <Text style={[styles.guestModeText, {color: colors.text}]}>
            그룹 기능을 사용하려면 로그인이 필요합니다.
          </Text>
          <Text style={[styles.guestModeSubText, {color: colors.lightGray}]}>
            로그인하여 그룹을 생성하고 팀원들과 일정을 공유해보세요.
          </Text>
          <TouchableOpacity
            style={[styles.guestLoginButton, {backgroundColor: colors.tint}]}
            onPress={handleNavigateToLogin}
          >
            <Text style={[styles.guestLoginButtonText, {color: colors.buttonText}]}>로그인하기</Text>
          </TouchableOpacity>
        </View>
      ) : groups.length === 0 && !refreshing ? (
        <View style={styles.emptyStateContainer}>
          <Text style={[styles.emptyStateTitle, {color: colors.text}]}>
            아직 속한 그룹이 없습니다
          </Text>
          <Text style={[styles.emptyStateText, {color: colors.lightGray}]}>
            새 그룹을 생성하거나{'\n'}초대 코드로 그룹에 가입해보세요
          </Text>
          
          <View style={styles.emptyStateActions}>
            <TouchableOpacity
              style={[styles.emptyActionButton, {backgroundColor: colors.tint}]}
              onPress={() => setCreateModalVisible(true)}
            >
              <Text style={[styles.emptyActionText, {color: colors.buttonText}]}>
                + 새 그룹 생성
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.emptyActionButton, 
                {
                  backgroundColor: colors.secondary,
                  borderWidth: 2,
                  borderColor: colors.tint
                }
              ]}
              onPress={() => router.push('/groups/join')}
            >
              <Text style={[styles.emptyActionText, {color: colors.tint}]}>
                초대 코드로 가입
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            data={groups}
            renderItem={({ item }) => (
              <GroupItem
                group={item}
                onPress={handleGroupPress}
                onInvite={handleInvitePress}
                colors={colors}
              />
            )}
            keyExtractor={(item) => item.id || ''}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.tint}
                colors={[colors.tint]}
              />
            }
          />

          {/* 하단 버튼 영역 - 스크롤 영역 바깥에 고정 */}
          <View style={[styles.bottomButtonContainer, { backgroundColor: colors.secondary }]}>
            <TouchableOpacity
              style={[
                styles.joinButtonFixed,
                {
                  backgroundColor: colors.secondary,
                  borderColor: colors.tint
                }
              ]}
              onPress={() => router.push('/groups/join')}
            >
              <Text style={[styles.joinButtonText, {color: colors.tint}]}>초대 코드로 가입</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.createButtonFixed,
                { backgroundColor: colors.buttonBackground }
              ]}
              onPress={() => {
                console.log("그룹 생성 버튼 클릭됨");
                setCreateModalVisible(true);
              }}
            >
              <Text style={[styles.createButtonText, {color: colors.buttonText}]}>+ 새 그룹 생성</Text>
            </TouchableOpacity>
          </View>
          
          {/* ✅ 초대 모달도 수정 */}
          <Modal
            visible={inviteModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => {
              setInviteModalVisible(false);
              setInviteEmail('');
              Keyboard.dismiss();
            }}
          >
            <KeyboardAvoidingView 
              style={styles.modalOverlay}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <View style={[styles.modalContent, {backgroundColor: colors.card}]}>
                <Text style={[styles.modalTitle, {color: colors.text}]}>
                  {selectedGroup?.name} 그룹에 멤버 초대
                </Text>
                
                <View style={styles.formGroup}>
                  <Text style={[styles.label, {color: colors.text}]}>초대할 사용자 이메일</Text>
                  <TextInput
                    style={[styles.input, {backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text}]}
                    placeholder="이메일 주소"
                    placeholderTextColor={colors.lightGray}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={inviteEmail}
                    onChangeText={setInviteEmail}
                    onSubmitEditing={() => handleInvite(inviteEmail)}
                  />
                </View>
                
                <View style={styles.modalActions}>
                  <TouchableOpacity 
                    style={[styles.modalButton, styles.cancelButton, {backgroundColor: colors.secondary}]} 
                    onPress={() => {
                      setInviteModalVisible(false);
                      setInviteEmail('');
                    }}
                    disabled={inviting}
                  >
                    <Text style={[styles.cancelButtonText, {color: colors.darkGray}]}>취소</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[
                      styles.modalButton, 
                      {backgroundColor: colors.buttonBackground}, 
                      inviting && {backgroundColor: colors.disabledButton}
                    ]} 
                    onPress={() => handleInvite(inviteEmail)}
                    disabled={inviting}
                  >
                    {inviting ? (
                      <ActivityIndicator size="small" color={colors.buttonText} />
                    ) : (
                      <Text style={[styles.submitButtonText, {color: colors.buttonText}]}>초대</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        </View>
      )}
      
      {/* CreateGroupModal */}
      {user && (
        <CreateGroupModal
          visible={createModalVisible}
          onClose={() => setCreateModalVisible(false)}
          onSubmit={handleCreateGroup}
          loading={creatingGroup}
          colors={colors}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  listContent: {
    padding: 15
  },
  groupItem: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  groupInfo: {
    flex: 1
  },
  groupName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5
  },
  groupDescription: {
    fontSize: 14,
    marginBottom: 10
  },
  groupMeta: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  groupMetaText: {
    fontSize: 12,
  },
  ownerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8
  },
  ownerBadgeText: {
    fontSize: 10,
    fontWeight: '500'
  },
  quickInviteButton: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 8
  },
  quickInviteText: {
    fontSize: 10,
    fontWeight: '500'
  },
  arrowContainer: {
    justifyContent: 'center'
  },
  arrow: {
    fontSize: 18,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  emptyStateActions: {
    gap: 12,
    width: '100%',
    maxWidth: 300,
  },
  emptyActionButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
  },
  emptyActionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  createButton: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 5
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: 'bold'
  },
  joinButton: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3
  },
  joinButtonText: {
    fontSize: 16,
    fontWeight: 'bold'
  },
  bottomButtonContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 100 : 20,
    gap: 10
  },
  joinButtonFixed: {
    borderRadius: 10,
    padding: 15,
    alignItems: 'center' as const,
    borderWidth: 2
  },
  createButtonFixed: {
    borderRadius: 10,
    padding: 15,
    alignItems: 'center' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 5
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: {
    borderRadius: 10,
    padding: 20,
    width: '100%',
    maxWidth: 500
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center'
  },
  formGroup: {
    marginBottom: 15
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  inputError: {
    borderColor: '#ff3b30'
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 12,
    marginTop: 5
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top'
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  cancelButton: {
    marginRight: 10
  },
  cancelButtonText: {
    fontWeight: '600'
  },
  submitButtonText: {
    fontWeight: '600'
  },
  guestModeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  guestModeText: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10
  },
  guestModeSubText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 30,
    paddingHorizontal: 20
  },
  guestLoginButton: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
    marginTop: 10
  },
  guestLoginButtonText: {
    fontSize: 16,
    fontWeight: '600'
  }
});
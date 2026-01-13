// app/(tabs)/groups/[id].tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
  Share,
  useWindowDimensions,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../context/AuthContext';
import { useEvents } from '../../../context/EventContext';
import { 
  Group, 
  GroupMember, 
  getGroupById, 
  getGroupMembers, 
  updateGroup, 
  deleteGroup, 
  inviteToGroup,
  setUserGroupColor,
  leaveGroup,
  removeMemberFromGroup,
  getBannedMembers, 
  unbanMember,
  transferOwnership
} from '../../../services/groupService';
import { 
  generateInviteForGroup, 
  createInviteMessage 
} from '../../../services/inviteService';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
// 🔥 추가: 메모리 색상 업데이트 함수 import
import { updateGroupColorInMemory } from '../../../services/calendarService';
import { nativeDb } from '../../../config/firebase';

// 색상 선택 옵션 (빨주노초파남보 + 검정)
const COLOR_OPTIONS = [
  { name: '빨간색', value: '#FF0000' },
  { name: '주황색', value: '#FF8C00' },
  { name: '노란색', value: '#FFD700' },
  { name: '초록색', value: '#4CAF50' },
  { name: '파란색', value: '#0066FF' },
  { name: '남색', value: '#000080' },
  { name: '보라색', value: '#8A2BE2' },
  { name: '검정색', value: '#333333' }
];

interface MemberItemProps {
  member: GroupMember;
  isCurrentUser: boolean;
  colors: any;
  isOwner: boolean;
  onRemove?: (member: GroupMember) => void;
  onTransfer?: (member: GroupMember) => void;
}

const MemberItem = ({ member, isCurrentUser, colors, isOwner, onRemove, onTransfer }: MemberItemProps) => {
  return (
    <View style={[styles.memberItem, { backgroundColor: colors.card }]}>
      <View style={styles.memberInfo}>
        <Text style={[styles.memberName, { color: colors.text }]}>
          {member.displayName}
          {isCurrentUser && <Text style={[styles.currentUser, { color: colors.lightGray }]}> (나)</Text>}
        </Text>
        <Text style={[styles.memberEmail, { color: colors.lightGray }]}>{member.email}</Text>
      </View>
      
      <View style={styles.memberActions}>
        <View style={[styles.memberRole, { backgroundColor: colors.secondary }]}>
          <Text style={[
            styles.roleText,
            member.role === 'owner' ? 
              [styles.ownerRoleText, { color: colors.tint }] : 
              [styles.memberRoleText, { color: colors.darkGray }]
          ]}>
            {member.role === 'owner' ? '관리자' : '멤버'}
          </Text>
        </View>
        
        {isOwner && !isCurrentUser && member.role !== 'owner' && onTransfer && (
          <TouchableOpacity
            style={[styles.transferMemberButton, { backgroundColor: colors.tint }]}
            onPress={() => onTransfer(member)}
          >
            <Text style={styles.transferMemberButtonText}>위임</Text>
          </TouchableOpacity>
        )}
        
        {isOwner && !isCurrentUser && member.role !== 'owner' && onRemove && (
          <TouchableOpacity
            style={[styles.removeButton, { backgroundColor: colors.danger }]}
            onPress={() => onRemove(member)}
          >
            <Text style={styles.removeButtonText}>강퇴</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// 초대 모달
interface InviteModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (email: string) => void;
  loading: boolean;
  colors: any;
}

const InviteModal = ({ visible, onClose, onSubmit, loading, colors }: InviteModalProps) => {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ email?: string }>({});

  useEffect(() => {
    if (!visible) {
      setEmail('');
      setErrors({});
    }
  }, [visible]);

  const validate = () => {
    const newErrors: { email?: string } = {};
    
    if (!email) {
      newErrors.email = '이메일을 입력해주세요.';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = '올바른 이메일 형식이 아닙니다.';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onSubmit(email.trim());
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>이메일로 초대하기</Text>
          
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.text }]}>초대할 사용자 로그인 이메일</Text>
            <TextInput
              style={[
                styles.input, 
                { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text },
                errors.email && styles.inputError
              ]}
              placeholder="이메일 주소"
              placeholderTextColor={colors.lightGray}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
          </View>
          
          <View style={styles.modalActions}>
            <TouchableOpacity 
              style={[styles.modalButton, styles.cancelButton, { backgroundColor: colors.secondary }]} 
              onPress={onClose}
              disabled={loading}
            >
              <Text style={[styles.cancelButtonText, { color: colors.darkGray }]}>취소</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.modalButton, 
                { backgroundColor: colors.buttonBackground }, 
                loading && { backgroundColor: colors.disabledButton }
              ]} 
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.buttonText} />
              ) : (
                <Text style={[styles.submitButtonText, { color: colors.buttonText }]}>초대</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// 그룹 편집 모달
interface EditGroupModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (groupData: { name: string; description: string }) => void;
  loading: boolean;
  group: Group | null;
  colors: any;
}

const EditGroupModal = ({ visible, onClose, onSubmit, loading, group, colors }: EditGroupModalProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ name?: string }>({});

  useEffect(() => {
    if (visible && group) {
      setName(group.name || '');
      setDescription(group.description || '');
    }
  }, [visible, group]);

  const validate = () => {
    const newErrors: { name?: string } = {};
    
    if (!name.trim()) {
      newErrors.name = '그룹 이름을 입력해주세요.';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    
    onSubmit({
      name: name.trim(),
      description: description.trim()
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>그룹 정보 편집</Text>
          
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.text }]}>그룹 이름</Text>
            <TextInput
              style={[
                styles.input, 
                { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text },
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
            <Text style={[styles.label, { color: colors.text }]}>설명 (선택사항)</Text>
            <TextInput
              style={[
                styles.input, 
                styles.textArea,
                { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }
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
              style={[styles.modalButton, styles.cancelButton, { backgroundColor: colors.secondary }]} 
              onPress={onClose}
              disabled={loading}
            >
              <Text style={[styles.cancelButtonText, { color: colors.darkGray }]}>취소</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.modalButton, 
                { backgroundColor: colors.buttonBackground }, 
                loading && { backgroundColor: colors.disabledButton }
              ]} 
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.buttonText} />
              ) : (
                <Text style={[styles.submitButtonText, { color: colors.buttonText }]}>저장</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default function GroupDetailScreen() {
  const { user } = useAuth();
  const { updateGroupColor } = useEvents();
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const groupId = Array.isArray(id) ? id[0] : id;
  
  // 색상 테마 설정
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  
  // 🔴 화면 크기 계산 추가
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const screenRatio = screenHeight / screenWidth;
  
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);
  const [removingMember, setRemovingMember] = useState(false); 
  const [bannedMembers, setBannedMembers] = useState<any[]>([]);  
  const [showBannedList, setShowBannedList] = useState(false);    
  const [unbanning, setUnbanning] = useState(false);              
  
  // 색상 선택 관련 상태
  const [selectedColor, setSelectedColor] = useState<string>('#4CAF50');
  const [savingColor, setSavingColor] = useState(false);

  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [generatingInvite, setGeneratingInvite] = useState(false);

  const [transferring, setTransferring] = useState(false);

  // 관리자 권한 확인
  const isOwner = typeof group?.role === 'string' && 
                 group.role.toLowerCase() === 'owner';
  
  // 🔥 수정된 색상 변경 핸들러 - 즉시 반영
  const handleColorChange = async (color: string) => {
    if (!user || !groupId) return;
    
    try {
      setSavingColor(true);
      setSelectedColor(color);
      
      console.log(`그룹 색상 변경: ${color}`);
      
      // 🔥 먼저 로컬 상태 업데이트
      if (group) {
        setGroup({ ...group, color });
      }
      
      // 🔥 캘린더의 메모리 색상 즉시 업데이트
      updateGroupColorInMemory(groupId, color);

      // 🔥 EventContext의 그룹 색상도 즉시 업데이트 (캘린더 그룹 선택 UI 반영)
      updateGroupColor(groupId, color);

      // 🔥 서버에 저장
      const result = await setUserGroupColor(user.uid, groupId, color);

      if (result.success) {
        console.log(`그룹 색상 변경 성공: ${color}`);
      } else {
        // 실패 시 롤백
        Alert.alert('오류', '색상 변경 중 오류가 발생했습니다.');
        setSelectedColor(group?.color || '#4CAF50');
        if (group) {
          setGroup({ ...group, color: group.color || '#4CAF50' });
          // 🔥 메모리 색상도 롤백
          updateGroupColorInMemory(groupId, group.color || '#4CAF50');
          updateGroupColor(groupId, group.color || '#4CAF50');
        }
      }
    } catch (error) {
      console.error('색상 변경 오류:', error);
      Alert.alert('오류', '색상 변경 중 오류가 발생했습니다.');
      // 에러 시 롤백
      setSelectedColor(group?.color || '#4CAF50');
      if (group) {
        setGroup({ ...group, color: group.color || '#4CAF50' });
        updateGroupColorInMemory(groupId, group.color || '#4CAF50');
        updateGroupColor(groupId, group.color || '#4CAF50');
      }
    } finally {
      setSavingColor(false);
    }
  };

  // 초대 코드 생성 핸들러
  const handleGenerateInviteCode = async () => {
    if (!groupId) return;
    
    try {
      setGeneratingInvite(true);
      const result = await generateInviteForGroup(groupId);
      
      if (result.success && result.inviteCode) {
        setInviteCode(result.inviteCode);
        Alert.alert('성공', '초대 코드가 생성되었습니다.');
      } else {
        Alert.alert('오류', result.error || '초대 코드 생성에 실패했습니다.');
      }
    } catch (error) {
      console.error('초대 코드 생성 오류:', error);
      Alert.alert('오류', '초대 코드 생성 중 오류가 발생했습니다.');
    } finally {
      setGeneratingInvite(false);
    }
  };

  // 초대 코드 공유 핸들러
  const handleShareInviteCode = async () => {
    if (!group || !inviteCode) return;
    
    try {
      const message = createInviteMessage(
        group.name,
        inviteCode,
        `weincalendar://invite/${inviteCode}`
      );
      
      await Share.share({
        message: message,
        title: `${group.name} 그룹 초대`
      });
    } catch (error) {
      console.error('공유 오류:', error);
    }
  };  

  // 권한 위임 핸들러
  const handleTransferOwnership = (member: GroupMember) => {
    Alert.alert(
      '관리자 권한 위임',
      `${member.displayName}님에게 관리자 권한을 위임하시겠습니까?`,
      [
        { text: '아니오', style: 'cancel' },
        {
          text: '네',
          style: 'destructive',
          onPress: async () => {
            if (!user || !groupId) return;
            
            try {
              setTransferring(true);
              
              const result = await transferOwnership(
                groupId,
                user.uid,
                member.userId
              );
              
              if (result.success) {
                Alert.alert('성공', '관리자 권한이 위임되었습니다.', [
                  {
                    text: '확인',
                    onPress: () => {
                      loadGroupData();
                    }
                  }
                ]);
              } else {
                Alert.alert('오류', result.error || '권한 위임 중 오류가 발생했습니다.');
              }
            } catch (error) {
              console.error('권한 위임 오류:', error);
              Alert.alert('오류', '권한 위임 중 오류가 발생했습니다.');
            } finally {
              setTransferring(false);
            }
          }
        }
      ]
    );
  };
  
  // 그룹 탈퇴 핸들러
  const handleLeaveGroup = () => {
    Alert.alert(
      '그룹 탈퇴',
      '정말로 이 그룹에서 탈퇴하시겠습니까? 탈퇴 후에는 이 그룹의 일정을 볼 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴',
          style: 'destructive',
          onPress: async () => {
            try {
              setLeavingGroup(true);
              
              if (!groupId || !user?.uid) {
                console.error('그룹 ID 또는 사용자 ID가 없습니다.');
                setLeavingGroup(false);
                return;
              }
              
              const result = await leaveGroup(groupId, user.uid);
              
              if (result.success) {
                setLeavingGroup(false);
                
                Alert.alert('성공', '그룹에서 탈퇴했습니다.', [
                  { 
                    text: '확인', 
                    onPress: () => {
                      router.push('/(tabs)/groups');
                    } 
                  }
                ]);
              } else {
                Alert.alert('오류', result.error || '그룹 탈퇴 중 오류가 발생했습니다.');
                setLeavingGroup(false);
              }
            } catch (error) {
              console.error('그룹 탈퇴 중 오류:', error);
              Alert.alert('오류', '그룹 탈퇴 중 오류가 발생했습니다.');
              setLeavingGroup(false);
            }
          }
        }
      ]
    );
  };

  // 멤버 강퇴 핸들러
  const handleRemoveMember = (member: GroupMember) => {
    Alert.alert(
      '멤버 강퇴',
      `정말로 ${member.displayName}님을 그룹에서 강퇴하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '강퇴',
          style: 'destructive',
          onPress: async () => {
            try {
              setRemovingMember(true);
              
              if (!groupId || !user?.uid) {
                console.error('그룹 ID 또는 사용자 ID가 없습니다.');
                setRemovingMember(false);
                return;
              }
              
              const result = await removeMemberFromGroup(groupId, member.userId, user.uid);
              
              if (result.success) {
                Alert.alert('성공', '멤버가 강퇴되었습니다.');
                loadGroupData();
                loadBannedMembers();
              } else {
                Alert.alert('오류', result.error || '멤버 강퇴 중 오류가 발생했습니다.');
              }
            } catch (error) {
              console.error('멤버 강퇴 중 오류:', error);
              Alert.alert('오류', '멤버 강퇴 중 오류가 발생했습니다.');
            } finally {
              setRemovingMember(false);
            }
          }
        }
      ]
    );
  };

  // 차단 해제 핸들러
  const handleUnbanMember = (bannedMember: any) => {
    Alert.alert(
      '차단 해제',
      `${bannedMember.email}님의 차단을 해제하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '해제',
          style: 'default',
          onPress: async () => {
            try {
              setUnbanning(true);
              
              const result = await unbanMember(groupId, bannedMember.userId);
              
              if (result.success) {
                Alert.alert('성공', '차단이 해제되었습니다.');
                loadBannedMembers();
              } else {
                Alert.alert('오류', result.error || '차단 해제 중 오류가 발생했습니다.');
              }
            } catch (error) {
              console.error('차단 해제 오류:', error);
              Alert.alert('오류', '차단 해제 중 오류가 발생했습니다.');
            } finally {
              setUnbanning(false);
            }
          }
        }
      ]
    );
  };
  
  // 그룹 및 멤버 데이터 로드
  const loadGroupData = async () => {
    try {
      if (refreshing) return;
      
      console.log('[loadGroupData] 그룹 데이터 로드 시작. 그룹 ID:', groupId);
      setLoading(true);
      
      if (!groupId) return;
      
      const groupResult = await getGroupById(groupId);
      if (groupResult.success && groupResult.group) {
        const groupData = groupResult.group as Group;
        console.log('[loadGroupData] 그룹 정보 로드 성공:', groupData.name);
        
        if (groupData.inviteCode) {
          setInviteCode(groupData.inviteCode);
        }
        
        const membersResult = await getGroupMembers(groupId);
        
        if (membersResult.success && membersResult.members) {
          const members = membersResult.members as GroupMember[];
          console.log('[loadGroupData] 멤버 수:', members.length);
          setMembers(members);
          
          console.log('[loadGroupData] 멤버 이메일 목록:', 
            members.map(m => ({ name: m.displayName, email: m.email })));
          
          const currentUserMember = members.find(m => m.userId === user?.uid);
          
          if (currentUserMember) {
            const updatedGroup = {
              ...groupData,
              role: currentUserMember.role,
              color: currentUserMember.color || '#4CAF50'
            };
            console.log('[loadGroupData] 역할 설정됨:', updatedGroup.role);
            console.log('[loadGroupData] 색상 설정됨:', updatedGroup.color);
            
            setGroup(updatedGroup);
            setSelectedColor(currentUserMember.color || '#4CAF50');
          } else {
            console.log('[loadGroupData] 사용자의 멤버 정보 없음, 기본 데이터 사용');
            setGroup(groupData);
          }
        } else {
          console.error('[loadGroupData] 멤버 목록 로드 실패:', membersResult.error);
          setGroup(groupData);
          Alert.alert('오류', '멤버 목록을 불러오는 중 오류가 발생했습니다.');
        }
      } else {
        console.error('[loadGroupData] 그룹 정보 로드 실패:', groupResult.error);
        Alert.alert('오류', '그룹 정보를 불러오는 중 오류가 발생했습니다.');
        router.back();
        return;
      }
    } catch (error) {
      console.error('[loadGroupData] 그룹 데이터 로드 중 오류:', error);
      Alert.alert('오류', '그룹 정보를 불러오는 중 오류가 발생했습니다.');
      router.back();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // 차단된 멤버 목록 로드
  const loadBannedMembers = async () => {
    if (!groupId || !isOwner) return;
    
    try {
      const result = await getBannedMembers(groupId);
      if (result.success && result.bannedMembers) {
        setBannedMembers(result.bannedMembers);
      }
    } catch (error) {
      console.error('차단 목록 로드 오류:', error);
    }
  };

  useEffect(() => {
    if (isOwner && groupId) {
      loadBannedMembers();
    }
  }, [isOwner, groupId]);

  useEffect(() => {
    if (!user || !groupId) return;

    // 초기 데이터 로드
    loadGroupData();

    // 그룹 멤버 변경 실시간 감지
    const unsubscribe = nativeDb
      .collection('groupMembers')
      .where('groupId', '==', groupId)
      .onSnapshot(
        (snapshot) => {
          // 로컬 변경이 아닌 서버 변경 시에만 새로고침
          if (!snapshot.metadata.hasPendingWrites && !snapshot.metadata.fromCache) {
            console.log('[Group Detail] 멤버 데이터 변경 감지, 새로고침');
            loadGroupData();
          }
        },
        (error: any) => {
          // 로그아웃/탈퇴 시 발생하는 권한 오류는 무시
          if (error?.code !== 'firestore/permission-denied') {
            console.error('[Group Detail] 멤버 리스너 오류:', error);
          }
        }
      );

    // 클린업
    return () => unsubscribe();
  }, [user, groupId]);

  // 초대 처리
  const handleInvite = async (email: string) => {
    try {
      console.log(`[handleInvite] 사용자 초대 시작: ${email}`);
      setInviting(true);
      
      if (!groupId) {
        console.error('[handleInvite] 그룹 ID가 없음');
        return;
      }
      
      const result = await inviteToGroup(groupId, email);
      
      if (result.success) {
        console.log(`[handleInvite] 초대 성공: ${email}`);
        setInviteModalVisible(false);
        
        Alert.alert('성공', '초대가 완료되었습니다.');
        
        setRefreshing(true);
        setTimeout(() => {
          console.log('[handleInvite] 데이터 새로고침 시작');
          loadGroupData();
        }, 500);
      } else {
        console.error(`[handleInvite] 초대 실패:`, result.error);
        Alert.alert('초대 실패', result.error || '사용자 초대 중 오류가 발생했습니다.');
      }
    } catch (error) {
      console.error('[handleInvite] 초대 중 오류:', error);
      Alert.alert('오류', '사용자 초대 중 오류가 발생했습니다.');
    } finally {
      setInviting(false);
    }
  };

  // 그룹 정보 업데이트
  const handleUpdateGroup = async (groupData: { name: string; description: string }) => {
    try {
      setEditing(true);
      
      if (!groupId) return;
      
      const result = await updateGroup(groupId, groupData);
      
      if (result.success) {
        setEditModalVisible(false);
        if (group) {
          setGroup({ ...group, ...groupData });
        }
        Alert.alert('성공', '그룹 정보가 업데이트되었습니다.');
      } else {
        Alert.alert('오류', '그룹 정보 업데이트 중 오류가 발생했습니다.');
      }
    } catch (error) {
      console.error('그룹 업데이트 중 오류:', error);
      Alert.alert('오류', '그룹 정보 업데이트 중 오류가 발생했습니다.');
    } finally {
      setEditing(false);
    }
  };

  // 그룹 삭제
  const handleDeleteGroup = () => {
    Alert.alert(
      '그룹 삭제',
      '정말로 이 그룹을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              
              if (!groupId) {
                console.error('그룹 ID가 없습니다.');
                setDeleting(false);
                return;
              }
              
              console.log('그룹 삭제 시작:', groupId);
              const result = await deleteGroup(groupId);
              
              if (result.success) {
                console.log('그룹 삭제 성공');
                setDeleting(false);
                
                Alert.alert('성공', '그룹이 삭제되었습니다.', [
                  { 
                    text: '확인', 
                    onPress: () => {
                      console.log('그룹 목록으로 이동');
                      router.push('/(tabs)/groups');
                    } 
                  }
                ]);
              } else {
                console.error('그룹 삭제 실패:', result.error);
                Alert.alert('오류', '그룹 삭제 중 오류가 발생했습니다.');
                setDeleting(false);
              }
            } catch (error) {
              console.error('그룹 삭제 중 오류:', error);
              Alert.alert('오류', '그룹 삭제 중 오류가 발생했습니다.');
              setDeleting(false);
            }
          }
        }
      ]
    );
  };

  // 수동 새로고침
  const handleRefresh = () => {
    setRefreshing(true);
    loadGroupData();
  };

  // 각 색상 옵션에 대한 스타일 객체 미리 생성
  const getColorOptionStyles = (colorValue: string) => {
    return [
      styles.colorOption,
      { backgroundColor: colorValue },
      selectedColor === colorValue && styles.selectedColorOption
    ];
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.secondary }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView 
      style={[styles.container, { backgroundColor: colors.secondary }]}
      edges={['top', 'right', 'left']}  // 🔴 bottom 제외
    >
      <View style={[styles.header, { 
        backgroundColor: colors.headerBackground, 
        borderBottomColor: colors.border 
      }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.push('/(tabs)/groups')}
        >
          <Text style={[styles.backButtonText, { color: colors.tint }]}>{'<'} 뒤로</Text>
        </TouchableOpacity>
        
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {group?.name}
        </Text>

        {!isOwner ? (
          <TouchableOpacity
            style={styles.leaveHeaderButton}
            onPress={handleLeaveGroup}
            disabled={leavingGroup}
          >
            <Text style={styles.leaveHeaderButtonText}>탈퇴</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setEditModalVisible(true)}
          >
            <Text style={[styles.editButtonText, { color: colors.tint }]}>편집</Text>
          </TouchableOpacity>
        )}
      </View>
      
      <ScrollView 
        style={styles.content}
        contentInsetAdjustmentBehavior="never"  // 🔴 추가
        contentContainerStyle={{
          paddingBottom: Platform.OS === 'ios' ? 100 : 10
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.tint]}
            tintColor={colors.tint}
          />
        }
      >
        {refreshing && (
          <View style={styles.refreshIndicator}>
            <ActivityIndicator size="small" color={colors.tint} />
          </View>
        )}
        
        <View style={styles.groupInfoSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>그룹 정보</Text>
          
          <View style={[styles.infoCard, { 
            backgroundColor: colors.card,
            shadowColor: colorScheme === 'dark' ? 'transparent' : '#000'
          }]}>
            <Text style={[styles.infoLabel, { color: colors.lightGray }]}>그룹 이름</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{group?.name}</Text>
            
            <Text style={[styles.infoLabel, { color: colors.lightGray }]}>설명</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {group?.description || '설명이 없습니다.'}
            </Text>
            
            <Text style={[styles.infoLabel, { color: colors.lightGray }]}>멤버</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{members.length}명</Text>
            
            <Text style={[styles.infoLabel, { color: colors.lightGray }]}>내 역할</Text>
            <Text style={[
              styles.infoValue,
              isOwner ? [styles.ownerRoleText, { color: colors.tint }] : [styles.memberRoleText, { color: colors.darkGray }]
            ]}>
              {isOwner ? '관리자' : '멤버'}
            </Text>
            
            <Text style={[styles.infoLabel, { color: colors.lightGray }]}>그룹 색상 (캘린더에 표시될 색상)</Text>
            <View style={styles.colorOptions}>
              {COLOR_OPTIONS.map(color => (
                <TouchableOpacity
                  key={color.value}
                  style={getColorOptionStyles(color.value)}
                  onPress={() => handleColorChange(color.value)}
                  disabled={savingColor}
                >
                  {selectedColor === color.value && (
                    <Text style={styles.colorSelectedIcon}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            
            {savingColor && (
              <Text style={[styles.savingText, { color: colors.lightGray }]}>색상 저장 중...</Text>
            )}

            {isOwner && (
              <>
                <View style={styles.divider} />
                <Text style={[styles.infoLabel, { color: colors.lightGray }]}>초대 코드</Text>
                
                {inviteCode ? (
                  <View style={styles.inviteCodeContainer}>
                    <Text style={[styles.inviteCode, { color: colors.tint }]}>{inviteCode}</Text>
                    <TouchableOpacity
                      style={[styles.shareButton, { backgroundColor: colors.tint }]}
                      onPress={handleShareInviteCode}
                    >
                      <Text style={[styles.shareButtonText, { color: colors.buttonText }]}>초대 코드로 초대하기</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.generateButton, { backgroundColor: colors.secondary }]}
                    onPress={handleGenerateInviteCode}
                    disabled={generatingInvite}
                  >
                    {generatingInvite ? (
                      <ActivityIndicator size="small" color={colors.tint} />
                    ) : (
                      <Text style={[styles.generateButtonText, { color: colors.tint }]}>초대 코드 생성</Text>
                    )}
                  </TouchableOpacity>
                )}
                
                <Text style={[styles.inviteHelp, { color: colors.lightGray }]}>
                  초대 코드를 공유하면 다른 사람이 쉽게 그룹에 참여할 수 있습니다.
                </Text>
              </>
            )}
          </View>
        </View>
        
        <View style={styles.membersSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>멤버 목록</Text>
            
            <View style={styles.sectionHeaderRight}>
              {isOwner && (
                <TouchableOpacity
                  style={[styles.inviteButton, { backgroundColor: colors.tint }]}
                  onPress={() => setInviteModalVisible(true)}
                >
                  <Text style={[styles.inviteButtonText, { color: colors.buttonText }]}>이메일로 바로 초대하기</Text>
                </TouchableOpacity>
              )}
              
              {!isOwner && (
                <Text style={[styles.ownerOnlyText, { color: colors.lightGray }]}>
                  그룹 관리자만 멤버를 초대할 수 있습니다
                </Text>
              )}
              
              <TouchableOpacity
                style={[styles.refreshButton, { backgroundColor: colors.secondary }]}
                onPress={handleRefresh}
              >
                <Text style={[styles.refreshButtonText, { color: colors.darkGray }]}>새로고침</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {members.length > 0 ? (
            <FlatList
              data={members}
              renderItem={({ item }) => (
                <MemberItem 
                  member={item} 
                  isCurrentUser={item.userId === user?.uid}
                  colors={colors}
                  isOwner={isOwner}
                  onRemove={handleRemoveMember}
                  onTransfer={handleTransferOwnership}
                />
              )}
              keyExtractor={(item) => item.id || item.userId}
              scrollEnabled={false}
            />
          ) : (
            <Text style={[styles.emptyText, { color: colors.lightGray }]}>멤버가 없습니다.</Text>
          )}

          {isOwner && members.length > 1 && (
            <View style={[styles.infoNote, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.infoNoteText, { color: colors.text }]}>
                💡 다른 멤버에게 관리자 권한을 위임하려면 해당 멤버 옆의 '위임' 버튼을 클릭하세요.
              </Text>
            </View>
          )}
        </View>
        
        {isOwner && (
          <View style={[
            styles.dangerZone,
            { marginBottom: screenRatio > 2.3 ? 10 : 30 }  // 🔴 인라인 스타일로 추가
          ]}>
            <Text style={styles.dangerZoneTitle}>위험 구역</Text>
            <TouchableOpacity
              style={[
                styles.deleteButton, 
                deleting && styles.disabledButton
              ]}
              onPress={handleDeleteGroup}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.deleteButtonText}>그룹 삭제</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
        
        {isOwner && (
          <View style={styles.bannedSection}>
            <TouchableOpacity
              style={styles.bannedHeader}
              onPress={() => setShowBannedList(!showBannedList)}
            >
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                차단된 사용자 ({bannedMembers.length})
              </Text>
              <Text style={[styles.toggleIcon, { color: colors.lightGray }]}>
                {showBannedList ? '▼' : '▶'}
              </Text>
            </TouchableOpacity>
            
            {showBannedList && (
              <View style={[styles.bannedListContainer, { backgroundColor: colors.card }]}>
                {bannedMembers.length > 0 ? (
                  bannedMembers.map((banned) => (
                    <View key={banned.id} style={styles.bannedItem}>
                      <View style={styles.bannedInfo}>
                        <Text style={[styles.bannedEmail, { color: colors.text }]}>
                          {banned.email}
                        </Text>
                        <Text style={[styles.bannedDate, { color: colors.lightGray }]}>
                          차단일: {new Date(banned.bannedAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.unbanButton, { backgroundColor: colors.secondary }]}
                        onPress={() => handleUnbanMember(banned)}
                        disabled={unbanning}
                      >
                        {unbanning ? (
                          <ActivityIndicator size="small" color={colors.tint} />
                        ) : (
                          <Text style={[styles.unbanButtonText, { color: colors.tint }]}>
                            차단 해제
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.emptyBannedText, { color: colors.lightGray }]}>
                    차단된 사용자가 없습니다.
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

      </ScrollView>
      
      <InviteModal
        visible={inviteModalVisible}
        onClose={() => setInviteModalVisible(false)}
        onSubmit={handleInvite}
        loading={inviting}
        colors={colors}
      />
      
      <EditGroupModal
        visible={editModalVisible}
        onClose={() => setEditModalVisible(false)}
        onSubmit={handleUpdateGroup}
        loading={editing}
        group={group}
        colors={colors}
      />
    </SafeAreaView>
  );
}

// 스타일은 동일하게 유지
const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1
  },
  backButton: {
    padding: 5
  },
  backButtonText: {
    fontSize: 16
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginHorizontal: 10
  },
  editButton: {
    padding: 5
  },
  editButtonText: {
    fontSize: 16
  },
  leaveHeaderButton: {
    padding: 5
  },
  leaveHeaderButtonText: {
    fontSize: 14,
    color: '#ff4d4f',
    fontWeight: '500'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  refreshIndicator: {
    paddingVertical: 10,
    alignItems: 'center'
  },
  content: {
    flex: 1,
    padding: 15
  },
  groupInfoSection: {
    marginBottom: 20
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10
  },
  infoCard: {
    borderRadius: 10,
    padding: 15,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  infoLabel: {
    fontSize: 14,
    marginBottom: 5
  },
  infoValue: {
    fontSize: 16,
    marginBottom: 15
  },
  colorOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 5,
    marginBottom: 15,
  },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)'
  },
  selectedColorOption: {
    borderWidth: 2,
    borderColor: '#333',
  },
  colorSelectedIcon: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold'
  },
  savingText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: -10,
    marginBottom: 10
  },
  membersSection: {
    marginBottom: 20
  },
  inviteButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8
  },
  inviteButtonText: {
    fontSize: 14,
    fontWeight: '500'
  },
  refreshButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16
  },
  refreshButtonText: {
    fontSize: 12
  },
  ownerOnlyText: {
    fontSize: 12, 
    fontStyle: 'italic',
    marginRight: 8
  },
  memberItem: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1
  },
  memberInfo: {
    flex: 1
  },
  memberName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4
  },
  currentUser: {
    fontWeight: 'normal'
  },
  memberEmail: {
    fontSize: 14
  },
  memberRole: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4
  },
  roleText: {
    fontSize: 12,
    fontWeight: '500'
  },
  ownerRoleText: {
  },
  memberRoleText: {
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    marginTop: 20
  },
  dangerZone: {
    marginTop: 10,
    // marginBottom은 인라인 스타일로 처리
    padding: 15,
    borderRadius: 10,
    backgroundColor: '#fff1f0',
    borderWidth: 1,
    borderColor: '#ffccc7'
  },
  dangerZoneTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ff4d4f',
    marginBottom: 10
  },
  deleteButton: {
    backgroundColor: '#ff4d4f',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center'
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  disabledButton: {
    backgroundColor: '#ffa39e'
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
    fontWeight: '500'
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16
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
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 15
  },
  inviteCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  inviteCode: {
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 2
  },
  shareButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20
  },
  shareButtonText: {
    fontSize: 14,
    fontWeight: '600'
  },
  generateButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10
  },
  generateButtonText: {
    fontSize: 14,
    fontWeight: '500'
  },
  inviteHelp: {
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 15
  },
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  transferMemberButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8
  },
  transferMemberButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  },
  removeButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  },
  bannedSection: {
    marginTop: 20,
    marginBottom: 20
  },
  bannedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10
  },
  toggleIcon: {
    fontSize: 14
  },
  bannedListContainer: {
    borderRadius: 10,
    padding: 15,
    marginTop: 10
  },
  bannedItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  bannedInfo: {
    flex: 1
  },
  bannedEmail: {
    fontSize: 16,
    marginBottom: 4
  },
  bannedDate: {
    fontSize: 12
  },
  unbanButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20
  },
  unbanButtonText: {
    fontSize: 14,
    fontWeight: '500'
  },
  emptyBannedText: {
    textAlign: 'center',
    fontSize: 14,
    paddingVertical: 20
  },
  infoNote: {
    marginTop: 15,
    padding: 12,
    borderRadius: 8
  },
  infoNoteText: {
    fontSize: 14,
    lineHeight: 20
  }
});
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
  RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../context/AuthContext';
import { 
  Group, 
  GroupMember, 
  getGroupById, 
  getGroupMembers, 
  updateGroup, 
  deleteGroup, 
  inviteToGroup,
  setUserGroupColor
} from '../../../services/groupService';

// 색상 선택 옵션
const COLOR_OPTIONS = [
  { name: '파란색', value: '#3b82f6' },
  { name: '초록색', value: '#10b981' },
  { name: '빨간색', value: '#ef4444' },
  { name: '보라색', value: '#8b5cf6' },
  { name: '주황색', value: '#f97316' },
  { name: '분홍색', value: '#ec4899' },
  { name: '청록색', value: '#14b8a6' },
  { name: '노란색', value: '#f59e0b' },
];

// 멤버 항목 컴포넌트
interface MemberItemProps {
  member: GroupMember;
  isCurrentUser: boolean;
}

const MemberItem = ({ member, isCurrentUser }: MemberItemProps) => {
  return (
    <View style={styles.memberItem}>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>
          {member.displayName}
          {isCurrentUser && <Text style={styles.currentUser}> (나)</Text>}
        </Text>
        <Text style={styles.memberEmail}>{member.email}</Text>
      </View>
      
      <View style={styles.memberRole}>
        <Text style={[
          styles.roleText,
          member.role === 'owner' ? styles.ownerRoleText : styles.memberRoleText
        ]}>
          {member.role === 'owner' ? '관리자' : '멤버'}
        </Text>
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
}

const InviteModal = ({ visible, onClose, onSubmit, loading }: InviteModalProps) => {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ email?: string }>({});

  // 모달이 닫힐 때 입력 필드 초기화
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
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>멤버 초대</Text>
          
          <View style={styles.formGroup}>
            <Text style={styles.label}>초대할 사용자 이메일</Text>
            <TextInput
              style={[styles.input, errors.email && styles.inputError]}
              placeholder="이메일 주소"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
          </View>
          
          <View style={styles.modalActions}>
            <TouchableOpacity 
              style={[styles.modalButton, styles.cancelButton]} 
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>취소</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.modalButton, styles.submitButton, loading && styles.disabledButton]} 
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>초대</Text>
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
}

const EditGroupModal = ({ visible, onClose, onSubmit, loading, group }: EditGroupModalProps) => {
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
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>그룹 정보 편집</Text>
          
          <View style={styles.formGroup}>
            <Text style={styles.label}>그룹 이름</Text>
            <TextInput
              style={[styles.input, errors.name && styles.inputError]}
              placeholder="그룹 이름"
              value={name}
              onChangeText={setName}
            />
            {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
          </View>
          
          <View style={styles.formGroup}>
            <Text style={styles.label}>설명 (선택사항)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="그룹에 대한 설명"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
          
          <View style={styles.modalActions}>
            <TouchableOpacity 
              style={[styles.modalButton, styles.cancelButton]} 
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>취소</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.modalButton, styles.submitButton, loading && styles.disabledButton]} 
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>저장</Text>
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
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const groupId = Array.isArray(id) ? id[0] : id;
  
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // 색상 선택 관련 상태
  const [selectedColor, setSelectedColor] = useState<string>('#4CAF50'); // 기본 색상
  const [savingColor, setSavingColor] = useState(false);

  // 관리자 권한 확인 (소유자인 경우) - 타입 체크 및 대소문자 구분 없이 확인
  const isOwner = typeof group?.role === 'string' && 
                 group.role.toLowerCase() === 'owner';
  
  // 색상 변경 핸들러
  const handleColorChange = async (color: string) => {
    if (!user || !groupId) return;
    
    try {
      setSavingColor(true);
      setSelectedColor(color);
      
      console.log(`그룹 색상 변경: ${color}`);
      const result = await setUserGroupColor(user.uid, groupId, color);
      
      if (result.success) {
        if (group) {
          // 로컬 상태 업데이트
          setGroup({ ...group, color });
          console.log(`그룹 색상 변경 성공: ${color}`);
        }
      } else {
        Alert.alert('오류', '색상 변경 중 오류가 발생했습니다.');
        // 실패 시 원래 색상으로 복원
        setSelectedColor(group?.color || '#4CAF50');
      }
    } catch (error) {
      console.error('색상 변경 오류:', error);
      Alert.alert('오류', '색상 변경 중 오류가 발생했습니다.');
    } finally {
      setSavingColor(false);
    }
  };
  
  // 그룹 및 멤버 데이터 로드
  const loadGroupData = async () => {
    try {
      if (refreshing) return; // 이미 로딩 중이면 중복 방지
      
      console.log('[loadGroupData] 그룹 데이터 로드 시작. 그룹 ID:', groupId);
      setLoading(true);
      
      if (!groupId) return;
      
      // 그룹 정보 가져오기
      const groupResult = await getGroupById(groupId);
      if (groupResult.success && groupResult.group) {
        const groupData = groupResult.group as Group;
        console.log('[loadGroupData] 그룹 정보 로드 성공:', groupData.name);
        
        // 추가: 그룹 멤버 목록에서 사용자의 역할 가져오기
        const membersResult = await getGroupMembers(groupId);
        
        if (membersResult.success && membersResult.members) {
          const members = membersResult.members as GroupMember[];
          console.log('[loadGroupData] 멤버 수:', members.length);
          setMembers(members);
          
          // 멤버 이메일 정보 로그
          console.log('[loadGroupData] 멤버 이메일 목록:', 
            members.map(m => ({ name: m.displayName, email: m.email })));
          
          // 현재 사용자의 역할과 색상 찾기
          const currentUserMember = members.find(m => m.userId === user?.uid);
          
          if (currentUserMember) {
            // 그룹 데이터에 역할 추가
            const updatedGroup = {
              ...groupData,
              role: currentUserMember.role,
              color: currentUserMember.color || '#4CAF50'
            };
            console.log('[loadGroupData] 역할 설정됨:', updatedGroup.role);
            console.log('[loadGroupData] 색상 설정됨:', updatedGroup.color);
            
            setGroup(updatedGroup);
            // 색상 상태 업데이트
            setSelectedColor(currentUserMember.color || '#4CAF50');
          } else {
            // 멤버 목록에 사용자가 없으면 기본 그룹 데이터 사용
            console.log('[loadGroupData] 사용자의 멤버 정보 없음, 기본 데이터 사용');
            setGroup(groupData);
          }
        } else {
          // 멤버 조회 실패 시 기본 그룹 데이터 사용
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

  // 초기 데이터 로드
  useEffect(() => {
    if (user && groupId) {
      loadGroupData();
    }
  }, [user, groupId]);

  // 초대 처리 - 여기가 수정된 부분
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
        
        // 성공 알림 표시
        Alert.alert('성공', '초대가 완료되었습니다.');
        
        // 약간의 지연 후 데이터 새로고침
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
                setDeleting(false); // 여기에 추가: 성공 시에도 로딩 상태 해제
                
                Alert.alert('성공', '그룹이 삭제되었습니다.', [
                  { 
                    text: '확인', 
                    onPress: () => {
                      console.log('그룹 목록으로 이동');
                      router.push('/(tabs)/groups'); // router.back() 대신 직접 경로 지정
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

  // 각 색상 옵션에 대한 스타일 객체 미리 생성 (Reanimated 경고 방지)
  const getColorOptionStyles = (colorValue: string) => {
    return [
      styles.colorOption,
      { backgroundColor: colorValue },
      selectedColor === colorValue && styles.selectedColorOption
    ];
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3c66af" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
      <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.push('/(tabs)/groups')}
        >
          <Text style={styles.backButtonText}>{'<'} 뒤로</Text>
        </TouchableOpacity>
        
        <Text style={styles.headerTitle} numberOfLines={1}>
          {group?.name}
        </Text>
        
        {isOwner && (
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setEditModalVisible(true)}
          >
            <Text style={styles.editButtonText}>편집</Text>
          </TouchableOpacity>
        )}
      </View>
      
      <ScrollView 
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#3c66af']}
            tintColor="#3c66af"
          />
        }
      >
        {refreshing && (
          <View style={styles.refreshIndicator}>
            <ActivityIndicator size="small" color="#3c66af" />
          </View>
        )}
        
        <View style={styles.groupInfoSection}>
          <Text style={styles.sectionTitle}>그룹 정보</Text>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>그룹 이름</Text>
            <Text style={styles.infoValue}>{group?.name}</Text>
            
            <Text style={styles.infoLabel}>설명</Text>
            <Text style={styles.infoValue}>
              {group?.description || '설명이 없습니다.'}
            </Text>
            
            <Text style={styles.infoLabel}>멤버</Text>
            <Text style={styles.infoValue}>{members.length}명</Text>
            
            <Text style={styles.infoLabel}>내 역할</Text>
            <Text style={[
              styles.infoValue,
              isOwner ? styles.ownerRoleText : styles.memberRoleText
            ]}>
              {isOwner ? '관리자' : '멤버'}
            </Text>
            
            {/* 색상 선택 UI 수정 - Reanimated 경고 방지 */}
            <Text style={styles.infoLabel}>그룹 색상 (캘린더에 표시될 색상)</Text>
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
              <Text style={styles.savingText}>색상 저장 중...</Text>
            )}
          </View>
        </View>
        
        <View style={styles.membersSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>멤버 목록</Text>
            
            <View style={styles.sectionHeaderRight}>
              {isOwner && (
                <TouchableOpacity
                  style={styles.inviteButton}
                  onPress={() => setInviteModalVisible(true)}
                >
                  <Text style={styles.inviteButtonText}>멤버 초대</Text>
                </TouchableOpacity>
              )}
              
              {!isOwner && (
                <Text style={styles.ownerOnlyText}>
                  그룹 관리자만 멤버를 초대할 수 있습니다
                </Text>
              )}
              
              <TouchableOpacity
                style={styles.refreshButton}
                onPress={handleRefresh}
              >
                <Text style={styles.refreshButtonText}>새로고침</Text>
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
                />
              )}
              keyExtractor={(item) => item.id || item.userId}
              scrollEnabled={false}
            />
          ) : (
            <Text style={styles.emptyText}>멤버가 없습니다.</Text>
          )}
        </View>
        
        {isOwner && (
          <View style={styles.dangerZone}>
            <Text style={styles.dangerZoneTitle}>위험 구역</Text>
            <TouchableOpacity
              style={[styles.deleteButton, deleting && styles.disabledButton]}
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
      </ScrollView>
      
      <InviteModal
        visible={inviteModalVisible}
        onClose={() => setInviteModalVisible(false)}
        onSubmit={handleInvite}
        loading={inviting}
      />
      
      <EditGroupModal
        visible={editModalVisible}
        onClose={() => setEditModalVisible(false)}
        onSubmit={handleUpdateGroup}
        loading={editing}
        group={group}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff'
  },
  backButton: {
    padding: 5
  },
  backButtonText: {
    fontSize: 16,
    color: '#3c66af'
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginHorizontal: 10,
    color: '#333'
  },
  editButton: {
    padding: 5
  },
  editButtonText: {
    fontSize: 16,
    color: '#3c66af'
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
    color: '#333',
    marginBottom: 10
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
    marginBottom: 15
  },
  // 색상 선택 관련 스타일
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
    color: '#666',
    fontStyle: 'italic',
    marginTop: -10,
    marginBottom: 10
  },
  membersSection: {
    marginBottom: 20
  },
  inviteButton: {
    backgroundColor: '#3c66af',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8
  },
  inviteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500'
  },
  refreshButton: {
    backgroundColor: '#f1f3f5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16
  },
  refreshButtonText: {
    color: '#495057',
    fontSize: 12
  },
  ownerOnlyText: {
    fontSize: 12, 
    color: '#666',
    fontStyle: 'italic',
    marginRight: 8
  },
  memberItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
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
    color: '#333',
    marginBottom: 4
  },
  currentUser: {
    fontWeight: 'normal',
    color: '#666'
  },
  memberEmail: {
    fontSize: 14,
    color: '#666'
  },
  memberRole: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#f1f3f5'
  },
  roleText: {
    fontSize: 12,
    fontWeight: '500'
  },
  ownerRoleText: {
    color: '#3c66af'
  },
  memberRoleText: {
    color: '#495057'
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#999',
    marginTop: 20
  },
  dangerZone: {
    marginTop: 10,
    marginBottom: 30,
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
  
  // 모달 스타일
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    width: '100%',
    maxWidth: 500
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
    textAlign: 'center'
  },
  formGroup: {
    marginBottom: 15
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
    color: '#333',
    fontWeight: '500'
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9'
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
    backgroundColor: '#f1f3f5',
    marginRight: 10
  },
  cancelButtonText: {
    color: '#495057',
    fontWeight: '600'
  },
  submitButton: {
    backgroundColor: '#3c66af'
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '600'
  }
});
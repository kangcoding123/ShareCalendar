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
  ScrollView
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
  inviteToGroup 
} from '../../../services/groupService';

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

  const isOwner = group?.role === 'owner';

  // 그룹 및 멤버 데이터 로드
  const loadGroupData = async () => {
    try {
      setLoading(true);
      
      if (!groupId) return;
      
      // 그룹 정보 가져오기
      const groupResult = await getGroupById(groupId);
      if (groupResult.success && groupResult.group) {
        setGroup(groupResult.group as Group);
      } else {
        Alert.alert('오류', '그룹 정보를 불러오는 중 오류가 발생했습니다.');
        router.back();
        return;
      }
      
      // 멤버 목록 가져오기
      const membersResult = await getGroupMembers(groupId);
      if (membersResult.success && membersResult.members) {
        setMembers(membersResult.members as GroupMember[]);
      } else {
        Alert.alert('오류', '멤버 목록을 불러오는 중 오류가 발생했습니다.');
      }
    } catch (error) {
      console.error('그룹 데이터 로드 중 오류:', error);
      Alert.alert('오류', '그룹 정보를 불러오는 중 오류가 발생했습니다.');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  // 초기 데이터 로드
  useEffect(() => {
    if (user && groupId) {
      loadGroupData();
    }
  }, [user, groupId]);

  // 초대 처리
  const handleInvite = async (email: string) => {
    try {
      setInviting(true);
      
      if (!groupId) return;
      
      const result = await inviteToGroup(groupId, email);
      
      if (result.success) {
        setInviteModalVisible(false);
        Alert.alert('성공', '초대가 완료되었습니다.');
        loadGroupData();
      } else {
        Alert.alert('초대 실패', result.error || '사용자 초대 중 오류가 발생했습니다.');
      }
    } catch (error) {
      console.error('초대 중 오류:', error);
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
              
              if (!groupId) return;
              
              const result = await deleteGroup(groupId);
              
              if (result.success) {
                Alert.alert('성공', '그룹이 삭제되었습니다.', [
                  { text: '확인', onPress: () => router.back() }
                ]);
              } else {
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

  if (loading) {
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
          onPress={() => router.back()}
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
      
      <ScrollView style={styles.content}>
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
          </View>
        </View>
        
        <View style={styles.membersSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>멤버 목록</Text>
            
            {isOwner && (
              <TouchableOpacity
                style={styles.inviteButton}
                onPress={() => setInviteModalVisible(true)}
              >
                <Text style={styles.inviteButtonText}>멤버 초대</Text>
              </TouchableOpacity>
            )}
          </View>
          
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
            ListEmptyComponent={
              <Text style={styles.emptyText}>멤버가 없습니다.</Text>
            }
          />
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
  membersSection: {
    marginBottom: 20
  },
  inviteButton: {
    backgroundColor: '#3c66af',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20
  },
  inviteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500'
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
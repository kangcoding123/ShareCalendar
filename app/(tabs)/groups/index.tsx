// app/(tabs)/groups/index.tsx
import React, { useState, useEffect } from 'react';
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
  RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../../context/AuthContext';
import { Group, getUserGroups, createGroup, inviteToGroup } from '../../../services/groupService';
import { useFocusEffect } from '@react-navigation/native'; // 새로 추가

// 그룹 항목 컴포넌트
interface GroupItemProps {
  group: Group;
  onPress: (group: Group) => void;
  onInvite?: (group: Group) => void;
}

const GroupItem = ({ group, onPress, onInvite }: GroupItemProps) => {
  // role 속성이 문자열인지 확인하고 소유자인지 체크
  const isOwner = typeof group.role === 'string' && group.role.toLowerCase() === 'owner';
  
  console.log(`[GroupItem] Group: ${group.name}, Role: ${group.role}, isOwner: ${isOwner}`);
  
  return (
    <TouchableOpacity style={styles.groupItem} onPress={() => onPress(group)}>
      <View style={styles.groupInfo}>
        <Text style={styles.groupName}>{group.name}</Text>
        <Text style={styles.groupDescription}>{group.description || '설명 없음'}</Text>
        <View style={styles.groupMeta}>
          <Text style={styles.groupMetaText}>
            {group.memberCount || '?'}명의 멤버
          </Text>
          {isOwner && (
            <View style={styles.ownerBadge}>
              <Text style={styles.ownerBadgeText}>관리자</Text>
            </View>
          )}
          
          {isOwner && onInvite && (
            <TouchableOpacity 
              style={styles.quickInviteButton}
              onPress={(e) => {
                e.stopPropagation(); // 그룹 클릭 이벤트 방지
                onInvite(group);
              }}
            >
              <Text style={styles.quickInviteText}>초대하기</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.arrowContainer}>
        <Text style={styles.arrow}>{'>'}</Text>
      </View>
    </TouchableOpacity>
  );
};

// 그룹 생성 모달
interface CreateGroupModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (groupData: { name: string; description: string }) => void;
  loading: boolean;
}

const CreateGroupModal = ({ visible, onClose, onSubmit, loading }: CreateGroupModalProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ name?: string }>({});

  const handleSubmit = () => {
    const newErrors: { name?: string } = {};
    
    if (!name.trim()) {
      newErrors.name = '그룹 이름을 입력해주세요.';
    }
    
    setErrors(newErrors);
    
    if (Object.keys(newErrors).length === 0) {
      onSubmit({
        name: name.trim(),
        description: description.trim()
      });
    }
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
          <Text style={styles.modalTitle}>새 그룹 생성</Text>
          
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
                <Text style={styles.submitButtonText}>생성</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default function GroupListScreen() {
  const { user } = useAuth();
  const router = useRouter();
  
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  
  // 초대 관련 상태 추가
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  // 그룹 데이터 로드
  const loadGroups = async () => {
    try {
      setLoading(true);
      
      if (!user || !user.uid) return;
      
      console.log('[loadGroups] 그룹 데이터 로드 시작');
      const result = await getUserGroups(user.uid);
      
      if (result.success && Array.isArray(result.groups)) {
        // 그룹 데이터 디버깅
        const groups = result.groups as Group[];
        console.log('Loaded groups:', groups.map(g => ({
          id: g.id, 
          name: g.name,
          role: g.role
        })));
        
        setGroups(groups);
      } else {
        console.error('그룹 로드 실패:', result.error);
        Alert.alert('오류', '그룹 목록을 불러오는 중 오류가 발생했습니다.');
      }
    } catch (error) {
      console.error('그룹 로드 중 오류:', error);
      Alert.alert('오류', '그룹 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // 초기 데이터 로드
  useEffect(() => {
    if (user) {
      loadGroups();
    }
  }, [user]);

  // 화면이 포커스될 때마다 데이터 새로고침 (추가된 부분)
  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        console.log('그룹 목록 화면 포커스 - 데이터 새로고침');
        setRefreshing(true);
        loadGroups();
      }
      return () => {};
    }, [user])
  );

  // 새로고침 핸들러
  const handleRefresh = () => {
    setRefreshing(true);
    loadGroups();
  };

  // 그룹 선택 핸들러
  const handleGroupPress = (group: Group) => {
    router.push(`/groups/${group.id}`);
  };
  
  // 그룹 초대 핸들러
  const handleInvitePress = (group: Group) => {
    setSelectedGroup(group);
    setInviteModalVisible(true);
  };
  
  // 초대 제출 핸들러
  const handleInvite = async (email: string) => {
    console.log(`[handleInvite] 초대 시도. 이메일: ${email}, 선택된 그룹:`, selectedGroup);
    
    if (!selectedGroup) {
      console.error('[handleInvite] 선택된 그룹 없음');
      Alert.alert('오류', '그룹 정보가 없습니다.');
      return;
    }
    
    // 이메일 유효성 검사
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
        setInviteEmail(''); // 초대 후 이메일 초기화
        Alert.alert('성공', `${email} 님을 그룹에 초대했습니다.`);
        // 그룹 목록 새로고침
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

  // 그룹 생성 핸들러
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
        // 새 그룹 추가 후 목록 새로고침
        loadGroups();
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
  <SafeAreaView style={styles.container}>
    <View style={styles.header}>
      <Text style={styles.headerTitle}>내 그룹</Text>
    </View>
    
    {loading && !refreshing ? (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3c66af" />
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
            />
          )}
          keyExtractor={(item) => item.id || ''}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]} // 더 넓은 여백
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                아직 속한 그룹이 없습니다.{'\n'}새 그룹을 생성해보세요.
              </Text>
            </View>
          }
        />
        
        <TouchableOpacity
          style={[styles.createButton, { zIndex: 100 }]} // zIndex 추가
          onPress={() => {
            console.log("그룹 생성 버튼 클릭됨");
            setCreateModalVisible(true);
          }}
        >
          <Text style={styles.createButtonText}>+ 새 그룹 생성</Text>
        </TouchableOpacity>
        
        <CreateGroupModal
          visible={createModalVisible}
          onClose={() => setCreateModalVisible(false)}
          onSubmit={handleCreateGroup}
          loading={creatingGroup}
        />
        
        {/* 멤버 초대 모달 */}
        <Modal
          visible={inviteModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => {
            setInviteModalVisible(false);
            setInviteEmail('');
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {selectedGroup?.name} 그룹에 멤버 초대
              </Text>
              
              <View style={styles.formGroup}>
                <Text style={styles.label}>초대할 사용자 이메일</Text>
                <TextInput
                  style={styles.input}
                  placeholder="이메일 주소"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  onSubmitEditing={() => handleInvite(inviteEmail)}
                />
              </View>
              
              <View style={styles.modalActions}>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.cancelButton]} 
                  onPress={() => {
                    setInviteModalVisible(false);
                    setInviteEmail('');
                  }}
                  disabled={inviting}
                >
                  <Text style={styles.cancelButtonText}>취소</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.modalButton, styles.submitButton, inviting && styles.disabledButton]} 
                  onPress={() => handleInvite(inviteEmail)}
                  disabled={inviting}
                >
                  {inviting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>초대</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    )}
  </SafeAreaView>
);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa'
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff'
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  listContent: {
    padding: 15,
    paddingBottom: 80
  },
  groupItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
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
    color: '#333',
    marginBottom: 5
  },
  groupDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10
  },
  groupMeta: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  groupMetaText: {
    fontSize: 12,
    color: '#888'
  },
  ownerBadge: {
    backgroundColor: '#e7f5ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8
  },
  ownerBadgeText: {
    fontSize: 10,
    color: '#3c66af',
    fontWeight: '500'
  },
  quickInviteButton: {
    backgroundColor: '#3c66af',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 8
  },
  quickInviteText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '500'
  },
  arrowContainer: {
    justifyContent: 'center'
  },
  arrow: {
    fontSize: 18,
    color: '#ccc'
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center'
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    lineHeight: 24
  },
  createButton: {
    position: 'absolute',
    bottom: 80,
    left: 20,
    right: 20,
    backgroundColor: '#3c66af',
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
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold'
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
  },
  disabledButton: {
    backgroundColor: '#a0a0a0'
  }
});
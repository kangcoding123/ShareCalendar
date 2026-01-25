// app/(tabs)/board/index.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { Post } from '@/types/board';
import { checkGroupOwnership, updateBoardLastViewed, getUnreadCommentCounts, getUnreadPostCounts } from '@/services/boardService';
import { nativeDb } from '@/config/firebase';
import PostItem from '@/components/board/PostItem';
import { Group, getUserGroups } from '@/services/groupService';

export default function BoardListScreen() {
  const router = useRouter();
  const { groupId: paramGroupId, groupName: paramGroupName } = useLocalSearchParams<{ groupId: string; groupName: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  const { user } = useAuth();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [unreadCommentCounts, setUnreadCommentCounts] = useState<{ [postId: string]: number }>({});

  // 그룹 선택 화면용 상태
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [unreadPostCounts, setUnreadPostCounts] = useState<{ [groupId: string]: number }>({});

  // 선택된 그룹 상태 (로컬에서 관리)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(paramGroupId || null);
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(paramGroupName || null);

  // URL params에서 groupId가 전달되면 로컬 상태에 설정
  useEffect(() => {
    if (paramGroupId) {
      setSelectedGroupId(paramGroupId);
      setSelectedGroupName(paramGroupName || null);
    }
  }, [paramGroupId, paramGroupName]);

  // 그룹 목록 로드 함수
  const loadGroups = useCallback(async () => {
    if (selectedGroupId || !user?.uid) {
      setGroupsLoading(false);
      return;
    }

    setGroupsLoading(true);
    try {
      const result = await getUserGroups(user.uid);
      if (result.success && result.groups) {
        const userGroups = result.groups as Group[];
        setGroups(userGroups);

        // 읽지 않은 게시글 수 로드
        if (userGroups.length > 0) {
          const groupIds = userGroups.map(g => g.id);
          const counts = await getUnreadPostCounts(user.uid, groupIds);
          setUnreadPostCounts(counts);
        }
      }
    } catch (error) {
      console.error('그룹 로드 오류:', error);
    } finally {
      setGroupsLoading(false);
    }
  }, [selectedGroupId, user?.uid]);

  // 초기 로드
  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // 화면 포커스 시 그룹 목록 새로고침 (새 그룹 생성 후 게시판 탭 이동 시 반영)
  useFocusEffect(
    useCallback(() => {
      if (!selectedGroupId && user?.uid) {
        loadGroups();
      }
    }, [selectedGroupId, user?.uid, loadGroups])
  );

  // 그룹 선택 핸들러
  const handleSelectGroup = (gId: string, gName: string) => {
    setSelectedGroupId(gId);
    setSelectedGroupName(gName);
    setLoading(true);
  };

  // 그룹 선택 화면으로 돌아가기
  const goBackToGroupSelect = useCallback(() => {
    if (user?.uid && selectedGroupId) {
      updateBoardLastViewed(user.uid, selectedGroupId);
    }
    setSelectedGroupId(null);
    setSelectedGroupName(null);
    setPosts([]);
    setLoading(true);
    setGroupsLoading(true);
  }, [user?.uid, selectedGroupId]);

  // 실시간 리스너로 게시글 감지
  useEffect(() => {
    if (!selectedGroupId) return;

    const unsubscribe = nativeDb
      .collection('posts')
      .where('groupId', '==', selectedGroupId)
      .onSnapshot(
        (snapshot) => {
          const allPosts: Post[] = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          } as Post));

          // 클라이언트에서 정렬: 고정글 우선, 그 다음 최신순
          allPosts.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            if (a.isPinned && b.isPinned) {
              return new Date(b.pinnedAt || 0).getTime() - new Date(a.pinnedAt || 0).getTime();
            }
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });

          setPosts(allPosts);
          setLoading(false);
          setRefreshing(false);
        },
        (error) => {
          console.error('게시글 실시간 리스너 오류:', error);
          setLoading(false);
        }
      );

    return () => unsubscribe();
  }, [selectedGroupId]);

  const checkOwnership = useCallback(async () => {
    if (!selectedGroupId || !user?.uid) return;

    const ownerStatus = await checkGroupOwnership(selectedGroupId, user.uid);
    setIsOwner(ownerStatus);
  }, [selectedGroupId, user?.uid]);

  useEffect(() => {
    checkOwnership();
  }, [checkOwnership]);

  // 본인 게시글의 새 댓글 수 확인
  const loadUnreadCommentCounts = useCallback(async () => {
    if (!user?.uid || !selectedGroupId) return;

    try {
      const counts = await getUnreadCommentCounts(user.uid, [selectedGroupId]);
      setUnreadCommentCounts(counts);
    } catch (error) {
      console.error('새 댓글 수 로드 오류:', error);
    }
  }, [user?.uid, selectedGroupId]);

  useEffect(() => {
    loadUnreadCommentCounts();
  }, [loadUnreadCommentCounts]);

  // 댓글 실시간 리스너 - 댓글 변경 시 새 댓글 수 재확인
  useEffect(() => {
    if (!selectedGroupId) return;

    const unsubscribe = nativeDb
      .collection('comments')
      .where('groupId', '==', selectedGroupId)
      .onSnapshot(
        () => {
          loadUnreadCommentCounts();
        },
        (error) => {
          console.error('댓글 실시간 리스너 오류:', error);
        }
      );

    return () => unsubscribe();
  }, [selectedGroupId, loadUnreadCommentCounts]);

  // 사용자 문서 변경 감지 - postLastViewedAt 업데이트 시 새 댓글 수 재확인
  useEffect(() => {
    if (!user?.uid) return;

    const unsubscribe = nativeDb
      .collection('users')
      .doc(user.uid)
      .onSnapshot(
        () => {
          loadUnreadCommentCounts();
        },
        (error) => {
          console.error('사용자 문서 리스너 오류:', error);
        }
      );

    return () => unsubscribe();
  }, [user?.uid, loadUnreadCommentCounts]);

  // 게시판 나갈 때 마지막 조회 시간 업데이트 + 뒤로가기 버튼 처리
  useFocusEffect(
    useCallback(() => {
      // Android 하드웨어 뒤로가기 버튼 처리
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        if (selectedGroupId) {
          goBackToGroupSelect();
          return true; // 기본 동작 방지
        }
        return false; // 기본 동작 허용 (앱 종료 등)
      });

      return () => {
        backHandler.remove();
      };
    }, [selectedGroupId, goBackToGroupSelect])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    // 실시간 리스너가 있으므로 별도 로드 불필요, 잠시 후 refreshing 해제
    setTimeout(() => setRefreshing(false), 500);
  };

  const handlePostPress = (post: Post) => {
    router.push({
      pathname: '/(tabs)/board/[postId]',
      params: {
        postId: post.id,
        groupId: selectedGroupId,
        groupName: selectedGroupName,
        isOwner: isOwner ? 'true' : 'false'
      }
    });
  };

  const handleCreatePost = () => {
    router.push({
      pathname: '/(tabs)/board/create',
      params: { groupId: selectedGroupId, groupName: selectedGroupName }
    });
  };

  const pinnedPosts = posts.filter(p => p.isPinned);
  const regularPosts = posts.filter(p => !p.isPinned);

  const renderSectionHeader = (title: string) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.lightGray }]}>{title}</Text>
    </View>
  );

  const renderItem = ({ item }: { item: Post }) => (
    <PostItem
      post={item}
      onPress={() => handlePostPress(item)}
      colors={colors}
    />
  );

  // 그룹 선택 화면 (selectedGroupId가 없을 때)
  if (!selectedGroupId) {
    if (groupsLoading) {
      return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        </SafeAreaView>
      );
    }

    if (!user) {
      return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
          <View style={styles.header}>
            <View style={styles.backButton} />
            <Text style={[styles.headerTitle, { color: colors.text }]}>게시판</Text>
            <View style={styles.createButton} />
          </View>
          <View style={styles.emptyContainer}>
            <Feather name="message-square" size={48} color={colors.lightGray} />
            <Text style={[styles.emptyText, { color: colors.text, marginTop: 16 }]}>
              로그인이 필요합니다
            </Text>
            <TouchableOpacity
              style={[styles.createFirstButton, { backgroundColor: colors.tint }]}
              onPress={() => router.push('/(auth)/login')}
            >
              <Text style={styles.createFirstButtonText}>로그인</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    if (groups.length === 0) {
      return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
          <View style={styles.header}>
            <View style={styles.backButton} />
            <Text style={[styles.headerTitle, { color: colors.text }]}>게시판</Text>
            <View style={styles.createButton} />
          </View>
          <View style={styles.emptyContainer}>
            <Feather name="users" size={48} color={colors.lightGray} />
            <Text style={[styles.emptyText, { color: colors.text, marginTop: 16 }]}>
              가입한 그룹이 없습니다
            </Text>
            <Text style={[styles.emptySubText, { color: colors.lightGray }]}>
              그룹에 가입하면 게시판을 이용할 수 있어요
            </Text>
            <TouchableOpacity
              style={[styles.createFirstButton, { backgroundColor: colors.tint }]}
              onPress={() => router.push('/(tabs)/groups')}
            >
              <Text style={styles.createFirstButtonText}>그룹 찾기</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    // 그룹 선택 화면
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.backButton} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>게시판</Text>
          <View style={styles.createButton} />
        </View>
        <Text style={[styles.groupSelectSubtitle, { color: colors.lightGray }]}>
          게시판을 볼 그룹을 선택하세요
        </Text>
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const unreadCount = unreadPostCounts[item.id] || 0;
            return (
              <TouchableOpacity
                style={[styles.groupItem, { borderBottomColor: colors.border }]}
                onPress={() => handleSelectGroup(item.id, item.name)}
                activeOpacity={0.6}
              >
                <View style={[styles.groupColorDot, { backgroundColor: item.color || '#4CAF50' }]} />
                <View style={styles.groupInfo}>
                  <Text style={[styles.groupItemName, { color: colors.text }]}>{item.name}</Text>
                  {item.description && (
                    <Text style={[styles.groupItemDesc, { color: colors.lightGray }]} numberOfLines={1}>
                      {item.description}
                    </Text>
                  )}
                </View>
                {unreadCount > 0 && (
                  <View style={styles.groupUnreadBadge}>
                    <Text style={styles.groupUnreadBadgeText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
                <Feather name="chevron-right" size={20} color={colors.lightGray} />
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.groupListContent}
        />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBackToGroupSelect} style={styles.backButton}>
          <Feather name="chevron-left" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {selectedGroupName || '게시판'}
        </Text>
        <TouchableOpacity onPress={handleCreatePost} style={styles.createButton}>
          <Feather name="edit-3" size={22} color={colors.tint} />
        </TouchableOpacity>
      </View>

      {posts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconContainer, { backgroundColor: colors.border + '40' }]}>
            <Feather name="edit-3" size={32} color={colors.lightGray} />
          </View>
          <Text style={[styles.emptyText, { color: colors.text }]}>
            아직 게시글이 없습니다
          </Text>
          <Text style={[styles.emptySubText, { color: colors.lightGray }]}>
            첫 번째 게시글을 작성해보세요
          </Text>
          <TouchableOpacity
            style={[styles.createFirstButton, { backgroundColor: colors.tint }]}
            onPress={handleCreatePost}
            activeOpacity={0.8}
          >
            <Text style={styles.createFirstButtonText}>글쓰기</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={[]}
          renderItem={() => null}
          ListHeaderComponent={
            <>
              {pinnedPosts.length > 0 && (
                <>
                  {renderSectionHeader('고정')}
                  {pinnedPosts.map(post => (
                    <PostItem
                      key={post.id}
                      post={post}
                      onPress={() => handlePostPress(post)}
                      colors={colors}
                      hasNewComment={(unreadCommentCounts[post.id] || 0) > 0}
                    />
                  ))}
                </>
              )}
              {regularPosts.length > 0 && (
                <>
                  {pinnedPosts.length > 0 && renderSectionHeader('게시글')}
                  {regularPosts.map(post => (
                    <PostItem
                      key={post.id}
                      post={post}
                      onPress={() => handlePostPress(post)}
                      colors={colors}
                      hasNewComment={(unreadCommentCounts[post.id] || 0) > 0}
                    />
                  ))}
                </>
              )}
            </>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.tint}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backButton: {
    padding: 4,
    marginLeft: -4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 8,
    letterSpacing: -0.3,
  },
  createButton: {
    padding: 8,
  },
  listContent: {
    paddingBottom: 20,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  emptySubText: {
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
  createFirstButton: {
    marginTop: 28,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 25,
  },
  createFirstButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  // 그룹 선택 화면 스타일
  groupSelectSubtitle: {
    fontSize: 14,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  groupListContent: {
    paddingBottom: 20,
  },
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  groupInfo: {
    flex: 1,
  },
  groupItemName: {
    fontSize: 16,
    fontWeight: '600',
  },
  groupItemDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  groupUnreadBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  groupUnreadBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});

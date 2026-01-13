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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { Post } from '@/types/board';
import { checkGroupOwnership, updateBoardLastViewed, getUnreadCommentCounts } from '@/services/boardService';
import { nativeDb } from '@/config/firebase';
import PostItem from '@/components/board/PostItem';

export default function BoardListScreen() {
  const router = useRouter();
  const { groupId, groupName } = useLocalSearchParams<{ groupId: string; groupName: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  const { user } = useAuth();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [unreadCommentCounts, setUnreadCommentCounts] = useState<{ [postId: string]: number }>({});

  // 실시간 리스너로 게시글 감지
  useEffect(() => {
    if (!groupId) return;

    const unsubscribe = nativeDb
      .collection('posts')
      .where('groupId', '==', groupId)
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
  }, [groupId]);

  const checkOwnership = useCallback(async () => {
    if (!groupId || !user?.uid) return;

    const ownerStatus = await checkGroupOwnership(groupId, user.uid);
    setIsOwner(ownerStatus);
  }, [groupId, user?.uid]);

  useEffect(() => {
    checkOwnership();
  }, [checkOwnership]);

  // 본인 게시글의 새 댓글 수 확인
  const loadUnreadCommentCounts = useCallback(async () => {
    if (!user?.uid || !groupId) return;

    try {
      const counts = await getUnreadCommentCounts(user.uid, [groupId]);
      setUnreadCommentCounts(counts);
    } catch (error) {
      console.error('새 댓글 수 로드 오류:', error);
    }
  }, [user?.uid, groupId]);

  useEffect(() => {
    loadUnreadCommentCounts();
  }, [loadUnreadCommentCounts]);

  // 댓글 실시간 리스너 - 댓글 변경 시 새 댓글 수 재확인
  useEffect(() => {
    if (!groupId) return;

    const unsubscribe = nativeDb
      .collection('comments')
      .where('groupId', '==', groupId)
      .onSnapshot(
        () => {
          loadUnreadCommentCounts();
        },
        (error) => {
          console.error('댓글 실시간 리스너 오류:', error);
        }
      );

    return () => unsubscribe();
  }, [groupId, loadUnreadCommentCounts]);

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

  // 게시판 나갈 때 마지막 조회 시간 업데이트 (cleanup에서 처리)
  useFocusEffect(
    useCallback(() => {
      // 진입 시에는 아무것도 하지 않음

      // 화면을 나갈 때 마지막 조회 시간 업데이트
      return () => {
        if (user?.uid && groupId) {
          updateBoardLastViewed(user.uid, groupId);
        }
      };
    }, [user?.uid, groupId])
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
        groupId,
        groupName,
        isOwner: isOwner ? 'true' : 'false'
      }
    });
  };

  const handleCreatePost = () => {
    router.push({
      pathname: '/(tabs)/board/create',
      params: { groupId, groupName }
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="chevron-left" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {groupName || '게시판'}
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
});

// app/(tabs)/board/[postId].tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { Post, Comment } from '@/types/board';
import {
  getPostById,
  deletePost,
  pinPost,
  unpinPost,
  createComment,
  deleteComment,
  checkGroupOwnership,
  updatePostLastViewed,
} from '@/services/boardService';
import { nativeDb } from '@/config/firebase';
import CommentItem from '@/components/board/CommentItem';
import CommentForm from '@/components/board/CommentForm';

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}.${month}.${day} ${hour}:${minute}`;
}

export default function PostDetailScreen() {
  const router = useRouter();
  const { postId, groupId, groupName } = useLocalSearchParams<{
    postId: string;
    groupId: string;
    groupName: string;
  }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  const { user } = useAuth();

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isGroupOwner, setIsGroupOwner] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  // 게시글 작성자인지 확인
  const isPostAuthor = post?.authorId === user?.uid;

  const loadPost = useCallback(async () => {
    if (!postId) return;

    try {
      const result = await getPostById(postId);
      if (result.success && result.post) {
        setPost(result.post);
      }
    } catch (error) {
      console.error('게시글 로드 오류:', error);
    }
  }, [postId, user?.uid]);

  const checkOwnerStatus = useCallback(async () => {
    if (!groupId || !user?.uid) return;
    const ownerStatus = await checkGroupOwnership(groupId, user.uid);
    setIsGroupOwner(ownerStatus);
  }, [groupId, user?.uid]);

  // 게시글 로드
  useEffect(() => {
    const load = async () => {
      await Promise.all([loadPost(), checkOwnerStatus()]);
      setLoading(false);
    };
    load();
  }, [loadPost, checkOwnerStatus]);

  // 화면 포커스 시 게시글 다시 로드 (수정 후 돌아올 때 반영)
  // 화면을 나갈 때 postLastViewedAt 업데이트 (댓글 읽음 처리)
  useFocusEffect(
    useCallback(() => {
      if (!loading && postId) {
        loadPost();
      }

      // cleanup: 화면을 나갈 때 마지막 조회 시간 업데이트
      return () => {
        if (user?.uid && postId) {
          updatePostLastViewed(user.uid, postId);
        }
      };
    }, [loading, postId, loadPost, user?.uid])
  );

  // 댓글 실시간 리스너
  useEffect(() => {
    if (!postId) return;

    const unsubscribe = nativeDb
      .collection('comments')
      .where('postId', '==', postId)
      .onSnapshot(
        (snapshot) => {
          const allComments: Comment[] = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          } as Comment));

          // 작성 시간순 정렬 (오래된 것 먼저)
          allComments.sort((a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );

          setComments(allComments);
        },
        (error) => {
          console.error('댓글 실시간 리스너 오류:', error);
        }
      );

    return () => unsubscribe();
  }, [postId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPost();
    setRefreshing(false);
  };

  const handleDeletePost = () => {
    Alert.alert(
      '게시글 삭제',
      '정말로 이 게시글을 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            const result = await deletePost(postId!);
            if (result.success) {
              // 게시판 목록으로 명시적으로 이동
              router.replace({
                pathname: '/(tabs)/board',
                params: { groupId, groupName }
              });
            } else {
              Alert.alert('오류', result.error || '삭제에 실패했습니다.');
            }
          },
        },
      ]
    );
    setMenuVisible(false);
  };

  const handleEditPost = () => {
    setMenuVisible(false);
    router.push({
      pathname: '/(tabs)/board/edit/[postId]',
      params: { postId, groupId, groupName }
    });
  };

  const handleTogglePin = async () => {
    if (!post) return;
    setMenuVisible(false);

    const result = post.isPinned
      ? await unpinPost(postId!)
      : await pinPost(postId!, user!.uid);

    if (result.success) {
      await loadPost();
    } else {
      Alert.alert('오류', result.error || '작업에 실패했습니다.');
    }
  };

  const handleSubmitComment = async (content: string) => {
    if (!user || !postId || !groupId) return;

    setSubmitting(true);
    try {
      const result = await createComment({
        postId,
        groupId,
        authorId: user.uid,
        authorName: user.displayName || '익명',
        authorEmail: user.email || '',
        content,
      });

      if (result.success) {
        // 실시간 리스너가 댓글 목록을 자동 업데이트
        // 댓글 수 업데이트
        if (post) {
          setPost({ ...post, commentCount: post.commentCount + 1 });
        }
      } else {
        Alert.alert('오류', result.error || '댓글 작성에 실패했습니다.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    Alert.alert(
      '댓글 삭제',
      '정말로 이 댓글을 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteComment(commentId, postId!);
            if (result.success) {
              // 실시간 리스너가 댓글 목록을 자동 업데이트
              if (post) {
                setPost({ ...post, commentCount: Math.max(0, post.commentCount - 1) });
              }
            } else {
              Alert.alert('오류', result.error || '삭제에 실패했습니다.');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: colors.text }]}>
            게시글을 찾을 수 없습니다.
          </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.backLink, { color: colors.tint }]}>돌아가기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.replace({
              pathname: '/(tabs)/board',
              params: { groupId, groupName }
            })}
            style={styles.backButton}
          >
            <Feather name="chevron-left" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {groupName || '게시판'}
          </Text>
          {(isPostAuthor || isGroupOwner) ? (
            <TouchableOpacity
              onPress={() => setMenuVisible(!menuVisible)}
              style={styles.menuButton}
            >
              <Feather name="more-horizontal" size={24} color={colors.text} />
            </TouchableOpacity>
          ) : (
            <View style={styles.menuButton} />
          )}
        </View>

        {menuVisible && (
          <>
            <TouchableOpacity
              style={styles.menuOverlay}
              activeOpacity={1}
              onPress={() => setMenuVisible(false)}
            />
            <View style={[styles.menuDropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {isPostAuthor && (
                <TouchableOpacity style={styles.menuItem} onPress={handleEditPost}>
                  <Feather name="edit-2" size={18} color={colors.text} />
                  <Text style={[styles.menuItemText, { color: colors.text }]}>수정</Text>
                </TouchableOpacity>
              )}
              {isGroupOwner && (
                <TouchableOpacity style={styles.menuItem} onPress={handleTogglePin}>
                  <Feather name={post.isPinned ? 'bookmark' : 'bookmark'} size={18} color={colors.tint} />
                  <Text style={[styles.menuItemText, { color: colors.text }]}>
                    {post.isPinned ? '고정 해제' : '고정'}
                  </Text>
                </TouchableOpacity>
              )}
              {(isPostAuthor || isGroupOwner) && (
                <TouchableOpacity style={styles.menuItem} onPress={handleDeletePost}>
                  <Feather name="trash-2" size={18} color="#ff4444" />
                  <Text style={[styles.menuItemText, { color: '#ff4444' }]}>삭제</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.tint}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.postContainer}>
            <View style={styles.postHeader}>
              {post.isPinned && (
                <Feather name="bookmark" size={16} color={colors.tint} style={styles.pinIcon} />
              )}
              <Text style={[styles.postTitle, { color: colors.text }]}>{post.title}</Text>
            </View>

            <View style={styles.postMeta}>
              <Text style={[styles.authorName, { color: colors.text }]}>
                {post.authorName}
              </Text>
              <View style={[styles.metaDot, { backgroundColor: colors.lightGray }]} />
              <Text style={[styles.postDate, { color: colors.lightGray }]}>
                {formatDateTime(post.createdAt)}
              </Text>
            </View>

            <Text style={[styles.postContent, { color: colors.text }]}>
              {post.content}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.commentsSection}>
            <Text style={[styles.commentHeaderText, { color: colors.lightGray }]}>
              댓글 {comments.length}개
            </Text>

            {comments.length === 0 ? (
              <View style={styles.noComments}>
                <Text style={[styles.noCommentsText, { color: colors.lightGray }]}>
                  첫 번째 댓글을 남겨보세요
                </Text>
              </View>
            ) : (
              comments.map(comment => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  isAuthor={comment.authorId === user?.uid}
                  isGroupOwner={isGroupOwner}
                  onDelete={() => handleDeleteComment(comment.id)}
                  colors={colors}
                />
              ))
            )}
          </View>
        </ScrollView>

        <CommentForm
          onSubmit={handleSubmitComment}
          loading={submitting}
          colors={colors}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    marginBottom: 16,
  },
  backLink: {
    fontSize: 16,
    fontWeight: '600',
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
  menuButton: {
    padding: 4,
    width: 32,
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99,
  },
  menuDropdown: {
    position: 'absolute',
    top: 52,
    right: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
    minWidth: 140,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  menuItemText: {
    fontSize: 15,
  },
  content: {
    flex: 1,
  },
  postContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  pinIcon: {
    marginRight: 8,
    marginTop: 4,
  },
  postTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  postMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '500',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: 8,
  },
  postDate: {
    fontSize: 13,
  },
  postContent: {
    fontSize: 16,
    lineHeight: 26,
    marginTop: 20,
  },
  divider: {
    height: 8,
  },
  commentsSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  commentHeaderText: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  noComments: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  noCommentsText: {
    fontSize: 14,
  },
});

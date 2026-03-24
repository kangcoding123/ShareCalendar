// app/(tabs)/community/[postId].tsx
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
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { Post, Comment } from '@/types/board';
import { getPostById } from '@/services/boardService';
import {
  isAdmin,
  deleteCommunityPost,
  pinCommunityPost,
  unpinCommunityPost,
  createCommunityComment,
  deleteCommunityComment,
  COMMUNITY_GROUP_ID,
} from '@/services/communityService';
import { updatePostLastViewed } from '@/services/boardService';
import { nativeDb } from '@/config/firebase';
import CommentItem from '@/components/board/CommentItem';
import CommentForm from '@/components/board/CommentForm';
import AttachmentList from '@/components/board/AttachmentList';

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}.${month}.${day} ${hour}:${minute}`;
}

export default function CommunityPostDetailScreen() {
  const router = useRouter();
  const { postId, isAdmin: isAdminParam, postData } = useLocalSearchParams<{
    postId: string;
    isAdmin: string;
    postData: string;
  }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  const { user } = useAuth();

  const initialPost = React.useMemo(() => {
    if (postData) {
      try { return JSON.parse(postData) as Post; } catch { return null; }
    }
    return null;
  }, [postData]);

  const [post, setPost] = useState<Post | null>(initialPost);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(!initialPost);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  const userIsAdmin = user?.uid ? isAdmin(user.uid) : false;
  const isPostAuthor = post?.authorId === user?.uid;

  const loadPost = useCallback(async () => {
    if (!postId) return;
    try {
      const result = await getPostById(postId);
      if (result.success && result.post) {
        setPost(result.post);
      }
    } catch (error) {
      console.error('[CommunityPost] 게시글 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  // postData가 있으면 즉시 표시, 없으면 서버에서 로드
  useEffect(() => {
    setComments([]);
    if (postData) {
      try {
        setPost(JSON.parse(postData) as Post);
        setLoading(false);
      } catch {
        loadPost();
      }
    } else {
      loadPost();
    }
  }, [postId, postData]);

  useFocusEffect(
    useCallback(() => {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        router.replace('/(tabs)/community');
        return true;
      });

      return () => {
        if (user?.uid && postId) {
          updatePostLastViewed(user.uid, postId);
        }
        backHandler.remove();
      };
    }, [postId, user?.uid, router])
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

          allComments.sort((a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );

          setComments(allComments);
        },
        (error) => {
          console.error('[CommunityPost] 댓글 리스너 오류:', error);
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
            const result = await deleteCommunityPost(postId!);
            if (result.success) {
              router.replace('/(tabs)/community');
            } else {
              Alert.alert('오류', result.error || '삭제에 실패했습니다.');
            }
          },
        },
      ]
    );
    setMenuVisible(false);
  };

  const handleTogglePin = async () => {
    if (!post) return;
    setMenuVisible(false);

    const result = post.isPinned
      ? await unpinCommunityPost(postId!)
      : await pinCommunityPost(postId!, user!.uid);

    if (result.success) {
      await loadPost();
    } else {
      Alert.alert('오류', result.error || '작업에 실패했습니다.');
    }
  };

  const handleSubmitComment = async (content: string) => {
    if (!user || !postId) return;

    setSubmitting(true);
    try {
      const result = await createCommunityComment(
        postId,
        user.uid,
        user.displayName || '익명',
        user.email || '',
        content,
      );

      if (result.success) {
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
            const result = await deleteCommunityComment(commentId, postId!);
            if (result.success) {
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

  if (loading || !post) {
    if (!loading && !post) {
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
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']} />
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)/community')}
            style={styles.backButton}
          >
            <Feather name="chevron-left" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            커뮤니티
          </Text>
          {(isPostAuthor || userIsAdmin) ? (
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
              {userIsAdmin && (
                <TouchableOpacity style={styles.menuItem} onPress={handleTogglePin}>
                  <Feather name="bookmark" size={18} color={colors.tint} />
                  <Text style={[styles.menuItemText, { color: colors.text }]}>
                    {post.isPinned ? '고정 해제' : '공지로 고정'}
                  </Text>
                </TouchableOpacity>
              )}
              {isPostAuthor && (
                <TouchableOpacity style={styles.menuItem} onPress={() => {
                  setMenuVisible(false);
                  router.push({
                    pathname: '/(tabs)/community-edit/[postId]',
                    params: { postId: postId! }
                  });
                }}>
                  <Feather name="edit-2" size={18} color={colors.tint} />
                  <Text style={[styles.menuItemText, { color: colors.text }]}>수정</Text>
                </TouchableOpacity>
              )}
              {(isPostAuthor || userIsAdmin) && (
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

            {post.attachments && post.attachments.length > 0 && (
              <AttachmentList attachments={post.attachments} colors={colors} />
            )}
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
                  isGroupOwner={userIsAdmin}
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

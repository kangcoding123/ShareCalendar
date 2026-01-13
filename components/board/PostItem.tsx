// components/board/PostItem.tsx
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Post } from '@/types/board';

interface PostItemProps {
  post: Post;
  onPress: () => void;
  colors: any;
  hasNewComment?: boolean;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return '방금 전';
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

function isNewPost(createdAt: string): boolean {
  const postDate = new Date(createdAt);
  const now = new Date();
  const diffHours = (now.getTime() - postDate.getTime()) / (1000 * 60 * 60);
  return diffHours <= 24;
}

export default function PostItem({ post, onPress, colors, hasNewComment = false }: PostItemProps) {
  const commentColor = hasNewComment ? '#FF3B30' : colors.lightGray;
  const showNewDot = isNewPost(post.createdAt);

  return (
    <TouchableOpacity
      style={[styles.container, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={styles.contentContainer}>
        <View style={styles.titleRow}>
          {post.isPinned && (
            <Feather name="bookmark" size={14} color={colors.tint} style={styles.pinIcon} />
          )}
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {post.title}
          </Text>
          {showNewDot && (
            <Text style={styles.newIcon}>✨</Text>
          )}
        </View>

        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: colors.lightGray }]}>
            {post.authorName}
          </Text>
          <View style={[styles.dot, { backgroundColor: colors.lightGray }]} />
          <Text style={[styles.meta, { color: colors.lightGray }]}>
            {formatRelativeTime(post.createdAt)}
          </Text>
          {post.commentCount > 0 && (
            <>
              <View style={[styles.dot, { backgroundColor: colors.lightGray }]} />
              <View style={styles.commentCount}>
                <Feather name="message-circle" size={13} color={commentColor} />
                <Text style={[styles.commentCountText, { color: commentColor }]}>
                  {post.commentCount}
                </Text>
              </View>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contentContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinIcon: {
    marginRight: 6,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.3,
  },
  newIcon: {
    fontSize: 14,
    marginLeft: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  meta: {
    fontSize: 13,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: 8,
  },
  commentCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commentCountText: {
    fontSize: 13,
  },
});

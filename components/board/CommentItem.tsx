// components/board/CommentItem.tsx
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Comment } from '@/types/board';

interface CommentItemProps {
  comment: Comment;
  isAuthor: boolean;
  isGroupOwner: boolean;
  onDelete: () => void;
  colors: any;
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

export default function CommentItem({
  comment,
  isAuthor,
  isGroupOwner,
  onDelete,
  colors,
}: CommentItemProps) {
  const canDelete = isAuthor || isGroupOwner;

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.authorInfo}>
          <View style={[styles.avatar, { backgroundColor: colors.tint + '15' }]}>
            <Text style={[styles.avatarText, { color: colors.tint }]}>
              {comment.authorName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.authorMeta}>
            <Text style={[styles.authorName, { color: colors.text }]}>
              {comment.authorName}
            </Text>
            <View style={[styles.dot, { backgroundColor: colors.lightGray }]} />
            <Text style={[styles.date, { color: colors.lightGray }]}>
              {formatRelativeTime(comment.createdAt)}
            </Text>
          </View>
        </View>

        {canDelete && (
          <TouchableOpacity onPress={onDelete} style={styles.deleteButton} activeOpacity={0.6}>
            <Feather name="x" size={18} color={colors.lightGray} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.content, { color: colors.text }]}>
        {comment.content}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '600',
  },
  authorMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  authorName: {
    fontSize: 14,
    fontWeight: '600',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: 8,
  },
  date: {
    fontSize: 13,
  },
  deleteButton: {
    padding: 6,
    marginRight: -6,
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    marginLeft: 44,
  },
});

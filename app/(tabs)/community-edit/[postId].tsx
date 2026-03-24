// app/(tabs)/community-edit/[postId].tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getPostById } from '@/services/boardService';
import { updateCommunityPost, COMMUNITY_GROUP_ID } from '@/services/communityService';
import { uploadFiles, deleteFile } from '@/services/fileService';
import { Attachment, PendingAttachment } from '@/types/board';
import AttachmentPicker from '@/components/board/AttachmentPicker';

const MAX_TITLE_LENGTH = 100;
const MAX_CONTENT_LENGTH = 2000;

export default function CommunityEditScreen() {
  const router = useRouter();
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [originalTitle, setOriginalTitle] = useState('');
  const [originalContent, setOriginalContent] = useState('');

  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [removedAttachments, setRemovedAttachments] = useState<Attachment[]>([]);
  const [originalAttachments, setOriginalAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    const loadPost = async () => {
      if (!postId) return;

      const result = await getPostById(postId);
      if (result.success && result.post) {
        setTitle(result.post.title);
        setContent(result.post.content);
        setOriginalTitle(result.post.title);
        setOriginalContent(result.post.content);

        const attachments = result.post.attachments || [];
        setExistingAttachments(attachments);
        setOriginalAttachments(attachments);
      }
      setLoading(false);
    };

    loadPost();
  }, [postId]);

  const hasAttachmentChanges =
    pendingAttachments.length > 0 ||
    removedAttachments.length > 0 ||
    existingAttachments.length !== originalAttachments.length;

  const hasChanges = title !== originalTitle || content !== originalContent || hasAttachmentChanges;

  useFocusEffect(
    useCallback(() => {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        if (hasChanges) {
          Alert.alert(
            '수정 취소',
            '변경사항이 있습니다. 정말로 취소하시겠습니까?',
            [
              { text: '계속 수정', style: 'cancel' },
              {
                text: '취소',
                style: 'destructive',
                onPress: () => router.replace({
                  pathname: '/(tabs)/community/[postId]',
                  params: { postId }
                })
              },
            ]
          );
        } else {
          router.replace({
            pathname: '/(tabs)/community/[postId]',
            params: { postId }
          });
        }
        return true;
      });

      return () => backHandler.remove();
    }, [hasChanges, postId, router])
  );

  const canSubmit = title.trim().length > 0 && content.trim().length > 0 && hasChanges && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !postId) return;

    setSubmitting(true);
    try {
      let newAttachments: Attachment[] = [];
      if (pendingAttachments.length > 0) {
        try {
          newAttachments = await uploadFiles(
            pendingAttachments,
            COMMUNITY_GROUP_ID,
            postId,
            (fileId, progress) => {
              setPendingAttachments((prev) =>
                prev.map((att) =>
                  att.id === fileId ? { ...att, uploadProgress: progress } : att
                )
              );
            }
          );
        } catch (uploadError: any) {
          Alert.alert('오류', '파일 업로드에 실패했습니다: ' + uploadError.message);
          setSubmitting(false);
          return;
        }
      }

      for (const removed of removedAttachments) {
        try {
          await deleteFile(removed.storagePath);
        } catch (deleteError) {
          console.error('파일 삭제 오류:', deleteError);
        }
      }

      const finalAttachments = [...existingAttachments, ...newAttachments];

      const result = await updateCommunityPost(
        postId,
        {
          title: title.trim(),
          content: content.trim(),
        },
        finalAttachments
      );

      if (result.success) {
        router.replace({
          pathname: '/(tabs)/community/[postId]',
          params: { postId }
        });
      } else {
        Alert.alert('오류', result.error || '게시글 수정에 실패했습니다.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddAttachment = (attachment: PendingAttachment) => {
    setPendingAttachments((prev) => [...prev, attachment]);
  };

  const handleRemovePending = (id: string) => {
    setPendingAttachments((prev) => prev.filter((att) => att.id !== id));
  };

  const handleRemoveExisting = (id: string) => {
    const removed = existingAttachments.find((att) => att.id === id);
    if (removed) {
      setRemovedAttachments((prev) => [...prev, removed]);
      setExistingAttachments((prev) => prev.filter((att) => att.id !== id));
    }
  };

  const goBackToPost = () => {
    router.replace({
      pathname: '/(tabs)/community/[postId]',
      params: { postId }
    });
  };

  const handleCancel = () => {
    if (hasChanges) {
      Alert.alert(
        '수정 취소',
        '변경사항이 있습니다. 정말로 취소하시겠습니까?',
        [
          { text: '계속 수정', style: 'cancel' },
          { text: '취소', style: 'destructive', onPress: goBackToPost },
        ]
      );
    } else {
      goBackToPost();
    }
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCancel} style={styles.cancelButton} activeOpacity={0.6}>
            <Text style={[styles.cancelText, { color: colors.lightGray }]}>취소</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>글 수정</Text>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[styles.submitButton, { backgroundColor: canSubmit ? colors.tint : colors.border }]}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitText}>완료</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
          <TextInput
            style={[styles.titleInput, { color: colors.text }]}
            value={title}
            onChangeText={setTitle}
            placeholder="제목"
            placeholderTextColor={colors.lightGray}
            maxLength={MAX_TITLE_LENGTH}
          />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <TextInput
            style={[styles.contentInput, { color: colors.text }]}
            value={content}
            onChangeText={setContent}
            placeholder="내용을 입력하세요"
            placeholderTextColor={colors.lightGray}
            maxLength={MAX_CONTENT_LENGTH}
            multiline
            textAlignVertical="top"
          />
          <Text style={[styles.charCount, { color: colors.lightGray }]}>
            {content.length}/{MAX_CONTENT_LENGTH}
          </Text>

          <AttachmentPicker
            pendingAttachments={pendingAttachments}
            existingAttachments={existingAttachments}
            onAddAttachment={handleAddAttachment}
            onRemovePending={handleRemovePending}
            onRemoveExisting={handleRemoveExisting}
            colors={colors}
            disabled={submitting}
          />
        </ScrollView>
      </KeyboardAvoidingView>
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
  keyboardAvoid: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cancelText: {
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  submitButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },
  submitText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  form: {
    flex: 1,
    paddingHorizontal: 20,
  },
  titleInput: {
    fontSize: 20,
    fontWeight: '600',
    paddingVertical: 16,
    letterSpacing: -0.3,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  contentInput: {
    fontSize: 16,
    lineHeight: 24,
    paddingVertical: 8,
    minHeight: 200,
  },
  charCount: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 16,
    marginBottom: 32,
  },
});

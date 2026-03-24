// app/(tabs)/community/create.tsx
import React, { useState, useCallback, useRef, useEffect } from 'react';
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
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { createCommunityPost, COMMUNITY_GROUP_ID } from '@/services/communityService';
import { uploadFiles } from '@/services/fileService';
import { PendingAttachment } from '@/types/board';
import AttachmentPicker from '@/components/board/AttachmentPicker';

const MAX_TITLE_LENGTH = 100;
const MAX_CONTENT_LENGTH = 2000;

export default function CommunityCreateScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);

  const titleRef = useRef('');
  const contentRef = useRef('');
  const attachmentsRef = useRef<PendingAttachment[]>([]);

  useEffect(() => {
    titleRef.current = title;
    contentRef.current = content;
    attachmentsRef.current = pendingAttachments;
  }, [title, content, pendingAttachments]);

  useFocusEffect(
    useCallback(() => {
      setTitle('');
      setContent('');
      setSubmitting(false);
      setPendingAttachments([]);
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        if (titleRef.current.trim() || contentRef.current.trim() || attachmentsRef.current.length > 0) {
          Alert.alert(
            '작성 취소',
            '작성 중인 내용이 있습니다. 정말로 취소하시겠습니까?',
            [
              { text: '계속 작성', style: 'cancel' },
              {
                text: '취소',
                style: 'destructive',
                onPress: () => router.replace('/(tabs)/community')
              },
            ]
          );
        } else {
          router.replace('/(tabs)/community');
        }
        return true;
      });

      return () => backHandler.remove();
    }, [router])
  );

  const canSubmit = title.trim().length > 0 && content.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;

    setSubmitting(true);
    try {
      const tempPostId = `temp_${Date.now()}`;

      let uploadedAttachments = undefined;
      if (pendingAttachments.length > 0) {
        try {
          uploadedAttachments = await uploadFiles(
            pendingAttachments,
            COMMUNITY_GROUP_ID,
            tempPostId,
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

      const result = await createCommunityPost(
        user.uid,
        user.displayName || '익명',
        user.email || '',
        title.trim(),
        content.trim(),
        uploadedAttachments
      );

      if (result.success) {
        router.replace('/(tabs)/community');
      } else {
        Alert.alert('오류', result.error || '게시글 작성에 실패했습니다.');
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

  const handleCancel = () => {
    if (title.trim() || content.trim() || pendingAttachments.length > 0) {
      Alert.alert(
        '작성 취소',
        '작성 중인 내용이 있습니다. 정말로 취소하시겠습니까?',
        [
          { text: '계속 작성', style: 'cancel' },
          { text: '취소', style: 'destructive', onPress: () => router.replace('/(tabs)/community') },
        ]
      );
    } else {
      router.replace('/(tabs)/community');
    }
  };

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
          <Text style={[styles.headerTitle, { color: colors.text }]}>새 게시글</Text>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[styles.submitButton, { backgroundColor: canSubmit ? colors.tint : colors.border }]}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitText}>게시</Text>
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
            onAddAttachment={handleAddAttachment}
            onRemovePending={handleRemovePending}
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

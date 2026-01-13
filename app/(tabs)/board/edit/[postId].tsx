// app/(tabs)/board/edit/[postId].tsx
import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getPostById, updatePost } from '@/services/boardService';

const MAX_TITLE_LENGTH = 100;
const MAX_CONTENT_LENGTH = 2000;

export default function EditPostScreen() {
  const router = useRouter();
  const { postId, groupId, groupName } = useLocalSearchParams<{
    postId: string;
    groupId: string;
    groupName: string;
  }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [originalTitle, setOriginalTitle] = useState('');
  const [originalContent, setOriginalContent] = useState('');

  useEffect(() => {
    const loadPost = async () => {
      if (!postId) return;

      const result = await getPostById(postId);
      if (result.success && result.post) {
        setTitle(result.post.title);
        setContent(result.post.content);
        setOriginalTitle(result.post.title);
        setOriginalContent(result.post.content);
      }
      setLoading(false);
    };

    loadPost();
  }, [postId]);

  const hasChanges = title !== originalTitle || content !== originalContent;
  const canSubmit = title.trim().length > 0 && content.trim().length > 0 && hasChanges && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !postId) return;

    setSubmitting(true);
    try {
      const result = await updatePost(postId, {
        title: title.trim(),
        content: content.trim(),
      });

      if (result.success) {
        // 게시글 상세로 돌아가기
        router.replace({
          pathname: '/(tabs)/board/[postId]',
          params: { postId, groupId, groupName }
        });
      } else {
        Alert.alert('오류', result.error || '게시글 수정에 실패했습니다.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const goBackToPost = () => {
    router.replace({
      pathname: '/(tabs)/board/[postId]',
      params: { postId, groupId, groupName }
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
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={handleCancel} style={styles.cancelButton}>
            <Text style={[styles.cancelText, { color: colors.text }]}>취소</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>글 수정</Text>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={styles.submitButton}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={colors.tint} />
            ) : (
              <Text style={[
                styles.submitText,
                { color: canSubmit ? colors.tint : colors.lightGray }
              ]}>
                완료
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>제목</Text>
            <TextInput
              style={[styles.titleInput, {
                backgroundColor: colors.card,
                color: colors.text,
                borderColor: colors.border,
              }]}
              value={title}
              onChangeText={setTitle}
              placeholder="제목을 입력하세요"
              placeholderTextColor={colors.lightGray}
              maxLength={MAX_TITLE_LENGTH}
            />
            <Text style={[styles.charCount, { color: colors.lightGray }]}>
              {title.length}/{MAX_TITLE_LENGTH}
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>내용</Text>
            <TextInput
              style={[styles.contentInput, {
                backgroundColor: colors.card,
                color: colors.text,
                borderColor: colors.border,
              }]}
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
          </View>
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
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  cancelButton: {
    padding: 4,
  },
  cancelText: {
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  submitButton: {
    padding: 4,
    minWidth: 50,
    alignItems: 'flex-end',
  },
  submitText: {
    fontSize: 16,
    fontWeight: '600',
  },
  form: {
    flex: 1,
    padding: 16,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  titleInput: {
    fontSize: 16,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  contentInput: {
    fontSize: 16,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 200,
  },
  charCount: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 8,
  },
});

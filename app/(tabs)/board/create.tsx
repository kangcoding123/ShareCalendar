// app/(tabs)/board/create.tsx
import React, { useState, useCallback } from 'react';
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
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { createPost } from '@/services/boardService';

const MAX_TITLE_LENGTH = 100;
const MAX_CONTENT_LENGTH = 2000;

export default function CreatePostScreen() {
  const router = useRouter();
  const { groupId, groupName } = useLocalSearchParams<{ groupId: string; groupName: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 화면에 진입할 때마다 폼 초기화
  useFocusEffect(
    useCallback(() => {
      setTitle('');
      setContent('');
      setSubmitting(false);
    }, [])
  );

  const canSubmit = title.trim().length > 0 && content.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !user || !groupId) return;

    setSubmitting(true);
    try {
      const result = await createPost({
        groupId,
        authorId: user.uid,
        authorName: user.displayName || '익명',
        authorEmail: user.email || '',
        title: title.trim(),
        content: content.trim(),
      });

      if (result.success) {
        // 게시판 목록으로 명시적으로 이동
        router.replace({
          pathname: '/(tabs)/board',
          params: { groupId, groupName }
        });
      } else {
        Alert.alert('오류', result.error || '게시글 작성에 실패했습니다.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const goBackToBoard = () => {
    router.replace({
      pathname: '/(tabs)/board',
      params: { groupId, groupName }
    });
  };

  const handleCancel = () => {
    if (title.trim() || content.trim()) {
      Alert.alert(
        '작성 취소',
        '작성 중인 내용이 있습니다. 정말로 취소하시겠습니까?',
        [
          { text: '계속 작성', style: 'cancel' },
          { text: '취소', style: 'destructive', onPress: goBackToBoard },
        ]
      );
    } else {
      goBackToBoard();
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

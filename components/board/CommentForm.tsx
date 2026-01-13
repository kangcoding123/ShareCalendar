// components/board/CommentForm.tsx
import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

interface CommentFormProps {
  onSubmit: (content: string) => void;
  loading: boolean;
  colors: any;
}

export default function CommentForm({ onSubmit, loading, colors }: CommentFormProps) {
  const [content, setContent] = useState('');

  const handleSubmit = () => {
    const trimmed = content.trim();
    if (trimmed && !loading) {
      onSubmit(trimmed);
      setContent('');
    }
  };

  const canSubmit = content.trim().length > 0 && !loading;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
      <View style={[styles.inputWrapper, { backgroundColor: colors.card }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          value={content}
          onChangeText={setContent}
          placeholder="댓글을 입력하세요..."
          placeholderTextColor={colors.lightGray}
          multiline
          maxLength={500}
          editable={!loading}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            { opacity: canSubmit ? 1 : 0.4 },
          ]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.tint} />
          ) : (
            <Feather name="arrow-up-circle" size={32} color={colors.tint} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 22,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    minHeight: 32,
    maxHeight: 100,
    paddingVertical: 6,
    fontSize: 15,
    lineHeight: 20,
  },
  sendButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

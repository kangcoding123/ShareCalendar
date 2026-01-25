// components/board/AttachmentPicker.tsx
// 파일 첨부 선택 및 미리보기 컴포넌트

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PendingAttachment, Attachment } from '@/types/board';
import {
  pickImage,
  pickDocument,
  validateFile,
  formatFileSize,
  getFileIcon,
  MAX_ATTACHMENTS,
} from '@/services/fileService';

interface AttachmentPickerProps {
  pendingAttachments: PendingAttachment[];
  existingAttachments?: Attachment[];
  onAddAttachment: (attachment: PendingAttachment) => void;
  onRemovePending: (id: string) => void;
  onRemoveExisting?: (id: string) => void;
  colors: any;
  disabled?: boolean;
}

export default function AttachmentPicker({
  pendingAttachments,
  existingAttachments = [],
  onAddAttachment,
  onRemovePending,
  onRemoveExisting,
  colors,
  disabled = false,
}: AttachmentPickerProps) {
  const [isLoading, setIsLoading] = useState(false);

  const totalCount = pendingAttachments.length + existingAttachments.length;
  const canAddMore = totalCount < MAX_ATTACHMENTS;

  const handlePickImage = async (source: 'gallery' | 'camera') => {
    if (!canAddMore) {
      Alert.alert('알림', `첨부 파일은 최대 ${MAX_ATTACHMENTS}개까지 가능합니다.`);
      return;
    }

    setIsLoading(true);
    try {
      const result = await pickImage(source);
      if (result) {
        const validation = validateFile(
          {
            uri: result.uri,
            fileName: result.fileName,
            fileSize: result.fileSize,
            mimeType: result.mimeType,
          },
          totalCount
        );

        if (!validation.valid) {
          Alert.alert('알림', validation.error);
          return;
        }

        onAddAttachment(result);
      }
    } catch (error: any) {
      Alert.alert('오류', error.message || '이미지를 선택하는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePickDocument = async () => {
    if (!canAddMore) {
      Alert.alert('알림', `첨부 파일은 최대 ${MAX_ATTACHMENTS}개까지 가능합니다.`);
      return;
    }

    setIsLoading(true);
    try {
      const result = await pickDocument();
      if (result) {
        const validation = validateFile(
          {
            uri: result.uri,
            fileName: result.fileName,
            fileSize: result.fileSize,
            mimeType: result.mimeType,
          },
          totalCount
        );

        if (!validation.valid) {
          Alert.alert('알림', validation.error);
          return;
        }

        onAddAttachment(result);
      }
    } catch (error: any) {
      Alert.alert('오류', error.message || '파일을 선택하는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const showPickerOptions = () => {
    Alert.alert(
      '파일 첨부',
      '첨부할 파일을 선택하세요',
      [
        { text: '사진 촬영', onPress: () => handlePickImage('camera') },
        { text: '갤러리에서 선택', onPress: () => handlePickImage('gallery') },
        { text: '파일 선택', onPress: handlePickDocument },
        { text: '취소', style: 'cancel' },
      ]
    );
  };

  const renderPendingItem = (item: PendingAttachment) => (
    <View key={item.id} style={[styles.attachmentItem, { backgroundColor: colors.inputBackground }]}>
      <View style={[styles.fileIconContainer, { backgroundColor: colors.tint + '20' }]}>
        <Feather name={getFileIcon(item.fileType) as any} size={24} color={colors.tint} />
      </View>
      <View style={styles.fileInfo}>
        <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
          {item.fileName}
        </Text>
        <Text style={[styles.fileSize, { color: colors.lightGray }]}>
          {formatFileSize(item.fileSize)}
        </Text>
        {item.uploadProgress !== undefined && item.uploadProgress < 100 && (
          <View style={styles.progressContainer}>
            <View
              style={[
                styles.progressBar,
                { backgroundColor: colors.tint, width: `${item.uploadProgress}%` },
              ]}
            />
          </View>
        )}
      </View>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => onRemovePending(item.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Feather name="x-circle" size={20} color={colors.lightGray} />
      </TouchableOpacity>
    </View>
  );

  const renderExistingItem = (item: Attachment) => (
    <View key={item.id} style={[styles.attachmentItem, { backgroundColor: colors.inputBackground }]}>
      <View style={[styles.fileIconContainer, { backgroundColor: colors.tint + '20' }]}>
        <Feather name={getFileIcon(item.fileType) as any} size={24} color={colors.tint} />
      </View>
      <View style={styles.fileInfo}>
        <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
          {item.fileName}
        </Text>
        <Text style={[styles.fileSize, { color: colors.lightGray }]}>
          {formatFileSize(item.fileSize)}
        </Text>
      </View>
      {onRemoveExisting && (
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => onRemoveExisting(item.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="x-circle" size={20} color={colors.lightGray} />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* 첨부 버튼 */}
      <TouchableOpacity
        style={[
          styles.addButton,
          { borderColor: colors.border },
          !canAddMore && styles.addButtonDisabled,
        ]}
        onPress={showPickerOptions}
        disabled={disabled || isLoading || !canAddMore}
        activeOpacity={0.6}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.tint} />
        ) : (
          <>
            <Feather name="paperclip" size={18} color={canAddMore ? colors.tint : colors.lightGray} />
            <Text style={[styles.addButtonText, { color: canAddMore ? colors.tint : colors.lightGray }]}>
              파일 첨부 ({totalCount}/{MAX_ATTACHMENTS})
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* 첨부 파일 목록 */}
      {(existingAttachments.length > 0 || pendingAttachments.length > 0) && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.attachmentList}
          contentContainerStyle={styles.attachmentListContent}
        >
          {existingAttachments.map(renderExistingItem)}
          {pendingAttachments.map(renderPendingItem)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    gap: 8,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  attachmentList: {
    marginTop: 12,
  },
  attachmentListContent: {
    gap: 10,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    width: 200,
  },
  fileIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfo: {
    flex: 1,
    marginLeft: 10,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '500',
  },
  fileSize: {
    fontSize: 11,
    marginTop: 2,
  },
  progressContainer: {
    height: 3,
    backgroundColor: '#e0e0e0',
    borderRadius: 1.5,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 1.5,
  },
  removeButton: {
    padding: 4,
  },
});

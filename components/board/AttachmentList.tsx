// components/board/AttachmentList.tsx
// 게시글 상세 화면에서 첨부파일 표시 컴포넌트

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  Image,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Attachment } from '@/types/board';
import { formatFileSize, getFileIcon } from '@/services/fileService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AttachmentListProps {
  attachments: Attachment[];
  colors: any;
}

export default function AttachmentList({ attachments, colors }: AttachmentListProps) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<Attachment | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const insets = useSafeAreaInsets();

  // 파일 옵션 모달 상태
  const [fileOptionVisible, setFileOptionVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ attachment: Attachment; downloadUri?: string } | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // 결과 알림 모달 상태
  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [resultModalData, setResultModalData] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
  } | null>(null);

  // 결과 알림 모달 표시
  const showResultModal = (type: 'success' | 'error', title: string, message: string) => {
    setResultModalData({ type, title, message });
    setResultModalVisible(true);
  };

  // 결과 알림 모달 닫기
  const closeResultModal = () => {
    setResultModalVisible(false);
    setResultModalData(null);
  };

  if (!attachments || attachments.length === 0) {
    return null;
  }

  // 이미지 미리보기 열기
  const openImagePreview = (attachment: Attachment) => {
    setPreviewImage(attachment);
    setPreviewVisible(true);
    setImageLoading(true);
  };

  // 이미지 미리보기 닫기
  const closeImagePreview = () => {
    setPreviewVisible(false);
    setTimeout(() => {
      setPreviewImage(null);
    }, 300);
  };

  // 파일 옵션 모달 닫기
  const closeFileOptionModal = () => {
    setFileOptionVisible(false);
    setSelectedFile(null);
  };

  // 파일 다운로드 후 URI 반환
  const downloadToCache = async (attachment: Attachment): Promise<string | undefined> => {
    try {
      setIsDownloading(true);
      const localUri = FileSystem.cacheDirectory + attachment.fileName;
      const downloadResult = await FileSystem.downloadAsync(attachment.url, localUri);
      if (downloadResult.status === 200) {
        return downloadResult.uri;
      }
      return undefined;
    } catch (error) {
      console.error('다운로드 오류:', error);
      return undefined;
    } finally {
      setIsDownloading(false);
    }
  };

  // 파일 열기 핸들러
  const handleOpenFile = async () => {
    if (!selectedFile) return;
    const attachment = selectedFile.attachment;
    closeFileOptionModal();

    try {
      // 이미 다운로드된 URI가 있으면 사용, 없으면 다운로드
      let uri = selectedFile.downloadUri;
      if (!uri) {
        uri = await downloadToCache(attachment);
        if (!uri) {
          Alert.alert('오류', '파일 다운로드에 실패했습니다.');
          return;
        }
      }

      const contentUri = await FileSystem.getContentUriAsync(uri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        type: attachment.mimeType,
        flags: 1,
      });
    } catch (intentError) {
      console.log('뷰어 앱 없음:', intentError);
      Alert.alert('알림', '이 파일을 열 수 있는 앱이 없습니다.');
    }
  };

  // 파일 저장 핸들러 (모달에서 호출)
  const handleSaveFile = async () => {
    if (!selectedFile) return;
    const attachment = selectedFile.attachment;
    closeFileOptionModal();

    try {
      // 이미 다운로드된 URI가 있으면 사용, 없으면 다운로드
      let uri = selectedFile.downloadUri;
      if (!uri) {
        uri = await downloadToCache(attachment);
        if (!uri) {
          Alert.alert('오류', '파일 다운로드에 실패했습니다.');
          return;
        }
      }

      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted) {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const savedUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          attachment.fileName,
          attachment.mimeType
        );
        await FileSystem.writeAsStringAsync(savedUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        try {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        } catch (e) {}
        showResultModal('success', '저장 완료', '파일이 선택한 폴더에 저장되었습니다.');
      }
    } catch (saveError) {
      console.log('저장 오류:', saveError);
      showResultModal('error', '오류', '파일 저장 중 오류가 발생했습니다.');
    }
  };

  // 이미지 미리보기에서 직접 저장 (Android: SAF, iOS: Sharing)
  const saveFromPreview = async (attachment: Attachment) => {
    try {
      setDownloading(attachment.id);

      const localUri = FileSystem.cacheDirectory + attachment.fileName;
      const downloadResult = await FileSystem.downloadAsync(attachment.url, localUri);

      if (downloadResult.status !== 200) {
        Alert.alert('오류', '파일 다운로드에 실패했습니다.');
        return;
      }

      if (Platform.OS === 'android') {
        // Android: StorageAccessFramework로 폴더 선택 후 저장
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const base64 = await FileSystem.readAsStringAsync(downloadResult.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const savedUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            attachment.fileName,
            attachment.mimeType
          );
          await FileSystem.writeAsStringAsync(savedUri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          try {
            await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true });
          } catch (e) {}
          showResultModal('success', '저장 완료', '파일이 선택한 폴더에 저장되었습니다.');
        }
      } else {
        // iOS: 공유 시트
        const isAvailable = await Sharing.isAvailableAsync();
        if (!isAvailable) {
          Alert.alert('알림', '이 기기에서는 파일 저장 기능을 사용할 수 없습니다.');
          return;
        }
        await Sharing.shareAsync(downloadResult.uri, {
          mimeType: attachment.mimeType,
          dialogTitle: `${attachment.fileName} 저장`,
        });
      }
    } catch (error) {
      console.error('저장 오류:', error);
      Alert.alert('오류', '파일 저장 중 오류가 발생했습니다.');
    } finally {
      setDownloading(null);
    }
  };

  // 파일 공유 핸들러
  const handleShareFile = async () => {
    if (!selectedFile) return;
    const attachment = selectedFile.attachment;
    closeFileOptionModal();

    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('알림', '이 기기에서는 공유 기능을 사용할 수 없습니다.');
        return;
      }

      // 이미 다운로드된 URI가 있으면 사용, 없으면 다운로드
      let uri = selectedFile.downloadUri;
      if (!uri) {
        uri = await downloadToCache(attachment);
        if (!uri) {
          Alert.alert('오류', '파일 다운로드에 실패했습니다.');
          return;
        }
      }

      await Sharing.shareAsync(uri, {
        mimeType: attachment.mimeType,
        dialogTitle: attachment.fileName,
      });
    } catch (error) {
      console.error('공유 오류:', error);
      Alert.alert('오류', '파일 공유 중 오류가 발생했습니다.');
    }
  };

  // 파일 클릭 핸들러 (이미지는 미리보기, 나머지는 옵션)
  const handleFilePress = (attachment: Attachment) => {
    if (attachment.fileType === 'image') {
      openImagePreview(attachment);
    } else {
      showFileOptions(attachment);
    }
  };

  // 파일 다운로드 (저장)
  const downloadFile = async (attachment: Attachment) => {
    try {
      setDownloading(attachment.id);

      // 파일을 캐시 디렉토리에 다운로드
      const localUri = FileSystem.cacheDirectory + attachment.fileName;
      const downloadResult = await FileSystem.downloadAsync(
        attachment.url,
        localUri
      );

      if (downloadResult.status !== 200) {
        Alert.alert('오류', '파일 다운로드에 실패했습니다.');
        return;
      }

      if (Platform.OS === 'android') {
        // Android: 모든 파일 타입에 대해 커스텀 모달로 열기/저장/공유 옵션 제공
        // (MediaLibrary 권한 불필요 - Google Play 정책 준수)
        setSelectedFile({ attachment, downloadUri: downloadResult.uri });
        setFileOptionVisible(true);
      } else {
        // iOS: 공유 시트를 통해 저장
        const isAvailable = await Sharing.isAvailableAsync();
        if (!isAvailable) {
          Alert.alert('알림', '이 기기에서는 파일 저장 기능을 사용할 수 없습니다.');
          return;
        }

        await Sharing.shareAsync(downloadResult.uri, {
          mimeType: attachment.mimeType,
          dialogTitle: `${attachment.fileName} 저장`,
        });
      }
    } catch (error) {
      console.error('다운로드 오류:', error);
      Alert.alert('오류', '파일 저장 중 오류가 발생했습니다.');
    } finally {
      setDownloading(null);
    }
  };

  // 파일 공유
  const shareFile = async (attachment: Attachment) => {
    try {
      setSharing(attachment.id);

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('알림', '이 기기에서는 공유 기능을 사용할 수 없습니다.');
        return;
      }

      const localUri = FileSystem.cacheDirectory + attachment.fileName;
      const downloadResult = await FileSystem.downloadAsync(
        attachment.url,
        localUri
      );

      if (downloadResult.status === 200) {
        await Sharing.shareAsync(downloadResult.uri, {
          mimeType: attachment.mimeType,
          dialogTitle: attachment.fileName,
        });
      } else {
        Alert.alert('오류', '파일 다운로드에 실패했습니다.');
      }
    } catch (error) {
      console.error('공유 오류:', error);
      Alert.alert('오류', '파일 공유 중 오류가 발생했습니다.');
    } finally {
      setSharing(null);
    }
  };

  const showFileOptions = (attachment: Attachment) => {
    // 커스텀 모달로 파일 옵션 표시
    setSelectedFile({ attachment });
    setFileOptionVisible(true);
  };

  return (
    <View style={styles.container}>
      {/* 모든 파일 목록 - 아이콘+파일명 형식으로 통일 */}
      <View style={styles.fileList}>
        {attachments.map((attachment) => (
          <TouchableOpacity
            key={attachment.id}
            style={[styles.fileItem, { backgroundColor: colors.inputBackground }]}
            onPress={() => handleFilePress(attachment)}
            activeOpacity={0.6}
          >
            <View style={[styles.fileIconContainer, { backgroundColor: colors.tint + '20' }]}>
              <Feather name={getFileIcon(attachment.fileType) as any} size={20} color={colors.tint} />
            </View>
            <View style={styles.fileInfo}>
              <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                {attachment.fileName}
              </Text>
              <Text style={[styles.fileSize, { color: colors.lightGray }]}>
                {formatFileSize(attachment.fileSize)}
              </Text>
            </View>
            {downloading === attachment.id || sharing === attachment.id ? (
              <ActivityIndicator size="small" color={colors.tint} />
            ) : (
              <Feather name="download" size={18} color={colors.lightGray} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* 이미지 미리보기 모달 */}
      <Modal
          visible={previewVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={closeImagePreview}
          statusBarTranslucent={true}
        >
          <SafeAreaView style={styles.previewContainer} edges={['top']}>
            <StatusBar barStyle="light-content" backgroundColor="rgba(0,0,0,0.95)" />

            {/* 상단 헤더 */}
            <View style={styles.previewHeader}>
              <TouchableOpacity
                style={styles.previewCloseButton}
                onPress={closeImagePreview}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="x" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {/* 이미지 영역 */}
            <View style={styles.previewImageContainer}>
              {imageLoading && (
                <View style={styles.previewLoading}>
                  <ActivityIndicator size="large" color="#ffffff" />
                </View>
              )}
              {previewImage && (
                <Image
                  source={{ uri: previewImage.url }}
                  style={styles.previewImage}
                  resizeMode="contain"
                  onLoadStart={() => setImageLoading(true)}
                  onLoadEnd={() => setImageLoading(false)}
                />
              )}
            </View>

            {/* 하단 정보 및 버튼 */}
            <View style={[styles.previewFooter, { paddingBottom: insets.bottom + 20 }]}>
              <Text style={styles.previewFileName} numberOfLines={1}>
                {previewImage?.fileName}
              </Text>
              <Text style={styles.previewFileSize}>
                {previewImage ? formatFileSize(previewImage.fileSize) : ''}
              </Text>

              <View style={styles.previewActions}>
                <TouchableOpacity
                  style={[styles.previewActionButton, { backgroundColor: colors.tint }]}
                  onPress={() => {
                    if (previewImage) {
                      closeImagePreview();
                      setTimeout(() => saveFromPreview(previewImage), 300);
                    }
                  }}
                  disabled={downloading === previewImage?.id}
                >
                  {downloading === previewImage?.id ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Feather name="download" size={18} color="#ffffff" />
                      <Text style={styles.previewActionText}>저장</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.previewActionButton, { backgroundColor: '#666666' }]}
                  onPress={() => {
                    if (previewImage) {
                      closeImagePreview();
                      setTimeout(() => shareFile(previewImage), 300);
                    }
                  }}
                  disabled={sharing === previewImage?.id}
                >
                  {sharing === previewImage?.id ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Feather name="share-2" size={18} color="#ffffff" />
                      <Text style={styles.previewActionText}>공유</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        </Modal>

      {/* 파일 옵션 모달 */}
      <Modal
        visible={fileOptionVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeFileOptionModal}
        statusBarTranslucent={true}
      >
        <View style={styles.fileOptionOverlay}>
          <TouchableOpacity
            style={styles.fileOptionBackdrop}
            activeOpacity={1}
            onPress={closeFileOptionModal}
          />
          {selectedFile && (
            <View style={[styles.fileOptionContent, { backgroundColor: colors.card }]}>
              {isDownloading ? (
                // 다운로드 중 로딩 표시
                <View style={styles.fileOptionLoading}>
                  <ActivityIndicator size="large" color={colors.tint} />
                  <Text style={[styles.fileOptionLoadingText, { color: colors.text }]}>
                    다운로드 중...
                  </Text>
                </View>
              ) : (
                <>
                  <View style={[styles.fileOptionIconContainer, { backgroundColor: colors.tint + '20' }]}>
                    <Feather name={getFileIcon(selectedFile.attachment.fileType) as any} size={32} color={colors.tint} />
                  </View>
                  <Text style={[styles.fileOptionTitle, { color: colors.text }]} numberOfLines={2}>
                    {selectedFile.attachment.fileName}
                  </Text>
                  <Text style={[styles.fileOptionSubtitle, { color: colors.lightGray }]}>
                    {formatFileSize(selectedFile.attachment.fileSize)}
                  </Text>

                  {/* 열기/저장 버튼 (가로 배치) */}
                  <View style={styles.fileOptionButtonRow}>
                    <TouchableOpacity
                      style={[styles.fileOptionActionButton, { backgroundColor: colors.tint }]}
                      onPress={handleOpenFile}
                    >
                      <Feather name="external-link" size={18} color="#ffffff" />
                      <Text style={styles.fileOptionButtonText}>열기</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.fileOptionActionButton, { backgroundColor: '#4CAF50' }]}
                      onPress={handleSaveFile}
                    >
                      <Feather name="download" size={18} color="#ffffff" />
                      <Text style={styles.fileOptionButtonText}>저장</Text>
                    </TouchableOpacity>
                  </View>

                  {/* 공유 버튼 */}
                  <TouchableOpacity
                    style={[styles.fileOptionFullButton, { backgroundColor: '#666666' }]}
                    onPress={handleShareFile}
                  >
                    <Feather name="share-2" size={18} color="#ffffff" />
                    <Text style={styles.fileOptionButtonText}>공유</Text>
                  </TouchableOpacity>

                  {/* 취소 버튼 */}
                  <TouchableOpacity
                    style={[styles.fileOptionCancelButton, { borderColor: colors.border }]}
                    onPress={closeFileOptionModal}
                  >
                    <Text style={[styles.fileOptionCancelText, { color: colors.text }]}>취소</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>
      </Modal>

      {/* 결과 알림 모달 */}
      <Modal
        visible={resultModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeResultModal}
        statusBarTranslucent={true}
      >
        <View style={styles.fileOptionOverlay}>
          <TouchableOpacity
            style={styles.fileOptionBackdrop}
            activeOpacity={1}
            onPress={closeResultModal}
          />
          {resultModalData && (
            <View style={[styles.fileOptionContent, { backgroundColor: colors.card }]}>
              <View style={[
                styles.resultIconContainer,
                { backgroundColor: resultModalData.type === 'success' ? '#4CAF5020' : '#F4433620' }
              ]}>
                <Feather
                  name={resultModalData.type === 'success' ? 'check-circle' : 'alert-circle'}
                  size={40}
                  color={resultModalData.type === 'success' ? '#4CAF50' : '#F44336'}
                />
              </View>
              <Text style={[styles.resultTitle, { color: colors.text }]}>
                {resultModalData.title}
              </Text>
              <Text style={[styles.resultMessage, { color: colors.lightGray }]}>
                {resultModalData.message}
              </Text>
              <TouchableOpacity
                style={[styles.resultButton, { backgroundColor: colors.tint }]}
                onPress={closeResultModal}
              >
                <Text style={styles.resultButtonText}>확인</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
  },
  fileList: {
    gap: 8,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
  },
  fileIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfo: {
    flex: 1,
    marginLeft: 12,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
  },
  fileSize: {
    fontSize: 12,
    marginTop: 2,
  },
  // 이미지 미리보기 모달 스타일
  previewContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 10,
  },
  previewCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewLoading: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.6,
  },
  previewFooter: {
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  previewFileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  previewFileSize: {
    fontSize: 13,
    color: '#aaaaaa',
    marginBottom: 16,
  },
  previewActions: {
    flexDirection: 'row',
    gap: 12,
  },
  previewActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  previewActionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  // 파일 옵션 모달 스타일
  fileOptionOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 20,
  },
  fileOptionBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  fileOptionContent: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fileOptionIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  fileOptionTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  fileOptionSubtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  fileOptionButtonRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    marginBottom: 12,
  },
  fileOptionActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  fileOptionFullButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
    marginBottom: 12,
  },
  fileOptionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  fileOptionCancelButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  fileOptionCancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  fileOptionLoading: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  fileOptionLoadingText: {
    fontSize: 15,
    fontWeight: '500',
    marginTop: 16,
  },
  // 결과 알림 모달 스타일
  resultIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  resultMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  resultButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  resultButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
});

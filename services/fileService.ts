// services/fileService.ts
// 파일 업로드/다운로드 서비스

import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { InteractionManager } from 'react-native';
import { firebaseStorage } from '../config/firebase';
import { Attachment, PendingAttachment } from '../types/board';

// 파일 크기 제한 (bytes)
const FILE_SIZE_LIMITS = {
  image: 7 * 1024 * 1024,      // 7MB (압축 후 기준)
  video: 20 * 1024 * 1024,     // 20MB
  document: 10 * 1024 * 1024,  // 10MB
  other: 10 * 1024 * 1024,     // 10MB
};

// 최대 첨부 파일 개수
export const MAX_ATTACHMENTS = 3;

// 파일 타입 분류
export const getFileType = (mimeType: string): 'image' | 'video' | 'document' | 'other' => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (
    mimeType === 'application/pdf' ||
    mimeType.includes('document') ||
    mimeType.includes('sheet') ||
    mimeType.includes('presentation') ||
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.ms-powerpoint' ||
    mimeType === 'text/plain'
  ) {
    return 'document';
  }
  return 'other';
};

// 파일 크기 포맷
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 파일 크기 제한 가져오기
export const getFileSizeLimit = (fileType: 'image' | 'video' | 'document' | 'other'): number => {
  return FILE_SIZE_LIMITS[fileType];
};

// 파일 유효성 검사
export const validateFile = (
  file: { uri: string; fileName: string; fileSize: number; mimeType: string },
  currentAttachmentCount: number
): { valid: boolean; error?: string } => {
  // 첨부 파일 개수 제한
  if (currentAttachmentCount >= MAX_ATTACHMENTS) {
    return {
      valid: false,
      error: `첨부 파일은 최대 ${MAX_ATTACHMENTS}개까지 가능합니다.`,
    };
  }

  const fileType = getFileType(file.mimeType);
  const sizeLimit = getFileSizeLimit(fileType);

  // 파일 크기 제한
  if (file.fileSize > sizeLimit) {
    const limitText = formatFileSize(sizeLimit);
    return {
      valid: false,
      error: `${fileType === 'image' ? '이미지' : fileType === 'video' ? '동영상' : '파일'} 크기는 ${limitText} 이하만 가능합니다.`,
    };
  }

  return { valid: true };
};

// 이미지 선택 (갤러리/카메라)
export const pickImage = async (
  source: 'gallery' | 'camera' = 'gallery'
): Promise<PendingAttachment | null> => {
  try {
    // 권한 요청
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('카메라 권한이 필요합니다.');
      }
    } else {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      console.log('[pickImage] 갤러리 권한 결과:', JSON.stringify(permissionResult));
      // iOS 14+에서는 'limited' 권한도 허용
      // status: 'granted' | 'denied' | 'undetermined'
      // accessPrivileges: 'all' | 'limited' | 'none' (iOS 14+)
      const { status, accessPrivileges, canAskAgain } = permissionResult;
      // granted 상태이거나, accessPrivileges가 limited/all이면 허용
      const hasAccess = accessPrivileges === 'limited' || accessPrivileges === 'all';
      if (status !== 'granted' && !hasAccess) {
        // 권한이 영구 거부된 경우 설정으로 이동 안내
        if (!canAskAgain) {
          throw new Error('갤러리 접근 권한이 거부되었습니다. 설정 > 앱 > WE:IN > 사진에서 권한을 허용해주세요.');
        }
        throw new Error('갤러리 접근 권한이 필요합니다.');
      }
    }

    // Android 모달 이슈 해결을 위해 InteractionManager 사용
    await new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => {
        resolve();
      });
    });

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images', 'videos'],
          quality: 1.0,  // 원본 품질 유지 (7MB 초과 시에만 압축)
          allowsEditing: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          quality: 1.0,  // 원본 품질 유지 (7MB 초과 시에만 압축)
          allowsEditing: false,
          allowsMultipleSelection: false,
        });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];
    const mimeType = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
    const fileType = getFileType(mimeType);
    const fileName = asset.fileName || `${fileType}_${Date.now()}.${mimeType.split('/')[1] || 'jpg'}`;

    const pendingAttachment: PendingAttachment = {
      id: `pending_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      uri: asset.uri,
      fileName,
      fileSize: asset.fileSize || 0,
      mimeType,
      fileType,
    };

    // 이미지인 경우 7MB 초과 시 압축
    if (fileType === 'image') {
      return await compressImageIfNeeded(pendingAttachment);
    }

    return pendingAttachment;
  } catch (error) {
    console.error('이미지 선택 오류:', error);
    throw error;
  }
};

// 문서/파일 선택
export const pickDocument = async (): Promise<PendingAttachment | null> => {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];
    const mimeType = asset.mimeType || 'application/octet-stream';
    const fileType = getFileType(mimeType);

    return {
      id: `pending_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      uri: asset.uri,
      fileName: asset.name,
      fileSize: asset.size || 0,
      mimeType,
      fileType,
    };
  } catch (error) {
    console.error('문서 선택 오류:', error);
    throw error;
  }
};

// Firebase Storage에 파일 업로드
export const uploadFile = async (
  pendingAttachment: PendingAttachment,
  groupId: string,
  postId: string,
  onProgress?: (progress: number) => void
): Promise<Attachment> => {
  try {
    const { id, uri, fileName, fileSize, mimeType, fileType } = pendingAttachment;

    // Storage 경로 생성
    const storagePath = `posts/${groupId}/${postId}/${id}_${fileName}`;
    const reference = firebaseStorage.ref(storagePath);

    // 파일 업로드
    const task = reference.putFile(uri);

    // 진행 상황 콜백
    if (onProgress) {
      task.on('state_changed', (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress(progress);
      });
    }

    // 업로드 완료 대기
    await task;

    // 다운로드 URL 가져오기
    const url = await reference.getDownloadURL();

    return {
      id,
      fileName,
      fileSize,
      mimeType,
      fileType,
      url,
      storagePath,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('파일 업로드 오류:', error);
    throw error;
  }
};

// 여러 파일 업로드
export const uploadFiles = async (
  pendingAttachments: PendingAttachment[],
  groupId: string,
  postId: string,
  onProgress?: (fileId: string, progress: number) => void
): Promise<Attachment[]> => {
  const attachments: Attachment[] = [];

  for (const pending of pendingAttachments) {
    const attachment = await uploadFile(
      pending,
      groupId,
      postId,
      (progress) => onProgress?.(pending.id, progress)
    );
    attachments.push(attachment);
  }

  return attachments;
};

// Firebase Storage에서 파일 삭제
export const deleteFile = async (storagePath: string): Promise<void> => {
  try {
    const reference = firebaseStorage.ref(storagePath);
    await reference.delete();
  } catch (error: any) {
    // 파일이 이미 없는 경우 무시
    if (error.code === 'storage/object-not-found') {
      console.log('파일이 이미 삭제됨:', storagePath);
      return;
    }
    console.error('파일 삭제 오류:', error);
    throw error;
  }
};

// 여러 파일 삭제
export const deleteFiles = async (storagePaths: string[]): Promise<void> => {
  await Promise.all(storagePaths.map((path) => deleteFile(path)));
};

// 파일 아이콘 이름 가져오기
export const getFileIcon = (fileType: 'image' | 'video' | 'document' | 'other'): string => {
  switch (fileType) {
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'document':
      return 'file-text';
    default:
      return 'file';
  }
};

// 이미지 압축 (7MB 초과 시에만)
export const compressImageIfNeeded = async (
  pendingAttachment: PendingAttachment
): Promise<PendingAttachment> => {
  // 이미지가 아니거나 7MB 이하면 그대로 반환
  if (pendingAttachment.fileType !== 'image' ||
      pendingAttachment.fileSize <= FILE_SIZE_LIMITS.image) {
    console.log(`[compressImageIfNeeded] 압축 불필요: ${formatFileSize(pendingAttachment.fileSize)}`);
    return pendingAttachment;
  }

  console.log(`[compressImageIfNeeded] 압축 시작: ${formatFileSize(pendingAttachment.fileSize)}`);

  // 7MB 초과 시 압축
  let quality = 0.8;
  let compressedUri = pendingAttachment.uri;
  let compressedSize = pendingAttachment.fileSize;

  while (compressedSize > FILE_SIZE_LIMITS.image && quality > 0.1) {
    console.log(`[compressImageIfNeeded] 압축 시도: quality=${quality}`);

    const result = await ImageManipulator.manipulateAsync(
      pendingAttachment.uri,
      [],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
    );

    // 파일 크기 확인
    const fileInfo = await FileSystem.getInfoAsync(result.uri, { size: true });
    compressedSize = (fileInfo as any).size || 0;
    compressedUri = result.uri;

    console.log(`[compressImageIfNeeded] 압축 결과: ${formatFileSize(compressedSize)}`);

    quality -= 0.1;
  }

  if (compressedSize > FILE_SIZE_LIMITS.image) {
    console.warn('[compressImageIfNeeded] 압축 후에도 7MB 초과');
  }

  return {
    ...pendingAttachment,
    uri: compressedUri,
    fileSize: compressedSize,
    mimeType: 'image/jpeg', // 압축 시 JPEG로 변환됨
  };
};

// ========== 일정(Event) 첨부파일 함수 ==========

// 일정 첨부파일 업로드
export const uploadEventFile = async (
  pendingAttachment: PendingAttachment,
  groupId: string,
  eventId: string,
  onProgress?: (progress: number) => void
): Promise<Attachment> => {
  try {
    const { id, uri, fileName, fileSize, mimeType, fileType } = pendingAttachment;

    // Storage 경로: events/{groupId}/{eventId}/{id}_{fileName}
    const storagePath = `events/${groupId}/${eventId}/${id}_${fileName}`;
    const reference = firebaseStorage.ref(storagePath);

    // 파일 업로드
    const task = reference.putFile(uri);

    // 진행 상황 콜백
    if (onProgress) {
      task.on('state_changed', (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress(progress);
      });
    }

    // 업로드 완료 대기
    await task;

    // 다운로드 URL 가져오기
    const url = await reference.getDownloadURL();

    return {
      id,
      fileName,
      fileSize,
      mimeType,
      fileType,
      url,
      storagePath,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('일정 파일 업로드 오류:', error);
    throw error;
  }
};

// 여러 일정 첨부파일 업로드
export const uploadEventFiles = async (
  pendingAttachments: PendingAttachment[],
  groupId: string,
  eventId: string,
  onProgress?: (fileId: string, progress: number) => void
): Promise<Attachment[]> => {
  const attachments: Attachment[] = [];

  for (const pending of pendingAttachments) {
    const attachment = await uploadEventFile(
      pending,
      groupId,
      eventId,
      (progress) => onProgress?.(pending.id, progress)
    );
    attachments.push(attachment);
  }

  return attachments;
};

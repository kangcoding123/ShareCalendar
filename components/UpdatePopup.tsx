// components/UpdatePopup.tsx
import React from 'react';
import { 
  Modal, 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet,
  Platform,
  ScrollView
} from 'react-native';
import { openUpdateLink, downloadAndInstallApk } from '../services/updateService';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

interface UpdatePopupProps {
  visible: boolean;
  versionInfo: any;
  isRequired: boolean;
  onClose: () => void;
}

const UpdatePopup = ({ visible, versionInfo, isRequired, onClose }: UpdatePopupProps) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];

  // versionInfo가 null이거나 undefined인 경우 렌더링하지 않음
  if (!versionInfo || !visible) {
    return null;
  }

  const handleUpdate = async () => {
    if (Platform.OS === 'ios') {
      // iOS는 TestFlight 링크로 이동
      await openUpdateLink(versionInfo.ios_testflight_url);
    } else {
      // Android는 APK 직접 다운로드 또는 링크 열기
      if (versionInfo.android_download_url?.endsWith('.apk')) {
        await downloadAndInstallApk(versionInfo.android_download_url);
      } else {
        await openUpdateLink(versionInfo.android_download_url);
      }
    }
  };

  // 플랫폼별 버전 정보 안전하게 가져오기
  const platformVersion = Platform.OS === 'ios' ? 
    versionInfo.ios_version : versionInfo.android_version;

  // 플랫폼 버전이 없으면 렌더링하지 않음
  if (!platformVersion) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => {
        if (!isRequired) onClose();
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.text }]}>
            새 버전이 출시되었습니다!
          </Text>
          
          <Text style={[styles.version, { color: colors.tint }]}>
            버전 {platformVersion}
          </Text>
          
          <ScrollView style={styles.releaseNotesContainer}>
            <Text style={[styles.releaseNotesTitle, { color: colors.text }]}>
              업데이트 내용:
            </Text>
            <Text style={[styles.releaseNotes, { color: colors.darkGray }]}>
              {versionInfo.release_notes || '다양한 개선 사항 및 버그 수정'}
            </Text>
          </ScrollView>
          
          <TouchableOpacity
            style={[styles.updateButton, { backgroundColor: colors.tint }]}
            onPress={handleUpdate}
          >
            <Text style={[styles.updateButtonText, { color: colors.buttonText }]}>
              업데이트
            </Text>
          </TouchableOpacity>
          
          {!isRequired && (
            <TouchableOpacity
              style={[styles.laterButton, { backgroundColor: colors.secondary }]}
              onPress={onClose}
            >
              <Text style={[styles.laterButtonText, { color: colors.darkGray }]}>
                나중에
              </Text>
            </TouchableOpacity>
          )}
          
          {isRequired && (
            <Text style={[styles.requiredText, { color: colors.darkGray }]}>
              이 업데이트는 필수입니다. 계속하려면 업데이트가 필요합니다.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: {
    borderRadius: 10,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center'
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center'
  },
  version: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 15
  },
  releaseNotesContainer: {
    maxHeight: 200,
    width: '100%',
    marginBottom: 20
  },
  releaseNotesTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 5
  },
  releaseNotes: {
    fontSize: 14,
    lineHeight: 20
  },
  updateButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 10,
    width: '100%',
    alignItems: 'center'
  },
  updateButtonText: {
    fontSize: 16,
    fontWeight: '600'
  },
  laterButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center'
  },
  laterButtonText: {
    fontSize: 16,
    fontWeight: '600'
  },
  requiredText: {
    fontSize: 12,
    marginTop: 15,
    textAlign: 'center',
    fontStyle: 'italic'
  }
});

export default UpdatePopup;
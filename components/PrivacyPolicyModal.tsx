// components/PrivacyPolicyModal.tsx
import React, { useState } from 'react';
import { 
  Modal, 
  StyleSheet, 
  View, 
  TouchableOpacity, 
  Text, 
  ActivityIndicator, 
  SafeAreaView, 
  Platform,
  BackHandler
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

// 개인정보처리방침 URL
const PRIVACY_POLICY_URL = 'https://kangcoding123.github.io/wein-privacy-policy/';

interface PrivacyPolicyModalProps {
  visible: boolean;
  onClose: () => void;
}

const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ visible, onClose }) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [webViewKey, setWebViewKey] = useState(1); // 웹뷰 리로드를 위한 키

  // 웹뷰 로딩 완료 핸들러
  const handleLoadEnd = () => {
    setLoading(false);
  };

  // 웹뷰 오류 핸들러
  const handleError = () => {
    setLoading(false);
    setError(true);
  };

  // 다시 시도 핸들러
  const handleRetry = () => {
    setLoading(true);
    setError(false);
    setWebViewKey(prev => prev + 1); // 웹뷰 키 변경으로 강제 리로드
  };

  // Android 백 버튼 핸들러 (Android만 해당)
  React.useEffect(() => {
    if (Platform.OS === 'android' && visible) {
      const backHandler = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          onClose();
          return true; // 이벤트 소비
        }
      );

      return () => backHandler.remove();
    }
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>개인정보처리방침</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={[styles.closeButtonText, { color: colors.tint }]}>닫기</Text>
          </TouchableOpacity>
        </View>
        
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        )}
        
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={[styles.errorText, { color: colors.text }]}>
              개인정보처리방침을 불러올 수 없습니다.
            </Text>
            <TouchableOpacity 
              style={[styles.retryButton, { backgroundColor: colors.tint }]}
              onPress={handleRetry}
            >
              <Text style={[styles.retryButtonText, { color: colors.background }]}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <WebView
            key={webViewKey}
            source={{ uri: PRIVACY_POLICY_URL }}
            style={styles.webview}
            onLoad={handleLoadEnd}
            onLoadEnd={handleLoadEnd}
            onError={handleError}
            onHttpError={handleError}
            startInLoadingState={true}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            // 문제가 되는 속성들 제거
            // decelerationRate="normal"
            // overScrollMode="never"
            bounces={false}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    padding: 12,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default PrivacyPolicyModal;
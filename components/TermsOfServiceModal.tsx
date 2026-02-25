// components/TermsOfServiceModal.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  BackHandler,
  Animated,
  Dimensions,
  StatusBar
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

// 이용약관 URL
const TERMS_OF_SERVICE_URL = 'https://kangcoding123.github.io/wein-privacy-policy/terms/';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface TermsOfServiceModalProps {
  visible: boolean;
  onClose: () => void;
}

const TermsOfServiceModal: React.FC<TermsOfServiceModalProps> = ({ visible, onClose }) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [webViewKey, setWebViewKey] = useState(1);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const handleLoadEnd = () => {
    setLoading(false);
  };

  const handleError = () => {
    setLoading(false);
    setError(true);
  };

  const handleRetry = () => {
    setLoading(true);
    setError(false);
    setWebViewKey(prev => prev + 1);
  };

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  };

  // Android 백 버튼 핸들러
  useEffect(() => {
    if (Platform.OS === 'android' && visible) {
      const backHandler = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          handleClose();
          return true;
        }
      );

      return () => backHandler.remove();
    }
  }, [visible]);

  // 슬라이드 애니메이션
  useEffect(() => {
    if (visible) {
      slideAnim.setValue(SCREEN_HEIGHT);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          backgroundColor: colors.background,
          transform: [{ translateY: slideAnim }],
        }
      ]}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>이용약관</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
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
              이용약관을 불러올 수 없습니다.
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
            source={{ uri: TERMS_OF_SERVICE_URL }}
            style={styles.webview}
            onLoad={handleLoadEnd}
            onLoadEnd={handleLoadEnd}
            onError={handleError}
            onHttpError={handleError}
            startInLoadingState={true}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            bounces={false}
            injectedJavaScript={colorScheme === 'dark' ? `
              var style = document.createElement('style');
              style.textContent = \`
                body { background-color: #121212 !important; color: #e0e0e0 !important; }
                .container { background-color: #1e1e1e !important; color: #e0e0e0 !important; box-shadow: none !important; }
                h1, h2, h3, h4, h5, h6, p, li, span, a, td, th, dt, dd { color: #e0e0e0 !important; }
                .highlight { background-color: #1a2332 !important; border-left-color: #5b8bd4 !important; }
                .warning { background-color: #2d1a1a !important; border-left-color: #e74c3c !important; }
                .contact, .date { background-color: #2a2a2a !important; }
                table, th, td { border-color: #444 !important; }
                a { color: #6b9eff !important; }
              \`;
              document.head.appendChild(style);
              true;
            ` : undefined}
          />
        )}
      </SafeAreaView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 1000,
  },
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

export default TermsOfServiceModal;

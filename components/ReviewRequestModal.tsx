// components/ReviewRequestModal.tsx
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import {
  recordReviewRequest,
  markReviewCompleted,
  requestStoreReview,
} from '@/services/reviewService';

interface ReviewRequestModalProps {
  visible: boolean;
  onClose: () => void;
}

type Step = 'initial' | 'positive' | 'negative';

const ReviewRequestModal: React.FC<ReviewRequestModalProps> = ({
  visible,
  onClose,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];

  const [step, setStep] = useState<Step>('initial');
  const [loading, setLoading] = useState(false);

  const handlePositive = () => {
    setStep('positive');
  };

  const handleNegative = async () => {
    setStep('negative');
    // 30일 후 다시 물어볼 수 있도록 기록
    await recordReviewRequest();
  };

  const handleLater = async () => {
    // 30일 후 다시 물어볼 수 있도록 기록
    await recordReviewRequest();
    handleClose();
  };

  const handleReview = async () => {
    setLoading(true);
    try {
      const success = await requestStoreReview();
      if (success) {
        await markReviewCompleted();
      }
    } finally {
      setLoading(false);
      handleClose();
    }
  };

  const handleClose = () => {
    // 모달 닫을 때 상태 초기화
    setTimeout(() => {
      setStep('initial');
    }, 300);
    onClose();
  };

  const handleNegativeConfirm = () => {
    handleClose();
  };

  const renderInitialStep = () => (
    <>
      <Text style={[styles.title, { color: colors.text }]}>
        WE:IN 앱이 마음에 드시나요?
      </Text>
      <Text style={[styles.subtitle, { color: colors.lightGray }]}>
        여러분의 의견이 궁금해요
      </Text>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.negativeButton, { backgroundColor: colors.secondary }]}
          onPress={handleNegative}
        >
          <Text style={[styles.buttonText, { color: colors.darkGray }]}>별로예요</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.positiveButton, { backgroundColor: colors.tint }]}
          onPress={handlePositive}
        >
          <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>좋아요!</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderPositiveStep = () => (
    <>
      <Text style={[styles.emoji]}>😊</Text>
      <Text style={[styles.title, { color: colors.text }]}>
        감사합니다!
      </Text>
      <Text style={[styles.subtitle, { color: colors.lightGray }]}>
        스토어에서 리뷰를 남겨주시겠어요?{'\n'}
        여러분의 리뷰가 큰 힘이 됩니다
      </Text>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.laterButton, { backgroundColor: colors.secondary }]}
          onPress={handleLater}
        >
          <Text style={[styles.buttonText, { color: colors.darkGray }]}>나중에</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.reviewButton, { backgroundColor: colors.tint }]}
          onPress={handleReview}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>리뷰 남기기</Text>
          )}
        </TouchableOpacity>
      </View>
    </>
  );

  const renderNegativeStep = () => (
    <>
      <Text style={[styles.title, { color: colors.text }]}>
        피드백 감사합니다
      </Text>
      <Text style={[styles.subtitle, { color: colors.lightGray }]}>
        더 나은 앱을 만들기 위해{'\n'}노력하겠습니다
      </Text>

      <View style={styles.singleButtonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.confirmButton, { backgroundColor: colors.tint }]}
          onPress={handleNegativeConfirm}
        >
          <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>확인</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          {step === 'initial' && renderInitialStep()}
          {step === 'positive' && renderPositiveStep()}
          {step === 'negative' && renderNegativeStep()}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  singleButtonContainer: {
    width: '100%',
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  negativeButton: {
    flex: 1,
  },
  positiveButton: {
    flex: 1,
  },
  laterButton: {
    flex: 1,
  },
  reviewButton: {
    flex: 1,
  },
  confirmButton: {
    // 단독 버튼은 flex 없이 전체 너비 사용
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ReviewRequestModal;

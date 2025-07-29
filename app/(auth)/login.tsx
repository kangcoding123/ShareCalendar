// app/(auth)/login.tsx
import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { sendPasswordReset } from '../../services/authService';
import PrivacyPolicyModal from '@/components/PrivacyPolicyModal';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const { inviteCode } = useLocalSearchParams(); // ⭐ 초대 코드 파라미터 받기
  
  // 색상 테마 설정
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{email?: string; password?: string}>({});
  
  // 비밀번호 재설정 관련 상태
  const [forgotPasswordVisible, setForgotPasswordVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetMessageType, setResetMessageType] = useState<'success' | 'error'>('success');
  
  // 개인정보처리방침 모달 상태 추가
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);

  // 디버깅용 정보 로그
  React.useEffect(() => {
    console.log(`[디버깅] Platform: ${Platform.OS}, isEmulator: ${__DEV__}, colorScheme: ${colorScheme}`);
  }, [colorScheme]);

  const validate = () => {
    const newErrors: {email?: string; password?: string} = {};

    // 이메일 검증
    if (!email) {
      newErrors.email = '이메일을 입력해주세요.';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = '올바른 이메일 형식이 아닙니다.';
    }

    // 비밀번호 검증
    if (!password) {
      newErrors.password = '비밀번호를 입력해주세요.';
    } else if (password.length < 6) {
      newErrors.password = '비밀번호는 6자 이상이어야 합니다.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
  if (!validate()) return;

  setLoading(true);
  try {
    console.log('로그인 시도:', email); // 🔍 디버깅
    
    await login(email, password);
    
    console.log('로그인 성공 - 화면 이동'); // 🔍 디버깅
    
    // 약간의 지연 추가 (상태 업데이트 대기)
    setTimeout(() => {
      if (inviteCode && typeof inviteCode === 'string') {
        router.replace(`/invite/${inviteCode}`);
      } else {
        router.replace('/(tabs)');
      }
    }, 100);
    
  } catch (error: any) {
    console.log('로그인 에러 catch:', error); // 🔍 디버깅
    console.log('에러 타입:', typeof error); // 🔍 디버깅
    console.log('에러 메시지:', error?.message); // 🔍 디버깅
    
    // 실제 에러일 때만 알림 표시
    if (error && error.message) {
      let errorMessage = '로그인 중 오류가 발생했습니다.';
      if (error.message.includes('user-not-found')) {
        errorMessage = '존재하지 않는 사용자입니다.';
      } else if (error.message.includes('wrong-password')) {
        errorMessage = '잘못된 비밀번호입니다.';
      } else if (error.message.includes('invalid-email')) {
        errorMessage = '올바른 이메일 형식이 아닙니다.';
      }
      
      Alert.alert('로그인 실패', errorMessage);
    }
  } finally {
    setLoading(false);
  }
};
  
  // 비밀번호 재설정 함수
  const handlePasswordReset = async () => {
    if (!resetEmail.trim()) {
      setResetMessage('이메일을 입력해주세요.');
      setResetMessageType('error');
      return;
    }
    
    setResetLoading(true);
    try {
      const result = await sendPasswordReset(resetEmail);
      if (result.success) {
        setResetMessage(result.message || '비밀번호 재설정 링크가 이메일로 전송되었습니다.');
        setResetMessageType('success');
        // 성공 후 잠시 기다렸다가 모달 닫기
        setTimeout(() => {
          setForgotPasswordVisible(false);
          setResetEmail('');
          setResetMessage('');
        }, 3000);
      } else {
        setResetMessage(result.error || '오류가 발생했습니다.');
        setResetMessageType('error');
      }
    } catch (error) {
      setResetMessage('오류가 발생했습니다. 다시 시도해주세요.');
      setResetMessageType('error');
    } finally {
      setResetLoading(false);
    }
  };

  // 게스트로 계속하기 핸들러
  const handleContinueAsGuest = () => {
    router.replace("/(tabs)/calendar");
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.secondary }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.headerContainer}>
            <Text style={[styles.title, { color: colors.tint }]}>WE:IN</Text>
            <Text style={[styles.subtitle, { color: colors.lightGray }]}>로그인하여 일정을 관리하세요</Text>
          </View>
          
          <View style={[styles.formContainer, { backgroundColor: colors.card, shadowColor: colorScheme === 'dark' ? 'transparent' : '#000' }]}>
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text }]}>이메일</Text>
              <TextInput
                style={[
                  styles.input, 
                  { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text },
                  errors.email && styles.inputError
                ]}
                placeholder="이메일 주소"
                placeholderTextColor={colors.lightGray}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
              {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text }]}>비밀번호</Text>
              <TextInput
                style={[
                  styles.input, 
                  { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text },
                  errors.password && styles.inputError
                ]}
                placeholder="비밀번호"
                placeholderTextColor={colors.lightGray}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
            </View>
            
            <TouchableOpacity
              style={[
                styles.button, 
                { backgroundColor: colors.buttonBackground },
                loading && { backgroundColor: colors.disabledButton }
              ]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.buttonText} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.buttonText }]}>로그인</Text>
              )}
            </TouchableOpacity>
            
            {/* 게스트로 계속하기 버튼 추가 */}
            <TouchableOpacity
              style={[styles.guestButton, { backgroundColor: colors.secondary }]}
              onPress={handleContinueAsGuest}
            >
              <Text style={[styles.guestButtonText, { color: colors.darkGray }]}>로그인 없이 계속하기</Text>
            </TouchableOpacity>
            <Text style={[styles.guestText, { color: colors.lightGray }]}>
              로그인하지 않고도 캘린더 기능을 이용할 수 있습니다.
            </Text>
            
            {/* 비밀번호 찾기 버튼 */}
            <View style={styles.forgotPasswordContainer}>
              <TouchableOpacity onPress={() => setForgotPasswordVisible(true)}>
                <Text style={[styles.forgotPasswordText, { color: colors.tint }]}>
                  비밀번호를 잊으셨나요?
                </Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.registerContainer}>
              <Text style={[styles.registerText, { color: colors.lightGray }]}>계정이 없으신가요?</Text>
              <TouchableOpacity onPress={() => router.push("/register")}>
                <Text style={[styles.registerLink, { color: colors.tint }]}>회원가입</Text>
              </TouchableOpacity>
            </View>
            
            {/* 개인정보처리방침 안내 추가 */}
            <View style={styles.privacyNotice}>
              <Text style={[styles.privacyNoticeText, { color: colors.lightGray }]}>
                계속 진행하면{' '}
                <Text 
                  style={{ color: colors.tint, textDecorationLine: 'underline' }}
                  onPress={() => setPrivacyModalVisible(true)}
                >
                  개인정보처리방침
                </Text>
                에 동의하는 것으로 간주됩니다.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      
      {/* 비밀번호 재설정 모달 */}
      <Modal
        visible={forgotPasswordVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setForgotPasswordVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>비밀번호 재설정</Text>
            <Text style={[styles.modalSubtitle, { color: colors.lightGray }]}>
              가입한 이메일을 입력하시면 비밀번호 재설정 링크를 보내드립니다.
            </Text>
            
            <TextInput
              style={[
                styles.input, 
                { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }
              ]}
              placeholder="이메일 주소"
              placeholderTextColor={colors.lightGray}
              keyboardType="email-address"
              autoCapitalize="none"
              value={resetEmail}
              onChangeText={setResetEmail}
            />
            
            {resetMessage ? (
              <Text 
                style={[
                  styles.resetMessage, 
                  { color: resetMessageType === 'success' ? '#4CAF50' : '#FF3B30' }
                ]}
              >
                {resetMessage}
              </Text>
            ) : null}
            
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton, { backgroundColor: colors.secondary }]} 
                onPress={() => {
                  setForgotPasswordVisible(false);
                  setResetEmail('');
                  setResetMessage('');
                }}
              >
                <Text style={[styles.cancelButtonText, { color: colors.darkGray }]}>취소</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  styles.modalButton, 
                  { backgroundColor: colors.buttonBackground }, 
                  resetLoading && { backgroundColor: colors.disabledButton }
                ]} 
                onPress={handlePasswordReset}
                disabled={resetLoading}
              >
                {resetLoading ? (
                  <ActivityIndicator color={colors.buttonText} />
                ) : (
                  <Text style={[styles.submitButtonText, { color: colors.buttonText }]}>전송</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* 개인정보처리방침 모달 추가 */}
      <PrivacyPolicyModal
        visible={privacyModalVisible}
        onClose={() => setPrivacyModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  keyboardAvoid: {
    flex: 1
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center'
  },
  headerContainer: {
    marginBottom: 40,
    alignItems: 'center'
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 10
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center'
  },
  formContainer: {
    borderRadius: 10,
    padding: 20,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  inputContainer: {
    marginBottom: 20
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
  },
  inputError: {
    borderColor: '#ff3b30'
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 12,
    marginTop: 5
  },
  button: {
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600'
  },
  // 게스트 버튼 스타일 추가
  guestButton: {
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)'
  },
  guestButtonText: {
    fontSize: 16,
    fontWeight: '500'
  },
  guestText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 10
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20
  },
  registerText: {
  },
  registerLink: {
    fontWeight: '600',
    marginLeft: 5
  },
  // 비밀번호 찾기 관련 스타일
  forgotPasswordContainer: {
    alignItems: 'center',
    marginTop: 15,
  },
  forgotPasswordText: {
    fontSize: 14,
  },
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
    maxWidth: 400
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center'
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center'
  },
  resetMessage: {
    fontSize: 14,
    marginTop: 10,
    marginBottom: 15,
    textAlign: 'center'
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  cancelButton: {
    marginRight: 10
  },
  cancelButtonText: {
    fontWeight: '600'
  },
  submitButtonText: {
    fontWeight: '600'
  },
  // 개인정보처리방침 안내 스타일 추가
  privacyNotice: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  privacyNoticeText: {
    fontSize: 12,
    textAlign: 'center',
  },
});
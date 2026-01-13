// app/(auth)/register.tsx
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
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import PrivacyPolicyModal from '../../components/PrivacyPolicyModal';

export default function RegisterScreen() {
  const router = useRouter();
  const { register, logout } = useAuth();
  
  // 색상 테마 설정 추가
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    agreement?: string;
  }>({});
  
  // 동의 관련 상태 추가
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [ageAgreed, setAgeAgreed] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);

  const validate = () => {
    const newErrors: {
      name?: string;
      email?: string;
      password?: string;
      confirmPassword?: string;
      agreement?: string;
    } = {};

    // 이름 검증
    if (!name.trim()) {
      newErrors.name = '이름을 입력해주세요.';
    }

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

    // 비밀번호 확인 검증
    if (!confirmPassword) {
      newErrors.confirmPassword = '비밀번호 확인을 입력해주세요.';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = '비밀번호가 일치하지 않습니다.';
    }
    
    // 동의 항목 검증 추가
    if (!privacyAgreed || !termsAgreed || !ageAgreed) {
      newErrors.agreement = '모든 필수 항목에 동의해주세요.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
  if (!validate()) return;

  setLoading(true);
  try {
    // register 함수는 성공 시 정상 실행, 실패 시 에러 throw
    await register(email, password, name);
    
    // 🔄 로그아웃 대신 바로 홈 화면으로 이동 (자동 로그인 상태)
    Alert.alert(
      '회원가입 성공',
      '회원가입이 완료되었습니다. 서비스를 이용해주세요.',
      [{ 
        text: '확인', 
        onPress: () => {
          // 탭 화면으로 직접 이동 (로그인 상태 유지)
          router.replace('/(tabs)');
        }
      }]
    );
    
  } catch (error: any) {
    // AuthContext의 register에서 throw한 에러 메시지 사용
    const errorMessage = error.message || '회원가입 중 오류가 발생했습니다.';
    Alert.alert('회원가입 실패', errorMessage);
    console.error('회원가입 오류:', error);
  } finally {
    setLoading(false);
  }
};

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.secondary }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          {/* 상단 홈으로 돌아가기 버튼 추가 */}
          <TouchableOpacity 
            style={styles.homeButton}
            onPress={() => router.push('/login')}
          >
            <Text style={[styles.homeButtonText, { color: colors.tint }]}>{'< 로그인 화면으로'}</Text>
          </TouchableOpacity>
          
          <View style={styles.headerContainer}>
            <Text style={[styles.title, { color: colors.tint }]}>회원가입</Text>
            <Text style={[styles.subtitle, { color: colors.lightGray }]}>계정 정보를 입력해주세요</Text>
          </View>
          
          <View style={[styles.formContainer, { 
            backgroundColor: colors.card,
            shadowColor: colorScheme === 'dark' ? 'transparent' : '#000'
          }]}>
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text }]}>이름</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.inputBorder,
                    color: colors.text
                  },
                  errors.name && styles.inputError
                ]}
                placeholder="이름"
                placeholderTextColor={colors.lightGray}
                autoCapitalize="words"
                textContentType="none"
                autoComplete="off"
                autoCorrect={false}
                value={name}
                onChangeText={setName}
              />
              {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text }]}>이메일</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.inputBorder,
                    color: colors.text
                  },
                  errors.email && styles.inputError
                ]}
                placeholder="이메일 주소"
                placeholderTextColor={colors.lightGray}
                keyboardType="email-address"
                autoCapitalize="none"
                textContentType="none"
                autoComplete="off"
                autoCorrect={false}
                spellCheck={false}
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
                  {
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.inputBorder,
                    color: colors.text
                  },
                  errors.password && styles.inputError
                ]}
                placeholder="비밀번호 (6자 이상)"
                placeholderTextColor={colors.lightGray}
                secureTextEntry
                textContentType="none"
                autoComplete="off"
                autoCorrect={false}
                value={password}
                onChangeText={setPassword}
              />
              {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text }]}>비밀번호 확인</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.inputBorder,
                    color: colors.text
                  },
                  errors.confirmPassword && styles.inputError
                ]}
                placeholder="비밀번호 확인"
                placeholderTextColor={colors.lightGray}
                secureTextEntry
                textContentType="none"
                autoComplete="off"
                autoCorrect={false}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              {errors.confirmPassword && (
                <Text style={styles.errorText}>{errors.confirmPassword}</Text>
              )}
            </View>
            
            {/* 약관 동의 섹션 */}
            <View style={styles.agreementSection}>
              <Text style={[styles.agreementTitle, { color: colors.text }]}>약관 동의</Text>
              
              <TouchableOpacity 
                style={styles.agreementItem}
                onPress={() => setTermsAgreed(!termsAgreed)}
              >
                <View style={[styles.checkbox, { borderColor: colors.inputBorder }]}>
                  {termsAgreed && <Text style={{ color: colors.tint }}>✓</Text>}
                </View>
                <Text style={[styles.agreementText, { color: colors.text }]}>
                  [필수] 이용약관에 동의합니다
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.agreementItem}
                onPress={() => setPrivacyAgreed(!privacyAgreed)}
              >
                <View style={[styles.checkbox, { borderColor: colors.inputBorder }]}>
                  {privacyAgreed && <Text style={{ color: colors.tint }}>✓</Text>}
                </View>
                <Text style={[styles.agreementText, { color: colors.text }]}>
                  [필수] <Text 
                    style={{ color: colors.tint, textDecorationLine: 'underline' }}
                    onPress={() => setPrivacyModalVisible(true)}
                  >
                    개인정보처리방침
                  </Text>에 동의합니다
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.agreementItem}
                onPress={() => setAgeAgreed(!ageAgreed)}
              >
                <View style={[styles.checkbox, { borderColor: colors.inputBorder }]}>
                  {ageAgreed && <Text style={{ color: colors.tint }}>✓</Text>}
                </View>
                <Text style={[styles.agreementText, { color: colors.text }]}>
                  [필수] 만 14세 이상입니다
                </Text>
              </TouchableOpacity>
              
              {errors.agreement && (
                <Text style={styles.errorText}>{errors.agreement}</Text>
              )}
            </View>
            
            <TouchableOpacity
              style={[
                styles.button, 
                { backgroundColor: colors.buttonBackground },
                loading && { backgroundColor: colors.disabledButton }
              ]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.buttonText} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.buttonText }]}>회원가입</Text>
              )}
            </TouchableOpacity>
            
            <View style={styles.loginContainer}>
              <Text style={[styles.loginText, { color: colors.lightGray }]}>이미 계정이 있으신가요?</Text>
              <TouchableOpacity onPress={() => router.push('/login')}>
                <Text style={[styles.loginLink, { color: colors.tint }]}>로그인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      
      {/* 개인정보처리방침 모달 */}
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
  homeButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10
  },
  homeButtonText: {
    fontSize: 16,
    fontWeight: '500'
  },
  headerContainer: {
    marginBottom: 30,
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
    marginBottom: 16
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
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20
  },
  loginText: {
  },
  loginLink: {
    fontWeight: '600',
    marginLeft: 5
  },
  // 동의 관련 스타일 추가
  agreementSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  agreementTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  agreementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderRadius: 4,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agreementText: {
    fontSize: 14,
  },
});
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
  }>({});

  const validate = () => {
    const newErrors: {
      name?: string;
      email?: string;
      password?: string;
      confirmPassword?: string;
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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const { success, error } = await register(email, password, name);
      
      if (success) {
        // 회원가입 성공 후 로그아웃 처리 추가
        await logout();
        
        Alert.alert(
          '회원가입 성공',
          '회원가입이 완료되었습니다. 로그인하여 서비스를 이용해주세요.',
          [{ text: '확인', onPress: () => router.push('/login') }]
        );
      } else {
        Alert.alert('회원가입 실패', error || '회원가입 중 오류가 발생했습니다.');
      }
    } catch (error) {
      Alert.alert('회원가입 실패', '회원가입 중 오류가 발생했습니다.');
      console.error(error);
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
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              {errors.confirmPassword && (
                <Text style={styles.errorText}>{errors.confirmPassword}</Text>
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
  }
});
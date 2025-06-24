// app/(tabs)/groups/join.tsx
import React, { useState, useRef, useEffect } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../context/AuthContext';
import { 
  findGroupByInviteCode, 
  joinGroupWithInviteCode 
} from '../../../services/inviteService';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useFocusEffect } from '@react-navigation/native';

export default function JoinGroupScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // 색상 테마 설정
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  
  // 상태 관리
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [groupInfo, setGroupInfo] = useState<{
    id: string;
    name: string;
    description?: string;
    memberCount?: number;
  } | null>(null);
  
  // 입력 필드 ref (6개)
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const [codeValues, setCodeValues] = useState(['', '', '', '', '', '']);

  // 화면이 포커스될 때마다 상태 초기화
  useFocusEffect(
    React.useCallback(() => {
      // 화면이 포커스될 때 상태 초기화
      console.log('Join screen focused - resetting state');
      resetForm();
      
      // 파라미터로 전달된 초대 코드가 있는지 확인
      if (params.code && typeof params.code === 'string') {
        const code = params.code.toUpperCase();
        const codeArray = code.split('');
        if (codeArray.length === 6) {
          setCodeValues(codeArray);
          setInviteCode(code);
          // 자동으로 확인하지 않고 사용자가 확인 버튼을 누르도록 함
        }
      }
      
      return () => {
        // cleanup 함수
        console.log('Join screen unfocused');
      };
    }, [params.code])
  );

  // 폼 초기화 함수
  const resetForm = () => {
    setCodeValues(['', '', '', '', '', '']);
    setInviteCode('');
    setGroupInfo(null);
    setVerifying(false);
    setLoading(false);
  };

  // 개별 입력 처리
  const handleCodeChange = (value: string, index: number) => {
    if (value.length > 1) {
      // 붙여넣기 처리
      const pastedCode = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const newValues = [...codeValues];
      
      for (let i = 0; i < pastedCode.length && index + i < 6; i++) {
        newValues[index + i] = pastedCode[i];
      }
      
      setCodeValues(newValues);
      setInviteCode(newValues.join(''));
      
      // 마지막 입력 필드로 포커스 이동
      const lastFilledIndex = Math.min(index + pastedCode.length - 1, 5);
      inputRefs.current[lastFilledIndex]?.focus();
      
      // 6자리가 모두 입력되면 자동으로 확인
      if (newValues.every(v => v !== '')) {
        handleVerifyCode(newValues.join(''));
      }
    } else {
      // 일반 입력
      const newValues = [...codeValues];
      newValues[index] = value.toUpperCase();
      setCodeValues(newValues);
      setInviteCode(newValues.join(''));
      
      // 다음 필드로 이동
      if (value && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
      
      // 6자리가 모두 입력되면 자동으로 확인
      if (value && index === 5 && newValues.every(v => v !== '')) {
        handleVerifyCode(newValues.join(''));
      }
    }
  };

  // 백스페이스 처리
  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !codeValues[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // 초대 코드 확인
  const handleVerifyCode = async (code?: string) => {
    const finalCode = code || codeValues.join('');
    
    if (finalCode.length !== 6) {
      Alert.alert('오류', '6자리 초대 코드를 모두 입력해주세요.');
      return;
    }

    try {
      setVerifying(true);
      
      const result = await findGroupByInviteCode(finalCode);
      
      if (result.success && result.group) {
        setGroupInfo({
          id: result.group.id,
          name: result.group.name,
          description: result.group.description,
          memberCount: result.group.memberCount
        });
      } else {
        Alert.alert('오류', result.error || '유효하지 않은 초대 코드입니다.');
        // 입력 필드 초기화
        setCodeValues(['', '', '', '', '', '']);
        setInviteCode('');
        inputRefs.current[0]?.focus();
      }
    } catch (error) {
      console.error('초대 코드 확인 오류:', error);
      Alert.alert('오류', '초대 코드 확인 중 오류가 발생했습니다.');
    } finally {
      setVerifying(false);
    }
  };

  // 그룹 가입
  const handleJoinGroup = async () => {
    if (!user || !groupInfo) return;

    try {
      setLoading(true);
      
      const result = await joinGroupWithInviteCode(
        inviteCode,
        user.uid,
        user.email || ''
      );
      
      if (result.success) {
        Alert.alert(
          '성공',
          `${groupInfo.name} 그룹에 가입했습니다!`,
          [
            {
              text: '확인',
              onPress: () => {
                // 상태 초기화 후 이동
                resetForm();
                router.push(`/groups/${groupInfo.id}`);
              }
            }
          ]
        );
      } else {
        Alert.alert('오류', result.error || '그룹 가입 중 오류가 발생했습니다.');
        
        // 이미 멤버인 경우
        if (result.error?.includes('이미')) {
          setTimeout(() => {
            resetForm();
            router.push(`/groups/${groupInfo.id}`);
          }, 1500);
        } else {
          // 다른 오류의 경우 폼 초기화
          handleReset();
        }
      }
    } catch (error) {
      console.error('그룹 가입 오류:', error);
      Alert.alert('오류', '그룹 가입 중 오류가 발생했습니다.');
      handleReset();
    } finally {
      setLoading(false);
    }
  };

  // 다시 입력
  const handleReset = () => {
    resetForm();
    inputRefs.current[0]?.focus();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.secondary }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={[styles.header, { 
            backgroundColor: colors.headerBackground, 
            borderBottomColor: colors.border 
          }]}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                resetForm(); // 뒤로가기 시에도 상태 초기화
                router.push('/(tabs)/groups');
              }}
            >
              <Text style={[styles.backButtonText, { color: colors.tint }]}>{'<'} 뒤로</Text>
            </TouchableOpacity>
            
            <Text style={[styles.headerTitle, { color: colors.text }]}>초대 코드로 가입</Text>
            
            <View style={{ width: 50 }} />
          </View>

          <View style={styles.content}>
            {!groupInfo ? (
              // 초대 코드 입력 화면
              <>
                <View style={styles.titleContainer}>
                  <Text style={[styles.title, { color: colors.text }]}>초대 코드 입력</Text>
                  <Text style={[styles.subtitle, { color: colors.lightGray }]}>
                    받으신 6자리 초대 코드를 입력해주세요
                  </Text>
                </View>

                <View style={styles.codeInputContainer}>
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <TextInput
                      key={index}
                      ref={(ref) => inputRefs.current[index] = ref}
                      style={[
                        styles.codeInput,
                        {
                          backgroundColor: colors.inputBackground,
                          borderColor: codeValues[index] ? colors.tint : colors.inputBorder,
                          color: colors.text
                        }
                      ]}
                      value={codeValues[index]}
                      onChangeText={(value) => handleCodeChange(value, index)}
                      onKeyPress={(e) => handleKeyPress(e, index)}
                      maxLength={1}
                      keyboardType="default"
                      autoCapitalize="characters"
                      placeholder="•"
                      placeholderTextColor={colors.lightGray}
                    />
                  ))}
                </View>

                <TouchableOpacity
                  style={[
                    styles.verifyButton,
                    { backgroundColor: colors.buttonBackground },
                    verifying && { backgroundColor: colors.disabledButton }
                  ]}
                  onPress={() => handleVerifyCode()}
                  disabled={verifying || codeValues.some(v => v === '')}
                >
                  {verifying ? (
                    <ActivityIndicator size="small" color={colors.buttonText} />
                  ) : (
                    <Text style={[styles.verifyButtonText, { color: colors.buttonText }]}>
                      확인
                    </Text>
                  )}
                </TouchableOpacity>

                <Text style={[styles.helpText, { color: colors.lightGray }]}>
                  초대 코드는 그룹 관리자에게 받을 수 있습니다
                </Text>
              </>
            ) : (
              // 그룹 정보 확인 화면
              <View style={[styles.groupInfoCard, { backgroundColor: colors.card }]}>
                <Text style={[styles.groupName, { color: colors.text }]}>
                  {groupInfo.name}
                </Text>
                
                {groupInfo.description && (
                  <Text style={[styles.groupDescription, { color: colors.lightGray }]}>
                    {groupInfo.description}
                  </Text>
                )}
                
                <View style={styles.groupStats}>
                  <Text style={[styles.groupStat, { color: colors.darkGray }]}>
                    멤버 {groupInfo.memberCount || 0}명
                  </Text>
                </View>

                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[styles.cancelButton, { backgroundColor: colors.secondary }]}
                    onPress={handleReset}
                  >
                    <Text style={[styles.cancelButtonText, { color: colors.darkGray }]}>
                      다시 입력
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.joinButton,
                      { backgroundColor: colors.tint },
                      loading && { backgroundColor: colors.disabledButton }
                    ]}
                    onPress={handleJoinGroup}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color={colors.buttonText} />
                    ) : (
                      <Text style={[styles.joinButtonText, { color: colors.buttonText }]}>
                        그룹 가입하기
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
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
    flexGrow: 1
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1
  },
  backButton: {
    padding: 5,
    width: 50
  },
  backButtonText: {
    fontSize: 16
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center'
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 40
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center'
  },
  codeInputContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 30,
    gap: 10
  },
  codeInput: {
    width: 45,
    height: 55,
    borderWidth: 2,
    borderRadius: 10,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  verifyButton: {
    height: 50,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20
  },
  verifyButtonText: {
    fontSize: 16,
    fontWeight: '600'
  },
  helpText: {
    fontSize: 14,
    textAlign: 'center'
  },
  groupInfoCard: {
    borderRadius: 15,
    padding: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  groupName: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10
  },
  groupDescription: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20
  },
  groupStats: {
    flexDirection: 'row',
    marginBottom: 30
  },
  groupStat: {
    fontSize: 14
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 15
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500'
  },
  joinButton: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25
  },
  joinButtonText: {
    fontSize: 16,
    fontWeight: '600'
  }
});
// app/invite/[code].tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Alert
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { 
  findGroupByInviteCode, 
  joinGroupWithInviteCode 
} from '../../services/inviteService';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function InviteDeepLinkScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { code } = useLocalSearchParams();
  
  // 색상 테마 설정
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  
  const [processing, setProcessing] = useState(true);
  const [message, setMessage] = useState('초대 코드 확인 중...');

  useEffect(() => {
    handleInviteCode();
  }, [code, user]);

  const handleInviteCode = async () => {
    // 초대 코드가 없으면 그룹 목록으로 이동
    if (!code || typeof code !== 'string') {
      router.replace('/(tabs)/groups');
      return;
    }

    try {
      // 로그인 확인
      if (!user) {
        // 비로그인 상태면 로그인 페이지로 이동 (초대 코드 파라미터 포함)
        Alert.alert(
          '로그인 필요',
          '그룹에 가입하려면 먼저 로그인해주세요.',
          [
            {
              text: '확인',
              onPress: () => {
                // 로그인 후 다시 이 초대 링크로 돌아올 수 있도록 파라미터 전달
                router.replace({
                  pathname: '/(auth)/login',
                  params: { inviteCode: code }
                });
              }
            }
          ]
        );
        return;
      }

      setMessage('그룹 정보 확인 중...');
      
      // 초대 코드로 그룹 찾기
      const findResult = await findGroupByInviteCode(code);
      
      if (!findResult.success || !findResult.group) {
        Alert.alert(
          '오류',
          '유효하지 않은 초대 코드입니다.',
          [
            {
              text: '확인',
              onPress: () => router.replace('/(tabs)/groups')
            }
          ]
        );
        return;
      }

      const group = findResult.group;
      setMessage(`${group.name} 그룹에 가입 중...`);

      // 그룹 가입 시도
      const joinResult = await joinGroupWithInviteCode(
        code,
        user.uid,
        user.email || ''
      );

      if (joinResult.success) {
        // 가입 성공
        Alert.alert(
          '환영합니다!',
          `${group.name} 그룹에 가입되었습니다.`,
          [
            {
              text: '확인',
              onPress: () => router.replace(`/(tabs)/groups/${group.id}`)
            }
          ]
        );
      } else if (joinResult.error?.includes('이미')) {
        // 이미 멤버인 경우
        Alert.alert(
          '알림',
          '이미 이 그룹의 멤버입니다.',
          [
            {
              text: '확인',
              onPress: () => router.replace(`/(tabs)/groups/${group.id}`)
            }
          ]
        );
      } else {
        // 가입 실패
        Alert.alert(
          '오류',
          joinResult.error || '그룹 가입 중 오류가 발생했습니다.',
          [
            {
              text: '확인',
              onPress: () => router.replace('/(tabs)/groups')
            }
          ]
        );
      }
    } catch (error) {
      console.error('딥링크 처리 오류:', error);
      Alert.alert(
        '오류',
        '초대 처리 중 오류가 발생했습니다.',
        [
          {
            text: '확인',
            onPress: () => router.replace('/(tabs)/groups')
          }
        ]
      );
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.secondary }]}>
      <ActivityIndicator size="large" color={colors.tint} />
      <Text style={[styles.message, { color: colors.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  message: {
    marginTop: 20,
    fontSize: 16,
    textAlign: 'center'
  }
});
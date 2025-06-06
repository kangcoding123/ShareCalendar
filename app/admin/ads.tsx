// app/admin/ads.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, Switch, TextInput, StyleSheet, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAdConfig, updateAdUnitId, toggleAdEnabled, setTestMode } from '../../services/adConfigService';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import AdminHeader from '@/components/AdminHeader';

export default function AdSettingsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  
  const [unitId, setUnitId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [testMode, setTestModeState] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAdConfig();
  }, []);

  const loadAdConfig = async () => {
    setLoading(true);
    try {
      const result = await getAdConfig();
      if (result.success && result.config) {
        setUnitId(result.config.banner_unit_id || '');
        setEnabled(result.config.ad_enabled || false);
        setTestModeState(result.config.test_mode || false);
      }
    } catch (error) {
      console.error('광고 설정 로드 오류:', error);
      Alert.alert('오류', '광고 설정을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!unitId.trim()) {
      Alert.alert('오류', '광고 단위 ID를 입력해주세요.');
      return;
    }
    
    setSaving(true);
    try {
      // 광고 단위 ID 업데이트
      await updateAdUnitId(unitId);
      
      // 광고 활성화 상태 업데이트
      await toggleAdEnabled(enabled);
      
      // 테스트 모드 상태 업데이트
      await setTestMode(testMode);
      
      Alert.alert('성공', '광고 설정이 업데이트되었습니다.');
    } catch (error) {
      console.error('광고 설정 저장 오류:', error);
      Alert.alert('오류', '광고 설정을 저장하는 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <AdminHeader title="광고 설정" />
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={[styles.loadingText, { color: colors.text }]}>설정 불러오는 중...</Text>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.title, { color: colors.text }]}>카카오애드핏 설정</Text>
            
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>배너 광고 단위 ID</Text>
              <TextInput
                style={[styles.input, { 
                  backgroundColor: colors.inputBackground, 
                  borderColor: colors.border,
                  color: colors.text 
                }]}
                value={unitId}
                onChangeText={setUnitId}
                placeholder="예: DAN-tEpg4818iiZARMn2"
                placeholderTextColor={colors.lightGray}
              />
            </View>
            
            <View style={styles.formGroup}>
              <View style={styles.switchContainer}>
                <Text style={[styles.switchLabel, { color: colors.text }]}>광고 활성화</Text>
                <Switch
                  value={enabled}
                  onValueChange={setEnabled}
                  trackColor={{ false: '#767577', true: colors.tint }}
                  thumbColor={'#f4f3f4'}
                />
              </View>
              <Text style={[styles.helperText, { color: colors.lightGray }]}>
                {enabled ? '광고가 표시됩니다.' : '광고가 표시되지 않습니다.'}
              </Text>
            </View>
            
            <View style={styles.formGroup}>
              <View style={styles.switchContainer}>
                <Text style={[styles.switchLabel, { color: colors.text }]}>테스트 모드</Text>
                <Switch
                  value={testMode}
                  onValueChange={setTestModeState}
                  trackColor={{ false: '#767577', true: colors.tint }}
                  thumbColor={'#f4f3f4'}
                />
              </View>
              <Text style={[styles.helperText, { color: colors.lightGray }]}>
                {testMode ? '테스트 광고가 표시됩니다.' : '실제 광고가 표시됩니다.'}
              </Text>
            </View>
          </View>
          
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.tint }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.saveButtonText}>설정 저장</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  helperText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  saveButton: {
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
});
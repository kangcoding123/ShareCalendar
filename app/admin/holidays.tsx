// app/admin/holidays.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Switch,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import {
  TemporaryHoliday,
  getTemporaryHolidaysByYear,
  addTemporaryHoliday,
  updateTemporaryHoliday,
  deleteTemporaryHoliday
} from '@/services/holidayService';
import AdminHeader from '@/components/AdminHeader';

export default function HolidaysScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [holidays, setHolidays] = useState<TemporaryHoliday[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [refreshing, setRefreshing] = useState(false);
  
  // 모달 관련 상태
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [editingHoliday, setEditingHoliday] = useState<TemporaryHoliday | null>(null);
  const [holidayName, setHolidayName] = useState('');
  const [holidayDate, setHolidayDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isHolidayEnabled, setIsHolidayEnabled] = useState(true);
  const [holidayDescription, setHolidayDescription] = useState('');
  const [saving, setSaving] = useState(false);
  
  // 색상 테마 설정
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  
  // 공휴일 데이터 로드
  const loadHolidays = async () => {
    try {
      setLoading(true);
      const result = await getTemporaryHolidaysByYear(selectedYear);
      
      if (result.success && result.holidays) {
        // 날짜 기준으로 정렬
        const sortedHolidays = [...result.holidays].sort((a, b) => 
          a.date.localeCompare(b.date)
        );
        setHolidays(sortedHolidays);
      } else {
        Alert.alert('오류', result.error || '공휴일 데이터를 가져오는 중 오류가 발생했습니다.');
      }
    } catch (error) {
      console.error('공휴일 로드 오류:', error);
      Alert.alert('오류', '공휴일 데이터를 가져오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  
  // 초기 데이터 로드
  useEffect(() => {
    loadHolidays();
  }, [selectedYear]);
  
  // 공휴일 추가 모달 표시
  const handleAddHoliday = () => {
    setModalTitle('새 공휴일 추가');
    setEditingHoliday(null);
    setHolidayName('');
    setHolidayDate(new Date());
    setIsHolidayEnabled(true);
    setHolidayDescription('');
    setModalVisible(true);
  };
  
  // 공휴일 편집 모달 표시
  const handleEditHoliday = (holiday: TemporaryHoliday) => {
    setModalTitle('공휴일 수정');
    setEditingHoliday(holiday);
    setHolidayName(holiday.name);
    setHolidayDate(new Date(holiday.date));
    setIsHolidayEnabled(holiday.isHoliday);
    setHolidayDescription(holiday.description || '');
    setModalVisible(true);
  };
  
  // 공휴일 삭제 확인
  const handleDeleteHoliday = (holiday: TemporaryHoliday) => {
    Alert.alert(
      '공휴일 삭제',
      `'${holiday.name}' 공휴일을 삭제하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        { 
          text: '삭제', 
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              
              if (!holiday.id) {
                Alert.alert('오류', 'ID가 없는 공휴일입니다.');
                setLoading(false);
                return;
              }
              
              const result = await deleteTemporaryHoliday(holiday.id);
              
              if (result.success) {
                // 삭제 성공 시 목록 업데이트
                setHolidays(prev => prev.filter(h => h.id !== holiday.id));
                Alert.alert('성공', '공휴일이 삭제되었습니다.');
              } else {
                Alert.alert('오류', result.error || '삭제 중 오류가 발생했습니다.');
              }
            } catch (error) {
              console.error('공휴일 삭제 오류:', error);
              Alert.alert('오류', '삭제 중 오류가 발생했습니다.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };
  
  // 날짜 선택 핸들러
  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios'); // iOS에서는 닫지 않음
    
    if (selectedDate) {
      setHolidayDate(selectedDate);
    }
  };
  
  // 저장 핸들러
  const handleSave = async () => {
    // 필수 필드 검증
    if (!holidayName.trim()) {
      Alert.alert('입력 오류', '공휴일 이름을 입력해주세요.');
      return;
    }
    
    try {
      setSaving(true);
      
      // 날짜 형식 변환 (YYYY-MM-DD)
      const dateString = holidayDate.toISOString().split('T')[0];
      
      const holidayData: any = {
        name: holidayName.trim(),
        date: dateString,
        isHoliday: isHolidayEnabled
      };

        // description이 있을 때만 추가
        if (holidayDescription.trim()) {
          holidayData.description = holidayDescription.trim();
        }
      
      let result;
      
      if (editingHoliday && editingHoliday.id) {
        // 기존 공휴일 업데이트
        result = await updateTemporaryHoliday(editingHoliday.id, holidayData);
        
        if (result.success) {
          // 목록 업데이트
          setHolidays(prev => prev.map(h => 
            h.id === editingHoliday.id 
              ? { ...h, ...holidayData, id: h.id }
              : h
          ));
          setModalVisible(false);
          Alert.alert('성공', '공휴일이 업데이트되었습니다.');
        }
      } else {
        // 새 공휴일 추가
        result = await addTemporaryHoliday(holidayData);
        
        if (result.success && result.holiday) {
          // 새 공휴일 목록에 추가 (날짜 순으로 다시 정렬)
          const newHoliday = result.holiday;
          setHolidays(prev => [...prev, newHoliday].sort((a, b) => 
            a.date.localeCompare(b.date)
          ));
          setModalVisible(false);
          Alert.alert('성공', '새 공휴일이 추가되었습니다.');
        }
      }
      
      if (!result?.success) {
        Alert.alert('오류', result?.error || '저장 중 오류가 발생했습니다.');
      }
    } catch (error) {
      console.error('공휴일 저장 오류:', error);
      Alert.alert('오류', '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };
  
  // 연도 변경 핸들러
  const handleYearChange = (increment: number) => {
    setSelectedYear(prev => prev + increment);
  };
  
  // 날짜 포맷 함수
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      weekday: 'long'
    });
  };
  
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* 관리자 헤더 추가 */}
      <AdminHeader title="공휴일 관리" />
      
      <View style={styles.yearSelector}>
        <TouchableOpacity 
          style={[styles.yearButton, { backgroundColor: colors.card }]}
          onPress={() => handleYearChange(-1)}
        >
          <Text style={[styles.yearButtonText, { color: colors.text }]}>◀</Text>
        </TouchableOpacity>
        
        <Text style={[styles.yearText, { color: colors.text }]}>{selectedYear}년</Text>
        
        <TouchableOpacity 
          style={[styles.yearButton, { backgroundColor: colors.card }]}
          onPress={() => handleYearChange(1)}
        >
          <Text style={[styles.yearButtonText, { color: colors.text }]}>▶</Text>
        </TouchableOpacity>
      </View>
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={[styles.loadingText, { color: colors.text }]}>
            {refreshing ? '새로고침 중...' : '공휴일 로드 중...'}
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={holidays}
            keyExtractor={(item) => item.id || item.date}
            renderItem={({ item }) => (
              <View style={[styles.holidayItem, { backgroundColor: colors.card }]}>
                <View style={styles.holidayInfo}>
                  <Text style={[styles.holidayName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.holidayDate, { color: colors.lightGray }]}>
                    {formatDate(item.date)}
                  </Text>
                  {item.description && (
                    <Text style={[styles.holidayDescription, { color: colors.darkGray }]}>
                      {item.description}
                    </Text>
                  )}
                  
                  <View style={styles.holidayStatus}>
                    <View style={[
                      styles.statusIndicator, 
                      { backgroundColor: item.isHoliday ? '#4CAF50' : '#757575' }
                    ]} />
                    <Text style={[styles.statusText, { color: colors.lightGray }]}>
                      {item.isHoliday ? '공휴일' : '기념일'}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.actionsContainer}>
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.editButton]}
                    onPress={() => handleEditHoliday(item)}
                  >
                    <Text style={styles.actionButtonText}>수정</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => handleDeleteHoliday(item)}
                  >
                    <Text style={styles.deleteButtonText}>삭제</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: colors.text }]}>
                  {selectedYear}년에 등록된 임시 공휴일이 없습니다.
                </Text>
                <Text style={[styles.emptySubtext, { color: colors.lightGray }]}>
                  아래 버튼을 눌러 새로운 공휴일을 추가해 보세요.
                </Text>
              </View>
            }
            contentContainerStyle={styles.listContent}
          />
          
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.tint }]}
            onPress={handleAddHoliday}
          >
            <Text style={styles.addButtonText}>+ 새 공휴일 추가</Text>
          </TouchableOpacity>
        </>
      )}
      
      {/* 공휴일 추가/수정 모달 */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{modalTitle}</Text>
            
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>공휴일 이름</Text>
              <TextInput
                style={[styles.input, { 
                  backgroundColor: colors.inputBackground, 
                  borderColor: colors.inputBorder,
                  color: colors.text
                }]}
                placeholder="공휴일 이름"
                placeholderTextColor={colors.lightGray}
                value={holidayName}
                onChangeText={setHolidayName}
              />
            </View>
            
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>날짜</Text>
              <TouchableOpacity
                style={[styles.datePickerButton, { 
                  backgroundColor: colors.inputBackground, 
                  borderColor: colors.inputBorder
                }]}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={[styles.datePickerButtonText, { color: colors.text }]}>
                  {holidayDate.toLocaleDateString('ko-KR')}
                </Text>
              </TouchableOpacity>
              
              {showDatePicker && (
                <DateTimePicker
                  value={holidayDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleDateChange}
                />
              )}
            </View>
            
            <View style={styles.formGroup}>
              <View style={styles.switchContainer}>
                <Text style={[styles.label, { color: colors.text }]}>공휴일 여부</Text>
                <Switch
                  value={isHolidayEnabled}
                  onValueChange={setIsHolidayEnabled}
                  trackColor={{ false: '#767577', true: '#81b0ff' }}
                  thumbColor={isHolidayEnabled ? colors.tint : '#f4f3f4'}
                />
              </View>
              <Text style={[styles.switchHelp, { color: colors.lightGray }]}>
                {isHolidayEnabled 
                  ? '휴일로 설정됩니다. 캘린더에 강조 표시됩니다.' 
                  : '기념일로 설정됩니다. 캘린더에 일반 표시됩니다.'}
              </Text>
            </View>
            
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>설명 (선택사항)</Text>
              <TextInput
                style={[styles.input, styles.textArea, { 
                  backgroundColor: colors.inputBackground, 
                  borderColor: colors.inputBorder,
                  color: colors.text
                }]}
                placeholder="공휴일에 대한 설명"
                placeholderTextColor={colors.lightGray}
                value={holidayDescription}
                onChangeText={setHolidayDescription}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
            
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton, { backgroundColor: colors.secondary }]}
                onPress={() => setModalVisible(false)}
                disabled={saving}
              >
                <Text style={[styles.cancelButtonText, { color: colors.darkGray }]}>취소</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  styles.modalButton, 
                  { backgroundColor: colors.tint },
                  saving && { opacity: 0.7 }
                ]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>저장</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  yearSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  yearButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  yearButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  yearText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  holidayItem: {
    flexDirection: 'row',
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  holidayInfo: {
    flex: 1,
  },
  holidayName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  holidayDate: {
    fontSize: 14,
    marginBottom: 4,
  },
  holidayDescription: {
    fontSize: 14,
    marginBottom: 8,
  },
  holidayStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
  },
  actionsContainer: {
    justifyContent: 'center',
  },
  actionButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  editButton: {
    backgroundColor: '#2196F3',
  },
  deleteButton: {
    backgroundColor: '#F44336',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  addButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 5,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // 모달 관련 스타일
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 20,
  },
  modalContent: {
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  datePickerButton: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  datePickerButtonText: {
    fontSize: 16,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  switchHelp: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    marginRight: 10,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
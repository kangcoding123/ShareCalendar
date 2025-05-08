// components/calendar/event/GroupSelector.tsx
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet
} from 'react-native';
import { Group } from '../../../services/groupService';

interface GroupSelectorProps {
  groups: Group[];
  selectedGroups: string[];
  onToggleGroup: (groupId: string) => void;
  colors: any;
  isExistingEvent?: boolean; // 이 속성 추가
}

const GroupSelector = ({ 
  groups, 
  selectedGroups, 
  onToggleGroup, 
  colors,
  isExistingEvent = false // 기본값 설정과 함께 이 매개변수 추가
}: GroupSelectorProps) => {
  return (
    <View style={styles.groupSelector}>
      {/* 기존 일정일 경우 안내 메시지 제거 */}
      
      {/* 개인 일정 옵션 */}
      <TouchableOpacity
        style={[
          styles.groupOption,
          { 
            backgroundColor: selectedGroups.includes('personal') ? 
              colors.secondary : colors.inputBackground
          },
          selectedGroups.includes('personal') && { 
            borderWidth: 1,
            borderColor: colors.tint
          }
        ]}
        onPress={() => onToggleGroup('personal')}
      >
        <View 
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            backgroundColor: colors.tint,
            borderRadius: 2
          }} 
        />
        <Text style={[styles.groupOptionText, { color: colors.text }]}>개인 일정</Text>
      </TouchableOpacity>
      
      {/* 그룹 옵션 */}
      {groups.map((group) => (
        <TouchableOpacity
          key={group.id}
          style={[
            styles.groupOption,
            { 
              backgroundColor: selectedGroups.includes(group.id) ? 
                colors.secondary : colors.inputBackground
            },
            selectedGroups.includes(group.id) && { 
              borderWidth: 1,
              borderColor: group.color || colors.tint
            }
          ]}
          onPress={() => onToggleGroup(group.id)}
        >
          <View 
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 4,
              backgroundColor: group.color || colors.tint,
              borderRadius: 2
            }} 
          />
          <Text style={[styles.groupOptionText, { color: colors.text }]}>{group.name}</Text>
        </TouchableOpacity>
      ))}
      
      {/* 다중 그룹 선택 설명 표시 - 기존 일정/새 일정 구분 없이 항상 표시 */}
      {selectedGroups.length > 1 && (
        <View style={styles.multiGroupInfoContainer}>
          <Text style={[styles.multiGroupInfoText, { color: colors.lightGray }]}>
            동일한 일정이 선택한 모든 그룹에 공유됩니다.
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  groupSelector: {
    flexDirection: 'column',
    marginBottom: 10
  },
  groupOption: {
    flexDirection: 'row',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 12,
    marginBottom: 8, 
    paddingLeft: 14,
    position: 'relative',
    alignItems: 'center'
  },
  groupOptionText: {
    fontSize: 14
  },
  multiGroupInfoContainer: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
    padding: 10,
    marginTop: 5,
    marginBottom: 15
  },
  multiGroupInfoText: {
    fontSize: 12,
    fontStyle: 'italic'
  },
  // warningContainer와 warningText 스타일 제거
});

export default GroupSelector;
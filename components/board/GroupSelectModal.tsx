// components/board/GroupSelectModal.tsx
import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Group } from '../../services/groupService';

interface GroupSelectModalProps {
  visible: boolean;
  onClose: () => void;
  groups: Group[];
  onSelectGroup: (groupId: string, groupName: string) => void;
  colors: any;
  unreadCounts?: { [groupId: string]: number };
}

export default function GroupSelectModal({
  visible,
  onClose,
  groups,
  onSelectGroup,
  colors,
  unreadCounts = {},
}: GroupSelectModalProps) {
  const renderGroupItem = ({ item }: { item: Group }) => {
    const unreadCount = unreadCounts[item.id] || 0;

    return (
      <TouchableOpacity
        style={[styles.groupItem, { borderBottomColor: colors.border }]}
        onPress={() => onSelectGroup(item.id, item.name)}
        activeOpacity={0.6}
      >
        <View style={[styles.colorDot, { backgroundColor: item.color || '#4CAF50' }]} />
        <View style={styles.groupInfo}>
          <Text style={[styles.groupName, { color: colors.text }]}>{item.name}</Text>
          {item.description && (
            <Text style={[styles.groupDescription, { color: colors.lightGray }]} numberOfLines={1}>
              {item.description}
            </Text>
          )}
        </View>
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.container, { backgroundColor: colors.background }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>그룹 선택</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.6}>
              <View style={[styles.closeCircle, { backgroundColor: colors.border }]}>
                <Feather name="x" size={16} color={colors.lightGray} />
              </View>
            </TouchableOpacity>
          </View>

          {groups.length > 0 ? (
            <FlatList
              data={groups}
              keyExtractor={(item) => item.id}
              renderItem={renderGroupItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Feather name="users" size={40} color={colors.lightGray} />
              <Text style={[styles.emptyText, { color: colors.text }]}>
                참여 중인 그룹이 없습니다
              </Text>
              <Text style={[styles.emptySubText, { color: colors.lightGray }]}>
                그룹에 참여하면 게시판을 이용할 수 있습니다
              </Text>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  container: {
    width: '100%',
    maxHeight: '70%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#D1D1D6',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  closeButton: {
    padding: 4,
  },
  closeCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: 34,
  },
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 14,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '500',
  },
  groupDescription: {
    fontSize: 13,
    marginTop: 3,
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubText: {
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
  unreadBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});

// components/ui/IconSymbol.ios.tsx

import { Ionicons } from '@expo/vector-icons';
import { StyleProp, ViewStyle } from 'react-native';

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
  weight = 'regular',
}: {
  name: string;
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  weight?: string;
}) {
  // SF Symbols 이름을 Ionicons 이름으로 매핑
  const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
    'house': 'home',
    'house.fill': 'home',
    'calendar': 'calendar',
    'person.2.fill': 'people',
    'chevron.left.forwardslash.chevron.right': 'code-slash',
    'paperplane': 'paper-plane',
    'bell': 'notifications',
    // 필요한 다른 아이콘 매핑 추가
  };
  
  const iconName = iconMap[name] || 'help-circle';
  
  return (
    <Ionicons
      name={iconName}
      size={size}
      color={color}
      style={style}
    />
  );
}
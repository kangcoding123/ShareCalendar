// components/ui/IconSymbol.tsx
import { Ionicons } from '@expo/vector-icons';
import { SymbolWeight } from 'expo-symbols';
import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';

// Ionicons의 name 속성에 사용 가능한 타입을 명시적으로 가져옴
type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

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
  weight?: SymbolWeight;
}) {
  // SF Symbol 이름을 Ionicons 이름으로 변환하는 함수
  const getIoniconsName = (): IoniconsName => {
    // 각 SF Symbol 이름에 대응하는 Ionicons 이름 반환
    // 주의: 모든 값은 Ionicons에서 실제로 지원하는 문자열이어야 함
    switch(name) {
      case 'house': return 'home-outline';
      case 'calendar': return 'calendar-outline';
      case 'person.2.fill': return 'people-outline';
      case 'house.fill': return 'home';
      case 'paperplane.fill': return 'paper-plane';
      case 'chevron.left.forwardslash.chevron.right': return 'code-outline';
      case 'chevron.right': return 'chevron-forward';
      case 'shield.lefthalf.filled': return 'settings-outline';
      default: return 'help-circle-outline';
    }
  };
  
  // 올바른 Ionicons 이름 가져오기
  const iconName = getIoniconsName();
  
  return (
    <Ionicons 
      name={iconName}
      size={size} 
      color={color} 
      style={style as any} // 스타일은 여전히 any 타입으로 처리
    />
  );
}
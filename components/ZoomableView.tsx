// components/ZoomableView.tsx
import React from 'react';
import { StyleSheet, ViewProps } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

interface ZoomableViewProps extends ViewProps {
  minScale?: number;
  maxScale?: number;
  children: React.ReactNode;
  scrollRef?: React.RefObject<any>;
}

// 명시적인 이벤트 타입 정의
type PinchEventType = { scale: number; focalX: number; focalY: number };
type PanEventType = { translationX: number; translationY: number };

export const ZoomableView: React.FC<ZoomableViewProps> = ({
  minScale = 0.5,
  maxScale = 3,
  style,
  children,
  scrollRef,
  ...props
}) => {
  // 상태 관리
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  
  // 핀치 제스처 정의
  const pinchGesture = Gesture.Pinch()
    // minPointers 제거 (지원되지 않음)
    .onStart((event: PinchEventType) => {
      focalX.value = event.focalX;
      focalY.value = event.focalY;
    })
    .onUpdate((event: PinchEventType) => {
      // 확대/축소 처리
      scale.value = Math.min(maxScale, Math.max(minScale, savedScale.value * event.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      
      // 축소된 경우 위치 초기화
      if (scale.value <= 1) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    })
    .shouldCancelWhenOutside(false);
  
  // 패닝 제스처 정의
  const panGesture = Gesture.Pan()
    .minDistance(5)
    .averageTouches(true)
    .onUpdate((event: PanEventType) => {
      // 확대 상태일 때만 이동 가능
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + event.translationX;
        translateY.value = savedTranslateY.value + event.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .shouldCancelWhenOutside(false);
  
  // 스크롤뷰와의 충돌 방지
  if (scrollRef?.current) {
    pinchGesture.blocksExternalGesture(scrollRef);
    panGesture.blocksExternalGesture(scrollRef);
  }
  
  // 두 제스처 동시 사용
  const gesture = Gesture.Simultaneous(pinchGesture, panGesture);
  
  // 애니메이션 스타일
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value }
      ],
    };
  });
  
  return (
    <GestureHandlerRootView style={styles.container}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.content, style, animatedStyle]} {...props}>
          {children}
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
  },
});

export default ZoomableView;
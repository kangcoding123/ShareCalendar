// components/calendar/ZoomableCalendar.tsx - 단순화된 버전
import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { ZoomableView } from '../ZoomableView';
import Calendar from './Calendar';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

interface ZoomableCalendarProps {
  events: Record<string, any[]>;
  onDayPress: (day: any, events: any[]) => void;
  colorScheme: ReturnType<typeof useColorScheme>;
}

export default function ZoomableCalendar({ 
  events, 
  onDayPress,
  colorScheme
}: ZoomableCalendarProps) {
  const colors = Colors[colorScheme || 'light'];

  return (
    <View style={styles.container}>
      {/* 확대/축소 안내 텍스트 */}
      <View style={[styles.helpTextContainer, { backgroundColor: colors.card + '80' }]}>
        <Text style={[styles.helpText, { color: colors.text }]}>
          두 손가락으로 확대/축소하세요
        </Text>
      </View>
      
      {/* 확대/축소 가능한 캘린더 */}
      <ZoomableView
        minScale={0.8}
        maxScale={2.0}
        style={styles.zoomableContainer}
      >
        <Calendar
          events={events}
          onDayPress={onDayPress}
          colorScheme={colorScheme}
        />
      </ZoomableView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  zoomableContainer: {
    width: '100%',
  },
  helpTextContainer: {
    alignSelf: 'center',
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  helpText: {
    fontSize: 12,
    textAlign: 'center',
  }
});
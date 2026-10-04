import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { redesign } from '../../theme/redesign';

export default function MoneyRecapStoryHeader({ isDark, onClose }) {
  return (
    <Pressable
      onPress={onClose}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="닫기"
      style={styles.button}
    >
      <Feather name="x" size={22} color={isDark ? '#FFFFFF' : redesign.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

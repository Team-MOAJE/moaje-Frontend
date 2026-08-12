import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { moneyRecapColors } from '../../constants/moneyRecapTheme';

export default function MoneyRecapStoryHeader({ isDark, onClose }) {
  return (
    <Pressable
      onPress={onClose}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="닫기"
      style={[
        styles.button,
        { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(74,94,42,0.1)' },
      ]}
    >
      <Feather
        name="x"
        size={16}
        color={isDark ? moneyRecapColors.white : moneyRecapColors.primary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

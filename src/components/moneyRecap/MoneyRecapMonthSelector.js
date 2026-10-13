import React from 'react';
import { ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { redesign } from '../../theme/redesign';

// items = [{ value, label }]. 월 선택 UI만 담당하며 API·세션을 알지 못한다.
export default function MoneyRecapMonthSelector({ items, selectedValue, disabled, onSelect }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {items.map(item => {
        const selected = item.value === selectedValue;
        return (
          <Pressable
            key={item.value}
            onPress={() => {
              if (!disabled) onSelect?.(item.value);
            }}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected, disabled: !!disabled }}
            style={({ pressed }) => [
              styles.chip,
              selected && styles.chipSelected,
              disabled && !selected && styles.chipDisabled,
              pressed && styles.chipPressed,
            ]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, marginBottom: 16 },
  content: { gap: 8, paddingVertical: 4 },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: redesign.surfaceSoft,
    borderWidth: 1,
    borderColor: redesign.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: redesign.accent, borderColor: redesign.accent },
  chipDisabled: { opacity: 0.5 },
  chipPressed: { opacity: 0.85 },
  chipText: { fontSize: 14, fontWeight: '600', color: redesign.textSecondary },
  chipTextSelected: { color: '#FFFFFF' },
});

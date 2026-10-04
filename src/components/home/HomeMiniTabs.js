import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { redesign } from '../../theme';

export default function HomeMiniTabs({ tabs, activeKey, onChange }) {
  return (
    <View style={styles.row}>
      {tabs.map(tab => {
        const isActive = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text
              numberOfLines={1}
              style={[styles.label, isActive ? styles.labelActive : styles.labelInactive]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 16,
  },
  labelActive: {
    fontWeight: '700',
    color: redesign.accent,
  },
  labelInactive: {
    fontWeight: '500',
    color: redesign.textSecondary,
  },
  pressed: {
    opacity: 0.6,
  },
});

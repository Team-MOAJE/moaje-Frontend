import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, Animated, StyleSheet } from 'react-native';
import { redesign } from '../../theme/redesign';

export function SettingToggle({ label, defaultOn = false, onChange }) {
  const [on, setOn] = useState(defaultOn);
  const anim = useRef(new Animated.Value(defaultOn ? 1 : 0)).current;

  const toggle = () => {
    const next = !on;
    setOn(next);
    Animated.timing(anim, {
      toValue: next ? 1 : 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
    onChange?.(next);
  };

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 22] });

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.9}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={[styles.track, { backgroundColor: on ? redesign.accent : redesign.navInactive }]}
      >
        <Animated.View style={[styles.thumb, { transform: [{ translateX }] }]} />
      </TouchableOpacity>
    </View>
  );
}

export function SettingValueRow({ label, value, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, onPress && pressed && styles.rowPressed]}
    >
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </Pressable>
  );
}

export function SettingDivider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
  },
  rowPressed: {
    backgroundColor: redesign.surfaceSoft,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: redesign.textPrimary,
    flex: 1,
  },
  value: {
    fontSize: 14,
    color: redesign.textSecondary,
  },
  track: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  divider: {
    height: 1,
    backgroundColor: redesign.divider,
  },
});

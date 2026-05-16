import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { colors } from '../../theme';

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
        style={[styles.track, { backgroundColor: on ? colors.olive : colors.border }]}
      >
        <Animated.View style={[styles.thumb, { transform: [{ translateX }] }]} />
      </TouchableOpacity>
    </View>
  );
}

export function SettingValueRow({ label, value, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.75 : 1} style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </TouchableOpacity>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  label: {
    fontSize: 14,
    color: colors.textDark,
    flex: 1,
  },
  value: {
    fontSize: 14,
    color: colors.textMid,
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
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
});

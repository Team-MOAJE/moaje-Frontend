import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { redesign } from '../../theme/redesign';

// pill/배경 없이 텍스트만 쓰는 태그. primary 변형만 올리브로 강조한다.
export default function MoneyRecapTag({ label, variant = 'default' }) {
  return <Text style={[styles.text, variant === 'primary' && styles.primary]}>{label}</Text>;
}

const styles = StyleSheet.create({
  text: { fontSize: 13, color: redesign.textSecondary },
  primary: { fontWeight: '700', color: redesign.accent },
});

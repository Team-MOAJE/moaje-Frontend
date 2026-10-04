import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../theme/redesign';

// 카드가 아니라 divider로 구분되는 flat key/value 행. accent=true면 값만 올리브로 강조한다.
export default function MoneyRecapMetricCard({ label, value, sub, accent }) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.label}>{label}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
      <Text style={[styles.value, accent && styles.valueAccent]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: redesign.divider,
  },
  left: { flex: 1, paddingRight: 12 },
  label: { fontSize: 14, color: redesign.textSecondary },
  sub: { fontSize: 12, color: redesign.textSecondary, marginTop: 2 },
  value: { fontSize: 18, fontWeight: '700', color: redesign.textPrimary },
  valueAccent: { color: redesign.accent },
});

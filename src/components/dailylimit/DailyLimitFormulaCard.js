import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../theme';

const SIGN = { plus: '+', minus: '−' };

// items: [{ label, caption?, op: 'plus'|'minus'|null, displayValue }]
function FormulaRow({ label, caption, displayValue, op, showDivider }) {
  const sign = SIGN[op] ?? '';
  return (
    <View style={[styles.row, showDivider && styles.divider]}>
      <View style={styles.labelWrap}>
        <Text style={styles.label}>{label}</Text>
        {!!caption && <Text style={styles.caption}>{caption}</Text>}
      </View>
      <Text style={[styles.value, op === 'plus' && styles.plus, op === 'minus' && styles.minus]}>
        {`${sign}${displayValue}`}
      </Text>
    </View>
  );
}

export default function DailyLimitFormulaCard({ title, items = [] }) {
  return (
    <View>
      <View style={styles.titleRow}>
        <View style={styles.titleBar} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.list}>
        {items.map((item, i) => (
          <FormulaRow
            key={item.label}
            label={item.label}
            caption={item.caption}
            displayValue={item.displayValue}
            op={item.op}
            showDivider={i < items.length - 1}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleBar: {
    width: 3,
    height: 18,
    backgroundColor: redesign.accent,
    marginRight: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  list: {
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: redesign.divider,
  },
  labelWrap: {
    flex: 1,
    marginRight: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  caption: {
    fontSize: 12,
    color: redesign.textSecondary,
    marginTop: 3,
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  plus: {
    color: redesign.accent,
  },
  minus: {
    color: redesign.textSecondary,
  },
});

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, shadows } from '../../theme';

const OP_ICON = {
  plus: { name: 'plus', lib: 'Feather' },
  minus: { name: 'minus', lib: 'Feather' },
  divide: { name: 'division', lib: 'MCI' },
  equal: { name: 'equal', lib: 'MCI' },
};

function OpIcon({ op }) {
  if (!op) return null;
  const cfg = OP_ICON[op];
  if (!cfg) return null;
  if (cfg.lib === 'MCI') {
    return <MaterialCommunityIcons name={cfg.name} size={14} color={colors.textMid} />;
  }
  return <Feather name={cfg.name} size={14} color={colors.textMid} />;
}

function FormulaRow({ label, displayValue, op, highlight }) {
  return (
    <View style={styles.itemRow}>
      <View style={[styles.opBox, !op && styles.opBoxHidden]}>
        <OpIcon op={op} />
      </View>

      {highlight ? (
        <LinearGradient
          colors={[colors.oliveDark, colors.oliveDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.highlightBox}
        >
          <Text style={[styles.itemLabel, styles.highlightText]}>{label}</Text>
          <Text style={[styles.itemValue, styles.highlightText]}>{displayValue}</Text>
        </LinearGradient>
      ) : (
        <View style={styles.normalBox}>
          <Text style={styles.itemLabel}>{label}</Text>
          <Text style={styles.itemValue}>{displayValue}</Text>
        </View>
      )}
    </View>
  );
}

export default function DailyLimitFormulaCard({ items = [] }) {
  return (
    <View style={[styles.container, shadows.md]}>
      <Text style={styles.title}>가용금액 계산 요약</Text>
      <Text style={styles.sub}>각 항목을 더하고 빼서 하루 기준으로 나눈 결과예요.</Text>
      <View style={styles.list}>
        {items.map(item => (
          <FormulaRow
            key={item.label}
            label={item.label}
            displayValue={item.displayValue}
            op={item.op}
            highlight={item.highlight}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.xl,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textDark,
  },
  sub: {
    fontSize: 11,
    color: 'rgba(111,127,63,0.8)',
    marginTop: 2,
    marginBottom: 12,
  },
  list: {
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  opBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgMain,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  opBoxHidden: {
    opacity: 0,
  },
  normalBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgMain,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  highlightBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  itemLabel: {
    fontSize: 12,
    color: colors.textDark,
  },
  itemValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
  },
  highlightText: {
    color: colors.white,
  },
});

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, shadows } from '../../theme';

const STATUS_CONFIG = {
  safe: {
    label: '안정',
    message: '오늘은 아직 여유 있어요.',
    color: colors.green,
    bg: 'rgba(47,158,68,0.1)',
    border: 'rgba(47,158,68,0.2)',
    iconName: 'leaf',
    iconLib: 'MCI',
    badgeBg: 'rgba(47,158,68,0.15)',
    badgeFg: '#2F9E44',
  },
  warning: {
    label: '주의',
    message: '오늘 권장 금액에 가까워지고 있어요.',
    color: colors.orange,
    bg: 'rgba(255,159,28,0.1)',
    border: 'rgba(255,159,28,0.2)',
    iconName: 'alert-triangle',
    iconLib: 'Feather',
    badgeBg: 'rgba(255,159,28,0.15)',
    badgeFg: '#FF9F1C',
  },
  exceeded: {
    label: '초과',
    message: '오늘 가용금액을 초과했어요.',
    color: colors.red,
    bg: 'rgba(229,72,77,0.1)',
    border: 'rgba(229,72,77,0.2)',
    iconName: 'alert-octagon',
    iconLib: 'Feather',
    badgeBg: 'rgba(229,72,77,0.15)',
    badgeFg: '#E5484D',
  },
};

const formatCurrency = amount => `${Number(amount).toLocaleString()}원`;

export default function DailyLimitStatusCard({
  status = 'safe',
  recommended = 18500,
  spent = 6200,
}) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.safe;
  const remaining = recommended - spent;

  const renderIcon = () => {
    if (cfg.iconLib === 'MCI') {
      return <MaterialCommunityIcons name={cfg.iconName} size={16} color={cfg.color} />;
    }
    return <Feather name={cfg.iconName} size={16} color={cfg.color} />;
  };

  return (
    <View style={[styles.container, shadows.md]}>
      <View style={styles.header}>
        <Text style={styles.title}>오늘 소비 상태</Text>
        <View style={[styles.badge, { backgroundColor: cfg.badgeBg }]}>
          <Text style={[styles.badgeText, { color: cfg.badgeFg }]}>{cfg.label}</Text>
        </View>
      </View>

      <View style={[styles.statusBox, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
        {renderIcon()}
        <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.message}</Text>
      </View>

      <View style={styles.grid}>
        {[
          ['권장', recommended],
          ['사용', spent],
          ['남음', remaining],
        ].map(([label, value]) => (
          <View key={label} style={styles.cell}>
            <Text style={styles.cellKey}>{label}</Text>
            <Text style={styles.cellVal}>{formatCurrency(value)}</Text>
          </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textDark,
  },
  badge: {
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  statusText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
  grid: {
    flexDirection: 'row',
    gap: 8,
  },
  cell: {
    flex: 1,
    backgroundColor: colors.bgMain,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  cellKey: {
    fontSize: 10,
    color: colors.textMid,
  },
  cellVal: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textDark,
    marginTop: 2,
  },
});

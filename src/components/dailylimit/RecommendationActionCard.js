import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, shadows } from '../../theme';

function ActionIcon({ iconName, iconLib }) {
  if (iconLib === 'MCI') {
    return <MaterialCommunityIcons name={iconName} size={16} color={colors.textMid} />;
  }
  return <Feather name={iconName} size={16} color={colors.textMid} />;
}

function RecommendationRow({ iconName, iconLib = 'Feather', title, desc, cta, action, onAction }) {
  return (
    <View style={styles.row}>
      <View style={styles.iconBox}>
        <ActionIcon iconName={iconName} iconLib={iconLib} />
      </View>

      <View style={styles.textArea}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDesc}>{desc}</Text>
      </View>

      <TouchableOpacity onPress={() => onAction(action)} activeOpacity={0.8} style={styles.ctaBtn}>
        <Text style={styles.ctaText}>{cta}</Text>
        <Feather name="chevron-right" size={12} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

export default function RecommendationActionCard({ items = [], onAction }) {
  return (
    <View style={[styles.container, shadows.md]}>
      <Text style={styles.title}>추천 행동</Text>
      <Text style={styles.sub}>오늘 안전 소비를 도와줄 작은 행동들이에요.</Text>
      <View style={styles.list}>
        {items.map(item => (
          <RecommendationRow key={item.title} {...item} onAction={onAction} />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgMain,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.xs,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textArea: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textDark,
  },
  rowDesc: {
    fontSize: 11,
    color: 'rgba(111,127,63,0.8)',
    marginTop: 2,
    lineHeight: 16,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.textDark,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexShrink: 0,
  },
  ctaText: {
    fontSize: 11,
    color: colors.white,
  },
});

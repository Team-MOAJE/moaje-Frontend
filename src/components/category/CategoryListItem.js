import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius } from '../../theme';

function ComingSoonBadge() {
  return (
    <View style={badgeStyles.container}>
      <Text style={badgeStyles.text}>준비 중</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,159,28,0.1)',
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 10,
    color: '#FF9F1C',
  },
});

/**
 * @param {string} iconName - Feather 아이콘 이름
 * @param {string} title
 * @param {string} description
 * @param {'active'|'comingSoon'|'disabled'} variant
 * @param {function} onPress
 */
export default function CategoryListItem({
  iconName,
  title,
  description,
  variant = 'active',
  onPress,
}) {
  const dim = variant === 'comingSoon';
  const disabled = variant === 'disabled';

  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      activeOpacity={disabled ? 1 : 0.75}
      disabled={disabled}
      style={[styles.container, dim && styles.dimContainer, disabled && styles.disabledContainer]}
    >
      <View style={[styles.iconBox, dim && { opacity: 0.55 }]}>
        <Feather name={iconName} size={20} color={dim ? 'rgba(111,127,63,0.6)' : colors.textMid} />
      </View>

      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, dim && { color: 'rgba(52,66,37,0.55)' }]}>{title}</Text>
          {variant === 'comingSoon' && <ComingSoonBadge />}
        </View>
        <Text style={[styles.desc, dim && { color: 'rgba(111,127,63,0.5)' }]}>{description}</Text>
      </View>

      {variant === 'comingSoon' ? (
        <Feather name="clock" size={16} color="rgba(111,127,63,0.45)" />
      ) : (
        <Feather name="chevron-right" size={16} color="rgba(111,127,63,0.6)" />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.cream,
  },
  dimContainer: {
    backgroundColor: colors.bgLight,
  },
  disabledContainer: {
    backgroundColor: colors.cream,
    opacity: 0.4,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.bgMain,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textDark,
  },
  desc: {
    fontSize: 12,
    color: 'rgba(111,127,63,0.8)',
  },
});

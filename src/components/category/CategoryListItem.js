import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { redesign } from '../../theme';

/**
 * Category 메뉴 한 줄. 카드/그림자 없이 divider로만 구분한다.
 * @param {string} title
 * @param {string} description
 * @param {boolean} showDivider - 하단 구분선 표시 여부
 * @param {function} onPress
 */
export default function CategoryListItem({ title, description, showDivider = true, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <View style={[styles.row, showDivider && styles.divider]}>
        <View style={styles.textWrap}>
          <Text style={styles.title}>{title}</Text>
          {!!description && <Text style={styles.desc}>{description}</Text>}
        </View>
        <Feather name="chevron-right" size={18} color={redesign.navInactive} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: redesign.bg,
  },
  pressed: {
    backgroundColor: redesign.surfaceSoft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: redesign.divider,
  },
  textWrap: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  desc: {
    fontSize: 13,
    color: redesign.textSecondary,
    marginTop: 3,
  },
});

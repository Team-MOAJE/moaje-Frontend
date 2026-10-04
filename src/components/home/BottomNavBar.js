import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { redesign } from '../../theme';
import { HomeIcon, TransferIcon, CategoryIcon } from './BottomNavIcons';

const NAV_ITEMS = [
  { key: 'home', label: '홈', Icon: HomeIcon, handler: 'onHomePress' },
  { key: 'transfer', label: '송금', Icon: TransferIcon, handler: 'onTransferPress' },
  { key: 'category', label: '카테고리', Icon: CategoryIcon, handler: 'onCategoryPress' },
];

export default function BottomNavBar({
  onHomePress,
  onTransferPress,
  onCategoryPress,
  activeKey = 'home',
}) {
  const handlers = { onHomePress, onTransferPress, onCategoryPress };

  return (
    <View style={styles.container}>
      {NAV_ITEMS.map(({ key, label, Icon, handler }) => {
        const isActive = key === activeKey;
        const color = isActive ? redesign.accent : redesign.navInactive;
        return (
          <Pressable
            key={key}
            onPress={handlers[handler]}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: isActive }}
            style={({ pressed }) => [styles.tabItem, pressed && styles.tabItemPressed]}
          >
            <Icon size={24} color={color} active={isActive} />
            <Text style={[styles.label, { color }, isActive && styles.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: redesign.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: redesign.divider,
    paddingTop: 8,
    paddingBottom: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 48,
  },
  tabItemPressed: {
    opacity: 0.6,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
  labelActive: {
    fontWeight: '700',
  },
});

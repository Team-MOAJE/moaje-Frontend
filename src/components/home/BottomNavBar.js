import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { colors, radius, shadows } from '../../theme';

const NAV_ITEMS = [
  { key: 'home', label: '홈', iconName: 'home', handler: 'onHomePress', active: true },
  { key: 'transfer', label: '송금', iconName: 'send', handler: 'onTransferPress', active: false },
  { key: 'chart', label: '분석', iconName: 'bar-chart-2', handler: 'onChartPress', active: false },
  { key: 'grid', label: '카테고리', iconName: 'grid', handler: 'onGridPress', active: false },
];

export default function BottomNavBar({ onHomePress, onTransferPress, onChartPress, onGridPress }) {
  const handlers = { onHomePress, onTransferPress, onChartPress, onGridPress };

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        {NAV_ITEMS.map(item => {
          const onPress = handlers[item.handler];
          if (item.active) {
            return (
              <Pressable
                key={item.key}
                onPress={onPress}
                style={({ pressed }) => [styles.tabItem, pressed && styles.tabItemPressed]}
              >
                <LinearGradient
                  colors={[colors.olive, colors.oliveLight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.activeTab}
                >
                  <Feather name={item.iconName} size={18} color={colors.white} />
                  <Text style={styles.activeLabel}>{item.label}</Text>
                </LinearGradient>
              </Pressable>
            );
          }
          return (
            <Pressable
              key={item.key}
              onPress={onPress}
              style={({ pressed }) => [
                styles.tabItem,
                styles.inactiveTab,
                pressed && styles.inactiveTabPressed,
              ]}
            >
              <Feather
                name={item.iconName}
                size={20}
                color={colors.textMid}
                style={{ opacity: 0.7 }}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 0,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderRadius: radius.xxxl + 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.xl,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xxxl,
    minHeight: 44,
  },
  tabItemPressed: {
    opacity: 0.8,
  },
  activeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.xxxl,
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: '100%',
  },
  activeLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
  inactiveTab: {
    paddingVertical: 10,
  },
  inactiveTabPressed: {
    backgroundColor: colors.bgOuter,
    borderRadius: radius.xxxl,
  },
});

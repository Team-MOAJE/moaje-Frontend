import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { colors, radius, shadows } from '../../theme';

export default function AppHeader({ onBellPress, userName }) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <LinearGradient
          colors={[colors.oliveLight, colors.olive]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.logoBox}
        >
          <Text style={styles.logoEmoji}>🌱</Text>
        </LinearGradient>
        <View style={styles.greetingBox}>
          <Text style={styles.greeting}>
            {userName ? `안녕하세요, ${userName}님` : '안녕하세요'}
          </Text>
          <Text style={styles.sub}>오늘의 안전 소비 한도를 확인해보세요</Text>
        </View>
      </View>
      <Pressable
        onPress={onBellPress}
        style={({ pressed }) => [styles.bellButton, pressed && styles.bellButtonPressed]}
      >
        <Feather name="bell" size={20} color={colors.textDark} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  logoBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: {
    fontSize: 20,
  },
  greetingBox: {
    flex: 1,
    gap: 2,
  },
  greeting: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textDark,
  },
  sub: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textDark,
    opacity: 0.7,
  },
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  bellButtonPressed: {
    backgroundColor: colors.bgOuter,
    opacity: 0.8,
  },
});

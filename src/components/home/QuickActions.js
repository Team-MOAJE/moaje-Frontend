import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { colors, radius, shadows } from '../../theme';

function PrimaryButton({ label, iconName, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.buttonWrapper, pressed && styles.buttonWrapperPressed]}
    >
      <LinearGradient
        colors={[colors.olive, colors.oliveDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.buttonInner}
      >
        <Feather name={iconName} size={20} color={colors.white} />
        <Text style={styles.primaryLabel}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function DefaultButton({ label, iconName, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.buttonWrapper,
        styles.defaultButton,
        pressed && styles.defaultButtonPressed,
      ]}
    >
      <Feather name={iconName} size={20} color={colors.textDark} />
      <Text style={styles.defaultLabel}>{label}</Text>
    </Pressable>
  );
}

function ComingSoonButton({ label, iconName }) {
  return (
    <View style={[styles.buttonWrapper, styles.comingSoonButton]}>
      <Feather name={iconName} size={20} color={colors.textMid} style={{ opacity: 0.55 }} />
      <Text style={styles.comingSoonLabel}>{label}</Text>
      <View style={styles.lockBadge}>
        <Feather name="lock" size={8} color={colors.textLight} />
      </View>
    </View>
  );
}

export default function QuickActions({ onTransfer, onHistory, onAnalysis }) {
  return (
    <View style={styles.container}>
      <PrimaryButton label="송금하기" iconName="send" onPress={onTransfer} />
      <ComingSoonButton label="계좌 연결" iconName="link-2" />
      <DefaultButton label="거래내역" iconName="file-text" onPress={onHistory} />
      <DefaultButton label="생활비 분석" iconName="pie-chart" onPress={onAnalysis} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 12,
    gap: 8,
  },
  buttonWrapper: {
    flex: 1,
    borderRadius: radius.lg,
    ...shadows.sm,
  },
  buttonWrapperPressed: {
    opacity: 0.75,
  },
  buttonInner: {
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  primaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.white,
    textAlign: 'center',
  },
  defaultButton: {
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  defaultButtonPressed: {
    backgroundColor: colors.bgOuter,
  },
  defaultLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textDark,
    textAlign: 'center',
  },
  comingSoonButton: {
    backgroundColor: colors.bgMain,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
    opacity: 0.75,
  },
  comingSoonLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textLight,
    textAlign: 'center',
  },
  lockBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 14,
    height: 14,
    borderRadius: radius.full,
    backgroundColor: colors.bgOuter,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

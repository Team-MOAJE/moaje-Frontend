import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, shadows } from '../../theme';

export default function DailyLimitCard({ onPress, amount, daysLeft, formulaItems }) {
  const safeItems = formulaItems ?? [];
  const displayAmount = amount != null ? `${Number(amount).toLocaleString()}원` : '-';
  const displayDays = daysLeft != null ? `다음 알바비까지 ${daysLeft}일 남았어요` : '';

  return (
    <TouchableOpacity activeOpacity={0.97} style={styles.wrapper} onPress={onPress}>
      <LinearGradient
        colors={[colors.oliveDark, colors.olive, colors.oliveMid]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.circleTopRight} />
        <View style={styles.circleBottomLeft} />

        <View style={styles.labelRow}>
          <Text style={styles.labelStar}>✦</Text>
          <Text style={styles.label}>오늘 안전하게 쓸 수 있는 금액</Text>
        </View>

        <Text style={styles.amount}>{displayAmount}</Text>
        {!!displayDays && <Text style={styles.subtitle}>{displayDays}</Text>}

        {safeItems.length > 0 && (
          <View style={styles.infoGrid}>
            {safeItems.slice(0, 4).map(item => (
              <View key={item.label} style={styles.infoBox}>
                <Text style={styles.infoLabel}>{item.label}</Text>
                <Text style={styles.infoValue}>
                  {item.displayValue ??
                    (item.unit
                      ? `${item.value}${item.unit}`
                      : `${Number(item.value).toLocaleString()}원`)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: radius.xxxl,
    ...shadows.lg,
  },
  card: {
    borderRadius: radius.xxxl,
    padding: 20,
    overflow: 'hidden',
  },
  circleTopRight: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.07)',
    top: -60,
    right: -40,
  },
  circleBottomLeft: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -40,
    left: -20,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  labelStar: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.2,
  },
  amount: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 16,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  infoBox: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 2,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
});

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { colors, radius, shadows } from '../../theme';

const formatCurrency = amount => `${Number(amount).toLocaleString()}원`;

const RING_R = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

export default function DailyLimitHeroCard({ amount = 18500, spent = 6200, daysLeft = 7 }) {
  const remaining = Math.max(amount - spent, 0);
  const pct = amount > 0 ? Math.min(spent / amount, 1) : 0;
  const strokeDash = RING_CIRCUMFERENCE * pct;

  return (
    <LinearGradient
      colors={[colors.oliveDark, colors.olive, colors.oliveLight]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, shadows.lg]}
    >
      <View style={styles.circle1} />
      <View style={styles.circle2} />

      {/* 상단 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.sprout}>🌱</Text>
          <Text style={styles.headerText}>오늘 안전하게 쓸 수 있는 금액</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>안전 소비 가능</Text>
        </View>
      </View>

      {/* 원형 진행률 + 우측 텍스트 */}
      <View style={styles.body}>
        {/* SVG 원형 진행 그래프 */}
        <View style={styles.chartWrap}>
          <View style={{ transform: [{ rotate: '-90deg' }] }}>
            <Svg width={128} height={128} viewBox="0 0 120 120">
              <Circle
                cx="60"
                cy="60"
                r={RING_R}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={10}
                fill="none"
              />
              <Circle
                cx="60"
                cy="60"
                r={RING_R}
                stroke="#FFFDF5"
                strokeWidth={10}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${strokeDash} ${RING_CIRCUMFERENCE}`}
              />
            </Svg>
          </View>
          <View style={styles.chartCenter}>
            <Text style={styles.chartLabel}>남은 권장</Text>
            <Text style={styles.chartValue}>{Number(remaining).toLocaleString()}</Text>
            <Text style={styles.chartUnit}>원</Text>
          </View>
        </View>

        {/* 우측 텍스트 */}
        <View style={styles.textArea}>
          <Text style={styles.mainAmount}>{formatCurrency(amount)}</Text>
          <Text style={styles.daysText}>다음 알바비까지 {daysLeft}일 남았어요</Text>
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>오늘은 아직 여유 있어요 🌱</Text>
          </View>
        </View>
      </View>

      {/* 하단 3-grid */}
      <View style={styles.grid}>
        {[
          ['권장', amount],
          ['사용', spent],
          ['남음', remaining],
        ].map(([label, value]) => (
          <View key={label} style={styles.gridCell}>
            <Text style={styles.gridKey}>{label}</Text>
            <Text style={styles.gridVal}>{formatCurrency(value)}</Text>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.xxl,
    padding: 20,
    overflow: 'hidden',
  },
  circle1: {
    position: 'absolute',
    right: -24,
    top: -24,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  circle2: {
    position: 'absolute',
    right: -8,
    top: 48,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sprout: {
    fontSize: 14,
  },
  headerText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
  },
  badge: {
    backgroundColor: 'rgba(47,158,68,0.25)',
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    color: '#A8EFB8',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 16,
  },
  chartWrap: {
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartCenter: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 1,
  },
  chartLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.8)',
  },
  chartValue: {
    fontSize: 17,
    color: colors.white,
    fontWeight: '700',
  },
  chartUnit: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.8)',
  },
  textArea: {
    flex: 1,
  },
  mainAmount: {
    fontSize: 28,
    color: colors.white,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  daysText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  statusBox: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 11,
    color: colors.white,
  },
  grid: {
    flexDirection: 'row',
    gap: 8,
  },
  gridCell: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  gridKey: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.8)',
  },
  gridVal: {
    fontSize: 12,
    color: colors.white,
    fontWeight: '600',
    marginTop: 2,
  },
});

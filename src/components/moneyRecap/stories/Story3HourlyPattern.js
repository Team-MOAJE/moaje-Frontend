import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';
import StoryFrame from '../StoryFrame';
import MoneyRecapTag from '../MoneyRecapTag';

// 피크 구간 문장은 새 수치를 만들지 않고 peakHourKeys(예: ['12','13'])에서 그대로 도출한다.
const buildPeakSentence = keys => {
  if (!keys?.length) return null;
  const first = keys[0];
  const last = keys[keys.length - 1];
  return first === last ? `${first}시에 가장 많이 썼어요` : `${first}~${last}시에 가장 많이 썼어요`;
};

// 차트 영역은 고정 높이. 모든 막대는 같은 바닥선에서만 자라고, 높이는 value / max 비율로 정해진다.
const CHART_HEIGHT = 150;

export default function Story3HourlyPattern({ vm = {} }) {
  const hours = vm.hours ?? [];
  const max = Math.max(...hours.map(h => h.value), 1);
  const peakSentence = buildPeakSentence(vm.peakHourKeys);

  return (
    <StoryFrame eyebrow={vm.eyebrow} titleLines={vm.titleLines}>
      {peakSentence ? <Text style={styles.peak}>{peakSentence}</Text> : null}

      <View style={styles.chart}>
        {vm.chartLabel ? <Text style={styles.chartLabel}>{vm.chartLabel}</Text> : null}

        <View style={styles.barsRow}>
          {hours.map(item => {
            const isPeak = vm.peakHourKeys?.includes(item.hour);
            return (
              <View key={item.hour} style={styles.barColumn}>
                <View
                  style={[
                    styles.bar,
                    { height: Math.round((item.value / max) * CHART_HEIGHT) },
                    isPeak ? styles.barPeak : styles.barNormal,
                  ]}
                />
              </View>
            );
          })}
        </View>

        <View style={styles.labelsRow}>
          {hours.map(item => {
            const isPeak = vm.peakHourKeys?.includes(item.hour);
            return (
              <Text key={item.hour} style={[styles.hourLabel, isPeak && styles.hourLabelPeak]}>
                {item.hour}
              </Text>
            );
          })}
        </View>
      </View>

      {vm.tags?.length ? (
        <View style={styles.tagRow}>
          {vm.tags.map(tag => (
            <MoneyRecapTag key={tag.label} label={tag.label} variant={tag.variant} />
          ))}
        </View>
      ) : null}
    </StoryFrame>
  );
}

const styles = StyleSheet.create({
  peak: { marginTop: 16, fontSize: 16, fontWeight: '600', color: redesign.textPrimary },
  chart: { marginTop: 32 },
  chartLabel: { fontSize: 12, color: redesign.textSecondary, marginBottom: 12 },
  barsRow: {
    height: CHART_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: redesign.divider,
  },
  barColumn: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  barNormal: { backgroundColor: redesign.navInactive, opacity: 0.45 },
  barPeak: { backgroundColor: redesign.accent },
  labelsRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  hourLabel: { flex: 1, textAlign: 'center', fontSize: 11, color: redesign.textSecondary },
  hourLabelPeak: { fontWeight: '700', color: redesign.accent },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, marginTop: 28 },
});

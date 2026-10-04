import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';
import StoryFrame from '../StoryFrame';
import MoneyRecapMetricCard from '../MoneyRecapMetricCard';

export default function Story2Summary({ vm = {} }) {
  const metrics = vm.metrics ?? [];

  return (
    <StoryFrame eyebrow={vm.eyebrow} titleLines={vm.title ? [vm.title] : []}>
      {vm.quoteLines?.length ? <Text style={styles.quote}>{vm.quoteLines.join('\n')}</Text> : null}

      {metrics.length ? (
        <View style={styles.list}>
          {metrics.map(({ key, ...metric }) => (
            <MoneyRecapMetricCard key={key} {...metric} />
          ))}
        </View>
      ) : null}

      {vm.safeChipText ? <Text style={styles.note}>{vm.safeChipText}</Text> : null}
    </StoryFrame>
  );
}

const styles = StyleSheet.create({
  quote: {
    marginTop: 20,
    fontSize: 16,
    lineHeight: 25,
    color: redesign.textSecondary,
  },
  list: {
    marginTop: 28,
    borderTopWidth: 1,
    borderTopColor: redesign.divider,
  },
  note: { marginTop: 20, fontSize: 12, color: redesign.textSecondary },
});

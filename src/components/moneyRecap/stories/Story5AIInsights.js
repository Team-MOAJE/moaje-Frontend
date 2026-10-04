import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';
import StoryFrame from '../StoryFrame';
import MoneyRecapInsightCard from '../MoneyRecapInsightCard';

export default function Story5AIInsights({ vm = {} }) {
  const insights = vm.insights ?? [];

  return (
    <StoryFrame eyebrow={vm.badgeLabel} titleLines={vm.title ? [vm.title] : []}>
      <View style={styles.list}>
        {insights.map(insight => (
          <MoneyRecapInsightCard key={insight.key} title={insight.title} body={insight.body} />
        ))}
      </View>

      {vm.footerText ? <Text style={styles.footer}>{vm.footerText}</Text> : null}
    </StoryFrame>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: 28,
    borderTopWidth: 1,
    borderTopColor: redesign.divider,
  },
  footer: { marginTop: 20, fontSize: 12, color: redesign.textSecondary },
});

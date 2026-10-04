import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../theme/redesign';

// 카드/아이콘 박스 없이 제목 + 본문만 보여주는 flat 인사이트 행.
export default function MoneyRecapInsightCard({ title, body }) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: redesign.divider,
  },
  title: { fontSize: 16, fontWeight: '700', color: redesign.textPrimary },
  body: { fontSize: 14, lineHeight: 22, color: redesign.textSecondary, marginTop: 6 },
});

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';

// 기존 10개 답변 요약을 보존하는 접이식 영역. 기본 접힘이며 결과 화면에서 가장 낮은 위계다.
// sections: [{ title, labels: (string|null)[] }]
export default function AnswerSummaryList({ sections }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setExpanded(prev => !prev)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
      >
        <Text style={styles.toggleText}>내 답변 다시보기</Text>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMid} />
      </Pressable>

      {expanded &&
        sections.map(section => (
          <View key={section.title} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionBody}>
              {section.labels.filter(Boolean).map(label => (
                <View key={label} style={styles.summaryRow}>
                  <Feather name="check" size={14} color={colors.olive} />
                  <Text style={styles.summaryLabel}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  toggle: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgLight,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  togglePressed: {
    backgroundColor: colors.bgOuter,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMid,
  },
  sectionCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMid,
  },
  sectionBody: {
    gap: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textDark,
  },
});

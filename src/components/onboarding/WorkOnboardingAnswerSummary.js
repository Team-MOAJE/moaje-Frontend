import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';

// 서버에 저장된 답변 목록. answers: [{ questionNo, text, isFreeText }] (빈 배열이면 아무것도 그리지 않는다)
// 기본 접힘이며 토글로 펼치고 접는다. 호출하는 쪽에서 key를 바꾸면 접힘 상태로 초기화된다.
export default function WorkOnboardingAnswerSummary({ answers }) {
  const [expanded, setExpanded] = useState(false);

  if (!answers || answers.length === 0) return null;

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

      {expanded && (
        <View style={styles.card}>
          {answers.map(answer => (
            <View key={answer.questionNo} style={styles.row}>
              <Text style={styles.no}>Q{answer.questionNo}</Text>
              <Text style={styles.text}>{answer.text}</Text>
            </View>
          ))}
        </View>
      )}
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
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  no: {
    width: 32,
    fontSize: 13,
    fontWeight: '800',
    color: colors.olive,
    lineHeight: 22,
  },
  text: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.textDark,
  },
});

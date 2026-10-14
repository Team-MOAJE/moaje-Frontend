import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { redesign } from '../../../theme/redesign';

// 연도 선택(‹ 2026 ›). 선택은 요청 조건만 바꾼다. 요청 여부는 상위 로직이 결정한다.
export default function YearStepper({ year, min, max, onChange, label = '연도' }) {
  const canPrev = year > min;
  const canNext = year < max;
  return (
    <View style={styles.row} accessibilityLabel={`${label} ${year}년`}>
      <Pressable
        onPress={canPrev ? () => onChange(year - 1) : undefined}
        disabled={!canPrev}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`이전 ${label}`}
        style={({ pressed }) => [
          styles.arrow,
          !canPrev && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <Feather name="chevron-left" size={20} color={redesign.textPrimary} />
      </Pressable>
      <Text style={styles.year}>{year}년</Text>
      <Pressable
        onPress={canNext ? () => onChange(year + 1) : undefined}
        disabled={!canNext}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`다음 ${label}`}
        style={({ pressed }) => [
          styles.arrow,
          !canNext && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <Feather name="chevron-right" size={20} color={redesign.textPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: redesign.surfaceSoft,
  },
  year: {
    minWidth: 64,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.6,
  },
});

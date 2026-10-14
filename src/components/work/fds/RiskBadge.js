import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';

// 서버 위험도(HIGH/MEDIUM/LOW) 배지. 색만 위험도로 구분하고 라벨은 상위 로직이 만든 문구를 그대로 쓴다.
const TONES = {
  HIGH: { backgroundColor: '#FDECEA', color: '#C0392B' },
  MEDIUM: { backgroundColor: '#FEF5E7', color: '#B9770E' },
};

export default function RiskBadge({ riskLevel, label }) {
  const tone = TONES[riskLevel] ?? {
    backgroundColor: redesign.surfaceSoft,
    color: redesign.accent,
  };
  return (
    <View style={[styles.badge, { backgroundColor: tone.backgroundColor }]}>
      <Text style={[styles.text, { color: tone.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  text: {
    fontSize: 12,
    fontWeight: '800',
  },
});

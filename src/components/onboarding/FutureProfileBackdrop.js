import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme';
import { Leaf, Orb } from './FutureProfileDecor';

// 결과 화면 전체 배경. 스크롤되지 않는 고정 레이어이며 터치를 가로채지 않는다.
export default function FutureProfileBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[colors.bgOuter, colors.bgMain, colors.cream]}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Orb size={280} color="rgba(184,216,107,0.28)" style={{ top: -110, left: -90 }} />
      <Orb size={220} color="rgba(255,253,245,0.7)" style={{ top: 60, right: -110 }} />
      <Orb size={180} color="rgba(254,229,0,0.08)" style={{ top: 300, left: -80 }} />
      <Leaf size={22} color="rgba(111,127,63,0.35)" rotate={-30} style={backdropLeaf.a} />
      <Leaf size={16} color="rgba(126,145,72,0.3)" rotate={40} style={backdropLeaf.b} />
      <Leaf size={26} color="rgba(184,216,107,0.5)" rotate={20} style={backdropLeaf.c} />
      <Leaf size={14} color="rgba(111,127,63,0.25)" rotate={-60} style={backdropLeaf.d} />
    </View>
  );
}

const backdropLeaf = {
  a: { position: 'absolute', top: 24, left: 28 },
  b: { position: 'absolute', top: 70, right: 70 },
  c: { position: 'absolute', top: 120, left: -6 },
  d: { position: 'absolute', top: 40, right: 24 },
};

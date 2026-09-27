import { View } from 'react-native';

// 잎사귀 모양 장식. 순수 View 도형이라 에셋이 필요 없다. rotate는 deg.
export function Leaf({ size = 24, color, rotate = 0, style }) {
  return (
    <View
      pointerEvents="none"
      style={[
        {
          width: size,
          height: size * 1.5,
          backgroundColor: color,
          borderTopLeftRadius: size,
          borderBottomRightRadius: size,
          borderTopRightRadius: size * 0.15,
          borderBottomLeftRadius: size * 0.15,
          transform: [{ rotate: `${rotate}deg` }],
        },
        style,
      ]}
    />
  );
}

// 은은한 원형 빛/유기적 덩어리. 위치는 style(absolute)로 지정한다.
export function Orb({ size, color, style }) {
  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

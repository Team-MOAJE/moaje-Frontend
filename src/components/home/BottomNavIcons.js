import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

const STROKE_WIDTH = 1.6;

function IconBase({ size, color, children }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

// Home은 outline only (active 여부는 color로만 구분).
export function HomeIcon({ size = 24, color }) {
  return (
    <IconBase size={size} color={color}>
      <Path d="M3.5 11.2C3.5 10.6 3.8 10 4.3 9.6L10.6 4.4C11.4 3.8 12.6 3.8 13.4 4.4L19.7 9.6C20.2 10 20.5 10.6 20.5 11.2V18C20.5 19.1 19.6 20 18.5 20H5.5C4.4 20 3.5 19.1 3.5 18V11.2Z" />
      <Path d="M9.5 20V14.5C9.5 13.7 10.2 13 11 13H13C13.8 13 14.5 13.7 14.5 14.5V20" />
    </IconBase>
  );
}

export function TransferIcon({ size = 24, color, active = false }) {
  const fill = active ? color : 'none';
  return (
    <IconBase size={size} color={color}>
      <Path d="M5 11C5 8.5 7 6.5 9.5 6.5H16.5" />
      <Path d="M16.5 4.2L19.8 6.5L16.5 8.8Z" fill={fill} />
      <Path d="M19 13C19 15.5 17 17.5 14.5 17.5H7.5" />
      <Path d="M7.5 15.2L4.2 17.5L7.5 19.8Z" fill={fill} />
    </IconBase>
  );
}

export function CategoryIcon({ size = 24, color, active = false }) {
  const fill = active ? color : 'none';
  return (
    <IconBase size={size} color={color}>
      <Rect x="4" y="4" width="6.5" height="6.5" rx="2" />
      <Rect x="13.5" y="4" width="6.5" height="6.5" rx="2" />
      <Rect x="4" y="13.5" width="6.5" height="6.5" rx="2" />
      <Path
        d="M13.5 16.5C13.5 14.8 14.8 13.5 16.5 13.5H20V17C20 18.7 18.7 20 17 20H13.5V16.5Z"
        fill={fill}
      />
    </IconBase>
  );
}

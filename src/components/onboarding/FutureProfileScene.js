import { useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { colors, radius, shadows } from '../../theme';
import { Leaf, Orb } from './FutureProfileDecor';
import {
  FUTURE_PROFILE_IMAGE_ADJUST,
  FUTURE_PROFILE_IMAGE_DEFAULT_ADJUST,
} from '../../constants/futureProfileAssets';

const CARD_CLEAR = 'rgba(255,253,245,0)';
const CARD_SOFT = 'rgba(255,253,245,0.55)';
const CARD_SOLID = 'rgba(255,253,245,1)';

// 카드 폭 대비 좌우 inset 비율. 이미지가 Hero의 중심을 충분히 차지하도록 작게 시작한다.
const SCENE_INSET_RATIO = 0.045;
// 이미지 폭/높이 대비 edge blending 두께. 핵심 오브젝트가 흐려지지 않도록 얕게 유지한다.
// top은 이미지 시작 경계를 없애기 위한 값(0이면 미적용). 하늘/전등/깃발이 흐려지면 0.05 이하로 낮춘다.
const EDGE_FADE = { left: 0.04, right: 0.04, top: 0.07, bottom: 0.07 };

// 실제 일러스트. width%/aspectRatio 조합에 의존하지 않고, 측정한 컨테이너 폭(px)과
// 원본 비율로 이미지 폭·높이를 명시적으로 지정해 늘어남/잘림 가능성을 없앤다.
// scale/offset은 타입별 미세 조정용(offset은 이미지 폭 대비 비율). 이미지 경계 밖은 잘린다.
function SceneImage({ imageSource, imageKey }) {
  const [width, setWidth] = useState(0);
  const asset = Image.resolveAssetSource(imageSource);
  const ratio = asset?.width && asset?.height ? asset.width / asset.height : 1;
  const { resizeMode, scale, offsetX, offsetY } = {
    ...FUTURE_PROFILE_IMAGE_DEFAULT_ADJUST,
    ...FUTURE_PROFILE_IMAGE_ADJUST[imageKey],
  };
  // width = 측정한 카드 폭. 이미지는 좌우 inset을 뺀 폭으로 가운데 배치(원본 비율 유지).
  const imageWidth = width * (1 - 2 * SCENE_INSET_RATIO);
  const height = imageWidth / ratio;

  const handleLayout = e => {
    const w = e.nativeEvent.layout.width;
    if (__DEV__) {
      const iw = w * (1 - 2 * SCENE_INSET_RATIO);
      console.log(
        `[FutureProfileScene] ${imageKey} card=${Math.round(w)}px asset=${asset?.width}x${asset?.height} -> ${Math.round(iw)}x${Math.round(iw / ratio)}`
      );
    }
    setWidth(w);
  };

  return (
    <View style={styles.imageWrap} onLayout={handleLayout}>
      {width > 0 && (
        <View style={{ width: imageWidth, height, alignSelf: 'center', overflow: 'hidden' }}>
          <Image
            source={imageSource}
            resizeMode={resizeMode}
            style={{
              width: imageWidth,
              height,
              transform: [
                { translateX: offsetX * imageWidth },
                { translateY: offsetY * imageWidth },
                { scale },
              ],
            }}
          />
          {/* Hero cream으로 이어지는 아주 얕은 edge blending. 배경 가장자리에만 닿는다 */}
          {EDGE_FADE.left > 0 && (
            <LinearGradient
              pointerEvents="none"
              colors={[CARD_SOLID, CARD_SOFT, CARD_CLEAR]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[
                styles.fade,
                { top: 0, bottom: 0, left: 0, width: imageWidth * EDGE_FADE.left },
              ]}
            />
          )}
          {EDGE_FADE.right > 0 && (
            <LinearGradient
              pointerEvents="none"
              colors={[CARD_CLEAR, CARD_SOFT, CARD_SOLID]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[
                styles.fade,
                { top: 0, bottom: 0, right: 0, width: imageWidth * EDGE_FADE.right },
              ]}
            />
          )}
          {EDGE_FADE.top > 0 && (
            <LinearGradient
              pointerEvents="none"
              colors={[CARD_SOLID, CARD_SOFT, CARD_CLEAR]}
              locations={[0, 0.3, 1]}
              style={[styles.fade, { top: 0, left: 0, right: 0, height: height * EDGE_FADE.top }]}
            />
          )}
          {EDGE_FADE.bottom > 0 && (
            <LinearGradient
              pointerEvents="none"
              colors={[CARD_CLEAR, CARD_SOFT, CARD_SOLID]}
              style={[
                styles.fade,
                { bottom: 0, left: 0, right: 0, height: height * EDGE_FADE.bottom },
              ]}
            />
          )}
        </View>
      )}
    </View>
  );
}

// Hero의 일러스트 "장면" 레이어. UI 텍스트와 분리되어 있어 이 컴포넌트만 교체/확장하면 된다.
// - imageSource 있음: 원본 비율 그대로 폭 100%로 배치(테두리/액자 없음, 기본 contain이라 잘리지 않음)
// - imageSource 없음: 그라데이션 + 아치 + 빛 + 잎사귀 + 새싹 캐릭터 stand-in으로 구성한 임시 장면
export default function FutureProfileScene({ imageSource, imageKey, placeholderIcon }) {
  if (imageSource) {
    return <SceneImage imageSource={imageSource} imageKey={imageKey} />;
  }

  return (
    <View style={styles.scene}>
      {/* 위아래로 카드색과 이어지는 그라데이션: 사각형 경계가 보이지 않는다 */}
      <LinearGradient
        colors={['rgba(232,240,207,0)', 'rgba(232,240,207,0.85)', 'rgba(255,253,245,0)']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Orb size={200} color="rgba(254,229,0,0.14)" style={{ top: 10, right: 30 }} />
      <View style={styles.arch} />
      <View style={styles.floor} />
      <Orb size={90} color="rgba(184,216,107,0.35)" style={{ bottom: 30, left: 24 }} />

      <Leaf size={26} color="rgba(90,107,48,0.85)" rotate={-40} style={leaf.a} />
      <Leaf size={20} color="rgba(126,145,72,0.8)" rotate={35} style={leaf.b} />
      <Leaf size={30} color="rgba(90,107,48,0.75)" rotate={-15} style={leaf.c} />
      <Leaf size={18} color="rgba(184,216,107,0.9)" rotate={55} style={leaf.d} />
      <Leaf size={14} color="rgba(126,145,72,0.7)" rotate={-70} style={leaf.e} />

      {/* 새싹 캐릭터 stand-in: 실제 이미지가 들어오면 이 장면 전체가 교체된다 */}
      <View style={styles.character}>
        <View style={styles.sprout}>
          <Leaf size={22} color={colors.oliveDark} rotate={-35} />
          <Leaf size={22} color={colors.olive} rotate={35} style={{ marginLeft: -6 }} />
        </View>
        <View style={styles.body}>
          <View style={styles.cheekRow}>
            <View style={styles.cheek} />
            <View style={styles.cheek} />
          </View>
        </View>
        <View style={styles.iconBadge}>
          <Feather name={placeholderIcon ?? 'compass'} size={16} color={colors.cream} />
        </View>
      </View>
    </View>
  );
}

const leaf = {
  a: { position: 'absolute', top: 22, left: 34 },
  b: { position: 'absolute', top: 70, left: 90 },
  c: { position: 'absolute', bottom: 46, left: 8 },
  d: { position: 'absolute', top: 30, right: 70 },
  e: { position: 'absolute', bottom: 60, right: 26 },
};

const styles = StyleSheet.create({
  scene: {
    height: 260,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  imageWrap: {
    width: '100%',
  },
  fade: {
    position: 'absolute',
  },
  arch: {
    position: 'absolute',
    bottom: 40,
    right: '10%',
    width: '52%',
    height: '82%',
    borderTopLeftRadius: 9999,
    borderTopRightRadius: 9999,
    backgroundColor: 'rgba(184,216,107,0.22)',
  },
  floor: {
    position: 'absolute',
    bottom: -20,
    width: '86%',
    height: 90,
    borderRadius: radius.full,
    backgroundColor: 'rgba(232,240,207,0.95)',
  },
  character: {
    alignItems: 'center',
    marginBottom: 34,
  },
  sprout: {
    flexDirection: 'row',
    marginBottom: -10,
    zIndex: 1,
  },
  body: {
    width: 118,
    height: 104,
    borderRadius: 60,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 30,
    ...shadows.lg,
  },
  cheekRow: {
    flexDirection: 'row',
    gap: 46,
  },
  cheek: {
    width: 16,
    height: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(240,160,150,0.45)',
  },
  iconBadge: {
    position: 'absolute',
    right: -14,
    bottom: 4,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.olive,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
});

import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, shadows } from '../../theme';
import FutureProfileScene from './FutureProfileScene';

// 화면에서 가장 강한 위계: eyebrow → 프로필명 → 대형 scene → 설명 → 태그.
// scene은 카드 좌우 패딩을 뚫고 카드 폭 전체를 쓰며, 액자/테두리 없이 카드 배경과 이어진다.
export default function FutureProfileHeroCard({
  eyebrow,
  title,
  description,
  tags,
  imageSource,
  imageKey,
  placeholderIcon,
}) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>

      <View style={styles.scene}>
        <FutureProfileScene
          imageSource={imageSource}
          imageKey={imageKey}
          placeholderIcon={placeholderIcon}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.description}>{description}</Text>
        {tags?.length > 0 && (
          <View style={styles.tagRow}>
            {tags.map(tag => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xxxl,
    backgroundColor: colors.cream,
    overflow: 'hidden',
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    ...shadows.xl,
  },
  header: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMid,
  },
  title: {
    fontSize: 30,
    lineHeight: 40,
    fontWeight: '800',
    color: colors.textDark,
  },
  scene: {
    width: '100%',
    marginTop: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  description: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '500',
    color: colors.textMid,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.oliveLight,
  },
  tagText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.oliveDeep,
  },
});

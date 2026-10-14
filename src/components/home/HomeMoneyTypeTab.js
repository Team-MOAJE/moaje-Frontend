import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { redesign } from '../../theme';
import MoneyRecapPreview from './MoneyRecapPreview';

// 머니 타입 탭(feat/preview 디자인). 표시 값은 모두 호출부(HomeScreen)가 정해 props로 넘긴다.
// - profile: { title, description, tags? } — 서버 Future Profile 제목·설명 또는 기존 로컬 프로필. tags는 있을 때만 그린다.
// - status: 'ready'(기본) | 'loading' | 'error'. 점수/퍼센트/태그 등 서버에 없는 값은 만들지 않는다.
// - recap: 이번 달 소비 요약(MoneyRecapPreview). 항상 하단에 그린다.
export default function HomeMoneyTypeTab({
  profile,
  status = 'ready',
  recap,
  onRecapPress,
  onDetailPress,
  onRetry,
}) {
  const recapCard = <MoneyRecapPreview recap={recap} onPress={onRecapPress} />;

  if (status === 'loading') {
    return (
      <View>
        <Text style={styles.title}>머니 타입</Text>
        <Text style={styles.empty}>머니 타입을 불러오는 중이에요</Text>
        {recapCard}
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View>
        <Text style={styles.title}>머니 타입</Text>
        <Text style={styles.empty}>머니 타입을 불러오지 못했어요</Text>
        <Pressable
          onPress={onRetry}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="다시 시도"
          style={({ pressed }) => [styles.detail, pressed && styles.pressed]}
        >
          <Text style={styles.detailText}>다시 시도</Text>
        </Pressable>
        {recapCard}
      </View>
    );
  }

  if (!profile) {
    return (
      <View>
        <Text style={styles.title}>머니 타입</Text>
        <Text style={styles.empty}>아직 재무 온보딩 결과가 없어요.</Text>
        {recapCard}
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.label}>나의 머니 타입</Text>
      <Text style={styles.profileTitle}>{profile.title}</Text>
      {profile.description ? <Text style={styles.description}>{profile.description}</Text> : null}
      {profile.tags?.length > 0 && (
        <View style={styles.tagRow}>
          {profile.tags.map(tag => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable
        onPress={onDetailPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="내 Future Profile 자세히 보기"
        style={({ pressed }) => [styles.detail, pressed && styles.pressed]}
      >
        <Text style={styles.detailText}>내 Future Profile 자세히 보기</Text>
        <Text style={styles.detailChevron}>›</Text>
      </Pressable>

      {recapCard}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  empty: {
    fontSize: 14,
    color: redesign.textSecondary,
    marginTop: 12,
  },
  label: {
    fontSize: 13,
    color: redesign.textSecondary,
  },
  profileTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: redesign.textPrimary,
    marginTop: 8,
    lineHeight: 30,
  },
  description: {
    fontSize: 14,
    color: redesign.textSecondary,
    marginTop: 10,
    lineHeight: 21,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 18,
  },
  tag: {
    backgroundColor: redesign.surfaceSoft,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagText: {
    fontSize: 12,
    color: redesign.accent,
    fontWeight: '600',
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 20,
    paddingVertical: 4,
  },
  detailText: {
    fontSize: 14,
    fontWeight: '600',
    color: redesign.accent,
  },
  detailChevron: {
    fontSize: 18,
    color: redesign.accent,
    marginLeft: 6,
  },
  pressed: {
    opacity: 0.6,
  },
});

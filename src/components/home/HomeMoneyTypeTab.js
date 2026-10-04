import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { redesign } from '../../theme';

// 기존 재무 온보딩 결과(profile)를 읽기 전용으로 간단히 보여준다.
// 점수/퍼센트 등 새 값은 만들지 않는다. profile이 없으면 빈 상태만 표시한다.
export default function HomeMoneyTypeTab({ profile, onDetailPress }) {
  if (!profile) {
    return (
      <View>
        <Text style={styles.title}>머니 타입</Text>
        <Text style={styles.empty}>아직 재무 온보딩 결과가 없어요.</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.label}>나의 머니 타입</Text>
      <Text style={styles.profileTitle}>{profile.title}</Text>
      <Text style={styles.description}>{profile.description}</Text>
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

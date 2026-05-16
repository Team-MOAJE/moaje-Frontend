import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Animated, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, shadows } from '../../theme';
import { ROUTES } from '../../constants/routes';
import {
  SettingToggle,
  SettingValueRow,
  SettingDivider,
} from '../../components/settings/SettingListItem';

export default function SettingsScreen({ navigation }) {
  const [toastVisible, setToastVisible] = useState(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(8)).current;

  const showToast = () => {
    setToastVisible(true);
    toastOpacity.setValue(0);
    toastTranslateY.setValue(8);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(toastTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
      Animated.delay(2100),
      Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  };

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(ROUTES.CATEGORY);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
          >
            <Feather name="arrow-left" size={20} color={colors.textDark} />
          </Pressable>
          <Text style={styles.headerTitle}>설정</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <SectionCard title="알림">
            <SettingToggle label="오늘의 가용금액 알림" defaultOn={true} />
            <SettingDivider />
            <SettingToggle label="지출 위험 알림" defaultOn={false} />
            <SettingDivider />
            <SettingToggle label="송금 완료 알림" defaultOn={true} />
            <SettingDivider />
            <SettingToggle label="대학 일정 기반 소비 알림" defaultOn={false} />
          </SectionCard>

          <SectionCard title="앱 설정">
            <SettingValueRow label="테마 설정" value="라이트" onPress={showToast} />
            <SettingDivider />
            <SettingValueRow label="통화 표시" value="KRW (₩)" onPress={showToast} />
            <SettingDivider />
            <SettingValueRow label="캐시 데이터 새로고침" value="방금 전" onPress={showToast} />
            <SettingDivider />
            <SettingValueRow label="약관 및 개인정보 처리방침" value="보기" onPress={showToast} />
          </SectionCard>
        </ScrollView>

        {toastVisible && (
          <Animated.View
            style={[
              styles.toast,
              { opacity: toastOpacity, transform: [{ translateY: toastTranslateY }] },
            ]}
            pointerEvents="none"
          >
            <View style={styles.toastIconWrap}>
              <MaterialCommunityIcons name="sprout" size={16} color={colors.cream} />
            </View>
            <Text style={styles.toastText}>아직 준비 중인 기능이에요 🌱</Text>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

function SectionCard({ title, children }) {
  return (
    <View style={sectionStyles.card}>
      <Text style={sectionStyles.title}>{title}</Text>
      {children}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.sm,
  },
  title: {
    fontSize: 11,
    color: colors.textMid,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.xs,
  },
  headerBtnPressed: {
    backgroundColor: colors.bgOuter,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 12,
    paddingBottom: 32,
    paddingTop: 8,
  },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.olive,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 100,
  },
  toastIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  toastText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.cream,
    lineHeight: 20,
  },
});

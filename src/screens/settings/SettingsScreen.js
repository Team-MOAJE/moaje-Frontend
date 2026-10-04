import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Animated, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { redesign } from '../../theme/redesign';
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
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => pressed && styles.pressedDim}
            accessibilityRole="button"
            accessibilityLabel="뒤로가기"
          >
            <Feather name="arrow-left" size={22} color={redesign.textPrimary} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.screenTitle}>설정</Text>

          <Section title="알림" first>
            <SettingToggle label="오늘의 가용금액 알림" defaultOn={true} />
            <SettingDivider />
            <SettingToggle label="지출 위험 알림" defaultOn={false} />
            <SettingDivider />
            <SettingToggle label="송금 완료 알림" defaultOn={true} />
            <SettingDivider />
            <SettingToggle label="대학 일정 기반 소비 알림" defaultOn={false} />
          </Section>

          <Section title="앱 설정">
            <SettingValueRow label="테마 설정" value="라이트" onPress={showToast} />
            <SettingDivider />
            <SettingValueRow label="통화 표시" value="KRW (₩)" onPress={showToast} />
            <SettingDivider />
            <SettingValueRow label="캐시 데이터 새로고침" value="방금 전" onPress={showToast} />
            <SettingDivider />
            <SettingValueRow label="약관 및 개인정보 처리방침" value="보기" onPress={showToast} />
          </Section>
        </ScrollView>

        {toastVisible && (
          <Animated.View
            style={[
              styles.toast,
              { opacity: toastOpacity, transform: [{ translateY: toastTranslateY }] },
            ]}
            pointerEvents="none"
          >
            <Text style={styles.toastText}>아직 준비 중인 기능이에요 🌱</Text>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

function Section({ title, first, children }) {
  return (
    <View>
      <Text style={[sectionStyles.title, first && sectionStyles.titleFirst]}>{title}</Text>
      <View style={sectionStyles.list}>{children}</View>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  title: {
    marginTop: 40,
    marginBottom: 4,
    fontSize: 13,
    fontWeight: '600',
    color: redesign.accent,
  },
  titleFirst: {
    marginTop: 32,
  },
  list: {
    borderTopWidth: 1,
    borderTopColor: redesign.divider,
    borderBottomWidth: 1,
    borderBottomColor: redesign.divider,
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: redesign.bg,
  },
  screen: {
    flex: 1,
    backgroundColor: redesign.bg,
  },
  header: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: 'flex-start',
  },
  pressedDim: {
    opacity: 0.6,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 16,
    paddingBottom: 48,
  },
  screenTitle: {
    fontSize: 29,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: redesign.textPrimary,
  },
  toast: {
    position: 'absolute',
    left: redesign.pagePaddingX,
    right: redesign.pagePaddingX,
    bottom: 40,
    backgroundColor: redesign.accent,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    zIndex: 100,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
    lineHeight: 20,
  },
});

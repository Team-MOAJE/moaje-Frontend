import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { colors, radius, shadows } from '../../theme';

export default function AnalysisScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <LinearGradient
          colors={[colors.oliveLight, colors.oliveDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.iconWrap, shadows.md]}
        >
          <Feather name="tool" size={40} color={colors.white} />
        </LinearGradient>

        <Text style={styles.title}>생활비 분석</Text>
        <Text style={styles.sub}>준비 중인 기능이에요</Text>
        <Text style={styles.desc}>
          {'곧 지출 패턴 · 고정비 추세 · 카테고리별 비중을\n그래프로 보여드릴게요.'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textDark,
    marginTop: 16,
    textAlign: 'center',
  },
  sub: {
    fontSize: 14,
    color: colors.textMid,
    marginTop: 4,
    textAlign: 'center',
  },
  desc: {
    fontSize: 12,
    color: 'rgba(111,127,63,0.8)',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
});

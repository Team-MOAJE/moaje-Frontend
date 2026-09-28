import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { ROUTES } from '../../constants/routes';

const C = {
  bgGrad: ['#F3F6EA', '#E8F0CF', 'rgba(184,216,107,0.4)'],
  gradLogo: ['#6F7F3F', '#B8D86B'],
  textDark: '#344225',
  textMid: '#6F7F3F',
  textDesc: 'rgba(111,127,63,0.8)',
  orange: '#FF9F1C',
  cream: '#FFFDF5',
  bgWarn: '#FFF8E6',
  white: '#FFFFFF',
};

const LoginScreen = ({ navigation }) => {
  const handlePhoneLogin = () => navigation.navigate(ROUTES.PHONE_LOGIN);
  const handleSignup = () => navigation.navigate(ROUTES.SIGNUP);

  return (
    <LinearGradient colors={C.bgGrad} locations={[0, 0.5, 1]} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        {/* ── 히어로 영역 ─────────────────────────────── */}
        <View style={styles.hero}>
          {/* 로고 래퍼 */}
          <View style={styles.logoWrap}>
            {/* 메인 그라데이션 로고 박스 */}
            <LinearGradient
              colors={C.gradLogo}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.logoMain, styles.shadowLg]}
            >
              <MaterialCommunityIcons name="sprout" size={56} color={C.white} />
            </LinearGradient>

            {/* 카드 배지 (우하단) */}
            <View style={[styles.badgeCard, styles.shadowSm]}>
              <Feather name="credit-card" size={22} color={C.textMid} />
            </View>

            {/* 코인 배지 (좌상단) */}
            <View style={[styles.badgeCoin, styles.shadowSm]}>
              <MaterialCommunityIcons name="cash-multiple" size={18} color={C.orange} />
            </View>
          </View>

          <Text style={styles.appName}>모아제</Text>
          <Text style={styles.tagline}>오늘 쓸 돈을, 내일 걱정 없이.</Text>
          <Text style={styles.desc}>
            {'대학생의 불규칙한 수입과 지출을 계산해\n하루 가용 금액을 알려줘요.'}
          </Text>
        </View>

        {/* ── 버튼 영역 ─────────────────────────────── */}
        <View style={styles.buttons}>
          {/* 로그인 — 올리브 메인 버튼 */}
          <TouchableOpacity
            onPress={handlePhoneLogin}
            activeOpacity={0.85}
            style={[styles.btnIdLogin, styles.shadowMd]}
          >
            <Text style={styles.btnIdLoginText}>로그인</Text>
          </TouchableOpacity>

          {/* 회원가입 링크 */}
          <View style={styles.signupRow}>
            <Text style={styles.signupLabel}>계정이 없으신가요? </Text>
            <TouchableOpacity onPress={handleSignup} activeOpacity={0.5}>
              <Text style={styles.signupLink}>회원가입</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  logoWrap: {
    width: 128,
    height: 128,
    marginBottom: 24,
  },
  logoMain: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 128,
    height: 128,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCard: {
    position: 'absolute',
    right: -8,
    bottom: -8,
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: C.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCoin: {
    position: 'absolute',
    left: -8,
    top: -8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.bgWarn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 30,
    fontWeight: '600',
    color: C.textDark,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    color: C.textMid,
    marginTop: 8,
  },
  desc: {
    fontSize: 12,
    color: C.textDesc,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  buttons: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 10,
  },
  // 아이디 로그인 버튼 (메인 올리브)
  btnIdLogin: {
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: C.textMid,
    alignItems: 'center',
  },
  btnIdLoginText: {
    fontSize: 15,
    fontWeight: '600',
    color: C.white,
  },

  // 회원가입 링크 행
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 4,
  },
  signupLabel: {
    fontSize: 12,
    color: 'rgba(111,127,63,0.7)',
  },
  signupLink: {
    fontSize: 12,
    color: C.textMid,
    textDecorationLine: 'underline',
  },

  shadowSm: {
    shadowColor: '#344225',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  shadowMd: {
    shadowColor: '#344225',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 3,
  },
  shadowLg: {
    shadowColor: '#344225',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
    elevation: 8,
  },
});

export default LoginScreen;

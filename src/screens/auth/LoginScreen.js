import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ROUTES } from '../../constants/routes';
import { LOGIN_ILLUSTRATION } from '../../constants/loginAssets';
import { redesign } from '../../theme/redesign';

const LoginScreen = ({ navigation }) => {
  const { height: windowHeight } = useWindowDimensions();

  const handlePhoneLogin = () => navigation.navigate(ROUTES.PHONE_LOGIN);
  const handleSignup = () => navigation.navigate(ROUTES.SIGNUP);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* ── 상단 브랜드 영역 ─────────────────────────────── */}
      <View style={[styles.brand, { paddingTop: Math.round(windowHeight * 0.06) }]}>
        <View style={styles.accentLine} />
        <Text style={styles.wordmark}>MOAJE</Text>
        <Text style={styles.headline}>{'오늘 쓸 돈을,\n내일 걱정 없이.'}</Text>
      </View>

      {/* ── 중앙 일러스트 영역: 남는 공간 안에서 contain으로 비율 유지(찌그러짐/잘림 없이 축소) ───── */}
      <View style={styles.illustrationArea}>
        <Image
          source={LOGIN_ILLUSTRATION}
          style={styles.illustration}
          resizeMode="contain"
          accessible={false}
          accessibilityIgnoresInvertColors
        />
      </View>

      {/* ── 버튼 영역 ─────────────────────────────── */}
      <View style={styles.bottom}>
        <TouchableOpacity
          onPress={handlePhoneLogin}
          activeOpacity={0.85}
          style={styles.loginButton}
          accessibilityRole="button"
          accessibilityLabel="로그인"
        >
          <Text style={styles.loginButtonText}>로그인</Text>
        </TouchableOpacity>

        {/* 회원가입 */}
        <View style={styles.signupRow}>
          <Text style={styles.signupLabel}>아직 계정이 없어요</Text>
          <Text style={styles.signupDot}>·</Text>
          <TouchableOpacity
            onPress={handleSignup}
            activeOpacity={0.5}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          >
            <Text style={styles.signupLink}>회원가입</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: redesign.bg,
  },
  brand: {
    paddingHorizontal: redesign.pagePaddingX,
  },
  illustrationArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: redesign.pagePaddingX,
    paddingVertical: 16,
  },
  illustration: {
    width: '100%',
    maxWidth: 360,
    height: '100%',
  },
  accentLine: {
    width: 24,
    height: 2,
    backgroundColor: redesign.accent,
    marginBottom: 10,
  },
  wordmark: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontSize: 13,
    letterSpacing: 2.5,
    color: redesign.accent,
  },
  headline: {
    marginTop: 22,
    fontSize: 32,
    lineHeight: 42,
    fontWeight: '800',
    letterSpacing: -0.8,
    color: redesign.textPrimary,
  },
  bottom: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingBottom: 28,
  },
  loginButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: redesign.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingTop: 20,
  },
  signupLabel: {
    fontSize: 14,
    color: redesign.textSecondary,
  },
  signupDot: {
    fontSize: 14,
    color: redesign.textSecondary,
  },
  signupLink: {
    fontSize: 14,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
});

export default LoginScreen;

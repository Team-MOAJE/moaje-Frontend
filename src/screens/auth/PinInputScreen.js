import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch } from 'react-redux';
import { colors } from '../../theme';
import { redesign } from '../../theme/redesign';
import { API_CODES } from '../../constants/apiCodes';
import { API_ERROR_KIND } from '../../services/apiResponse';
import {
  loginUser,
  fetchCurrentUser,
  registerUser,
  confirmPinReset,
  verifyUnlockPin,
  logoutUser,
  classifyUnlockFailure,
  UNLOCK_FAILURE,
} from '../../features/auth/authApi';
import { runGuardedLogout } from '../../features/auth/guardedLogout';
import { ROUTES } from '../../constants/routes';

const PIN_LENGTH = 6;

// 회원가입 실패 문구: 네트워크 문제와 서버가 거절한 사유(예: 중복 가입)를 구분한다.
const getSignupErrorMessage = error => {
  if (error?.kind === API_ERROR_KIND.NETWORK || error?.kind === API_ERROR_KIND.TIMEOUT) {
    return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
  }
  if (
    (error?.kind === API_ERROR_KIND.BUSINESS || error?.kind === API_ERROR_KIND.HTTP_4XX) &&
    error?.message
  ) {
    return error.message;
  }
  return '처리 중 문제가 발생했어요. 다시 시도해 주세요.';
};

const ME_RETRY_MESSAGE = '로그인은 됐지만 사용자 정보를 불러오지 못했어요.';
const SESSION_RELOGIN_MESSAGE = '다시 로그인해 주세요. PIN을 입력해 주세요.';

// 로그인 실패 문구. 서버 코드는 실행 중 Auth 소스 기준(실요청 검증 전)이며,
// 미가입 번호와 PIN 불일치는 서버가 같은 코드(AUTH-422-001)로 응답해 구분하지 않는다.
const getLoginErrorMessage = error => {
  if (error?.code === API_CODES.AUTH_LOGIN_INVALID_CREDENTIALS) {
    return '전화번호 또는 PIN이 올바르지 않아요. 다시 입력해 주세요.';
  }
  if (error?.stage === 'me') {
    return error.retryable ? ME_RETRY_MESSAGE : SESSION_RELOGIN_MESSAGE;
  }
  if (error?.kind === API_ERROR_KIND.NETWORK || error?.kind === API_ERROR_KIND.TIMEOUT) {
    return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
  }
  if (error?.kind === API_ERROR_KIND.HTTP_5XX) {
    return '잠시 후 다시 시도해 주세요.';
  }
  if (
    (error?.kind === API_ERROR_KIND.BUSINESS || error?.kind === API_ERROR_KIND.HTTP_4XX) &&
    error?.message
  ) {
    return error.message;
  }
  return '로그인 중 문제가 발생했어요. 다시 시도해 주세요.';
};

// 앱 잠금 해제(unlock 모드) 실패 문구. 서버가 잘못된 PIN과 무효한 세션을 같은 401로 내려 구분할 수 없으므로,
// 반복되면 로그아웃 후 다시 로그인하도록 안내한다.
const UNLOCK_AMBIGUOUS_MESSAGE = 'PIN이 올바르지 않거나 로그인 정보가 만료되었을 수 있어요.';
const UNLOCK_AMBIGUOUS_REPEATED_MESSAGE =
  'PIN 확인이 계속 되지 않아요. 아래 "로그아웃하고 다시 로그인"을 이용해 주세요.';
const UNLOCK_LOCKED_TEXT =
  '앱 잠금 해제가 일시적으로 제한되었어요.\nPIN을 5회 연속 잘못 입력했어요.\n30분 후 다시 시도해 주세요.';

const getUnlockErrorMessage = (type, ambiguousCount) => {
  switch (type) {
    case UNLOCK_FAILURE.AMBIGUOUS_AUTH:
      return ambiguousCount >= 2 ? UNLOCK_AMBIGUOUS_REPEATED_MESSAGE : UNLOCK_AMBIGUOUS_MESSAGE;
    case UNLOCK_FAILURE.NETWORK:
      return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
    case UNLOCK_FAILURE.SERVER:
      return '잠시 후 다시 시도해 주세요.';
    default:
      return '잠금 해제 중 문제가 발생했어요. 다시 시도해 주세요.';
  }
};

function PinDotIndicator({ pinLength }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View key={i} style={[styles.dot, i < pinLength ? styles.dotFilled : styles.dotEmpty]} />
      ))}
    </View>
  );
}

function PinKey({ label, onPress, disabled }) {
  const isDel = label === 'del';
  return (
    <Pressable
      style={({ pressed }) => [
        styles.key,
        pressed && !disabled && styles.keyPressed,
        disabled && styles.keyDisabled,
      ]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityLabel={isDel ? '지우기' : `${label} 입력`}
    >
      {isDel ? (
        <Ionicons name="backspace-outline" size={26} color={redesign.textSecondary} />
      ) : (
        <Text style={styles.keyNum}>{label}</Text>
      )}
    </Pressable>
  );
}

function PinKeypad({ onPressNum, onPressDel, disabled }) {
  const ROWS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'del'],
  ];

  return (
    <View style={styles.keypad}>
      {ROWS.map((row, ri) => (
        <View key={ri} style={styles.keyRow}>
          {row.map((k, ci) => {
            if (k === '') {
              return <View key={`e-${ri}-${ci}`} style={styles.keyEmpty} />;
            }
            return (
              <PinKey
                key={`k-${ri}-${ci}`}
                label={k}
                disabled={disabled}
                onPress={() => (k === 'del' ? onPressDel() : onPressNum(k))}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

const TITLES = {
  login: {
    setup: {
      title: 'PIN 번호 입력',
      subtitle: '전화번호와 함께 사용할 PIN 6자리를 입력해 주세요.',
    },
  },
  signup: {
    setup: {
      title: 'PIN 설정',
      subtitle: '앞으로 로그인에 사용할 숫자 6자리 PIN을 설정해 주세요.',
    },
    confirm: { title: 'PIN 재입력', subtitle: '다시 한 번 입력해 주세요.' },
  },
  reset: {
    setup: { title: '새 PIN 설정', subtitle: '새로 사용할 숫자 6자리 PIN을 설정해 주세요.' },
    confirm: { title: 'PIN 재입력', subtitle: '다시 한 번 입력해 주세요.' },
  },
  unlock: {
    setup: { title: 'PIN 번호 입력', subtitle: '안전한 이용을 위해 PIN 번호를 입력해 주세요.' },
  },
};

export default function PinInputScreen({ navigation, route }) {
  const dispatch = useDispatch();
  const { mode, phoneNumber, name, termsRecords } = route.params ?? {};

  const [pin, setPin] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [phase, setPhase] = useState('setup'); // 'setup' | 'confirm' — signup/reset 모드에서만 의미 있음
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  // 로그인 성공 후 /me만 일시 실패한 상태 — [다시 시도]로 /me만 재조회한다(login 재호출 없음).
  const [meRetryAvailable, setMeRetryAvailable] = useState(false);

  // unlock 모드: 모호한 401 연속 횟수, 로그아웃 진행 중 여부(중복 로그아웃 방지)
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const ambiguousCountRef = useRef(0);
  const isLoggingOutRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const pendingPinRef = useRef(null);
  const isRetryingMeRef = useRef(false);

  const isTwoPhaseMode = mode === 'signup' || mode === 'reset';
  const copy = TITLES[mode]?.[isTwoPhaseMode ? phase : 'setup'] ?? TITLES.login.setup;

  const resetInput = useCallback(() => setPin([]), []);

  const handleLoginAttempt = useCallback(
    async enteredPin => {
      setIsSubmitting(true);
      setMeRetryAvailable(false);
      try {
        await dispatch(loginUser({ phoneNumber, pin: enteredPin })).unwrap();
        // 성공 시 navigate 없음 — authSlice 상태 변화로 RootNavigator가 자동 전환한다.
      } catch (error) {
        if (error?.code === API_CODES.AUTH_PIN_LOCKED) {
          setIsLocked(true);
        } else {
          setErrorMsg(getLoginErrorMessage(error));
          setMeRetryAvailable(error?.stage === 'me' && error?.retryable === true);
        }
        resetInput();
      } finally {
        setIsSubmitting(false);
      }
    },
    [dispatch, phoneNumber, resetInput]
  );

  const handleRetryMe = useCallback(async () => {
    if (isRetryingMeRef.current) return; // 진행 중 중복 요청 방지
    isRetryingMeRef.current = true;
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      await dispatch(fetchCurrentUser()).unwrap();
      // 성공 시 navigate 없음 — authSlice가 인증 상태를 반영하고 RootNavigator가 전환한다.
    } catch (error) {
      setErrorMsg(getLoginErrorMessage(error));
      setMeRetryAvailable(error?.retryable === true);
    } finally {
      isRetryingMeRef.current = false;
      setIsSubmitting(false);
    }
  }, [dispatch]);

  const handleTwoPhaseSetupComplete = useCallback(
    enteredPin => {
      pendingPinRef.current = enteredPin;
      setPhase('confirm');
      resetInput();
    },
    [resetInput]
  );

  const handleTwoPhaseConfirmComplete = useCallback(
    async enteredPin => {
      if (enteredPin !== pendingPinRef.current) {
        setErrorMsg('PIN이 일치하지 않아요. 처음부터 다시 입력해 주세요.');
        pendingPinRef.current = null;
        setPhase('setup');
        resetInput();
        return;
      }

      const firstPin = pendingPinRef.current;

      setIsSubmitting(true);
      setErrorMsg('');
      try {
        if (mode === 'signup') {
          await dispatch(
            registerUser({ phoneNumber, name, pin: firstPin, pinConfirm: enteredPin, termsRecords })
          ).unwrap();
          // 성공 시 navigate 없음 — authSlice가 인증 상태 반영, RootNavigator가 자동 전환한다.
        } else {
          await dispatch(confirmPinReset({ phoneNumber, pin: enteredPin })).unwrap();
          navigation.popToTop();
        }
      } catch (error) {
        setErrorMsg(
          mode === 'signup'
            ? getSignupErrorMessage(error)
            : '처리 중 문제가 발생했어요. 다시 시도해 주세요.'
        );
        setPhase('setup');
        resetInput();
      } finally {
        pendingPinRef.current = null;
        setIsSubmitting(false);
      }
    },
    [dispatch, mode, phoneNumber, name, termsRecords, navigation, resetInput]
  );

  const handleUnlockAttempt = useCallback(
    async enteredPin => {
      setIsSubmitting(true);
      try {
        await dispatch(verifyUnlockPin({ pin: enteredPin })).unwrap();
        // 성공 시 navigate 없음 — authSlice가 isAppUnlocked를 true로 바꾸면 RootNavigator가 홈으로 전환한다.
        ambiguousCountRef.current = 0;
      } catch (error) {
        const type = classifyUnlockFailure(error);

        if (type === UNLOCK_FAILURE.SESSION_ENDED || type === UNLOCK_FAILURE.CANCELED) {
          // 세션이 정리됐거나 바뀐 경우: 스토어/네비게이터가 전환을 처리한다. 오류 문구를 띄우지 않는다.
          return;
        }

        if (type === UNLOCK_FAILURE.LOCKED) {
          setIsLocked(true);
        } else {
          ambiguousCountRef.current =
            type === UNLOCK_FAILURE.AMBIGUOUS_AUTH ? ambiguousCountRef.current + 1 : 0;
          setErrorMsg(getUnlockErrorMessage(type, ambiguousCountRef.current));
        }
        resetInput();
      } finally {
        setIsSubmitting(false);
      }
    },
    [dispatch, resetInput]
  );

  // 잠금 화면에서 PIN 없이 일반 로그인으로 돌아가는 유일한 경로(만료된 세션·5회 잠금에서 갇히지 않도록).
  // 기존 logoutUser(runLogout)를 그대로 쓴다: 서버 로그아웃 시도 + 로컬 토큰은 항상 삭제 → AuthNavigator 전환.
  // 진행 상태는 성공·실패 모두 되돌린다(guardedLogout.js 참고).
  const performLogout = useCallback(
    () =>
      runGuardedLogout({
        busyRef: isLoggingOutRef,
        mountedRef: isMountedRef,
        setBusy: setIsLoggingOut,
        logout: () => dispatch(logoutUser()).unwrap(),
      }),
    [dispatch]
  );

  const handleLogoutPress = useCallback(() => {
    if (isLoggingOutRef.current) return;
    Alert.alert(
      '로그아웃',
      '로그아웃하고 다시 로그인할까요?\n다시 이용하려면 전화번호와 PIN이 필요해요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '로그아웃', style: 'destructive', onPress: performLogout },
      ]
    );
  }, [performLogout]);

  const handlePinComplete = useCallback(
    enteredPin => {
      if (mode === 'login') {
        handleLoginAttempt(enteredPin);
      } else if (mode === 'unlock') {
        handleUnlockAttempt(enteredPin);
      } else if (isTwoPhaseMode) {
        if (phase === 'setup') {
          handleTwoPhaseSetupComplete(enteredPin);
        } else {
          handleTwoPhaseConfirmComplete(enteredPin);
        }
      }
    },
    [
      mode,
      phase,
      isTwoPhaseMode,
      handleLoginAttempt,
      handleUnlockAttempt,
      handleTwoPhaseSetupComplete,
      handleTwoPhaseConfirmComplete,
    ]
  );

  const handleNum = useCallback(
    num => {
      if (isSubmitting || isLocked) return;
      if (pin.length >= PIN_LENGTH) return;
      setErrorMsg('');
      setMeRetryAvailable(false); // PIN을 다시 입력하면 /me 재시도 대신 새 로그인으로 진행한다.
      const next = [...pin, num];
      setPin(next);
      if (next.length === PIN_LENGTH) {
        const enteredPin = next.join('');
        setTimeout(() => handlePinComplete(enteredPin), 180);
      }
    },
    [pin, isSubmitting, isLocked, handlePinComplete]
  );

  const handleDel = useCallback(() => {
    if (isSubmitting || isLocked) return;
    if (pin.length === 0) return;
    setPin(prev => prev.slice(0, -1));
  }, [pin, isSubmitting, isLocked]);

  const handleBack = () => {
    if (mode === 'unlock') return; // 잠금 화면은 뒤로가기로 우회할 수 없다.

    if (isTwoPhaseMode && phase === 'confirm') {
      pendingPinRef.current = null;
      setPhase('setup');
      resetInput();
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const handleResetPin = () => {
    navigation.navigate(ROUTES.PIN_RESET_VERIFY, { phoneNumber });
  };

  const keypadDisabled = isSubmitting || isLocked || isLoggingOut;

  // unlock 모드에서만 보이는 탈출 버튼. 잠금(423) 상태에서도 사용할 수 있고, 진행 중에는 비활성화한다.
  const logoutButton =
    mode === 'unlock' ? (
      <Pressable
        onPress={handleLogoutPress}
        disabled={isSubmitting || isLoggingOut}
        hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
        style={styles.forgotBtn}
        accessibilityRole="button"
        accessibilityLabel="로그아웃하고 다시 로그인"
      >
        <Text style={styles.forgotText}>
          {isLoggingOut ? '로그아웃 중...' : '로그아웃하고 다시 로그인'}
        </Text>
      </Pressable>
    ) : null;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        {mode !== 'unlock' && (
          <Pressable
            onPress={handleBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => pressed && styles.backBtnPressed}
            accessibilityLabel="뒤로가기"
          >
            <Ionicons name="arrow-back" size={22} color={redesign.textPrimary} />
          </Pressable>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.subtitle}>{copy.subtitle}</Text>

        {!isLocked && (
          <View style={styles.indicatorArea}>
            <PinDotIndicator pinLength={pin.length} />
            <View style={styles.errorSlot}>
              {errorMsg ? <Text style={styles.errorMsg}>{errorMsg}</Text> : null}
              {meRetryAvailable && (
                <Pressable
                  onPress={handleRetryMe}
                  disabled={isSubmitting}
                  hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
                  style={styles.forgotBtn}
                  accessibilityRole="button"
                >
                  <Text style={styles.forgotText}>다시 시도</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* 서버 정책: PIN 5회 연속 실패 시 30분 로그인 제한. PIN 재설정 API가 없어 재설정 버튼은 표시하지 않는다. */}
        {isLocked && (
          <View style={styles.lockedBox}>
            <Text style={styles.lockedText}>
              {mode === 'unlock'
                ? UNLOCK_LOCKED_TEXT
                : '간편 비밀번호가 잠겼습니다.\nPIN을 5회 연속 잘못 입력하여 일시적으로 로그인이 제한되었습니다.\n30분 후 다시 시도해 주세요.'}
            </Text>
          </View>
        )}
        {isLocked && logoutButton}
      </View>

      {!isLocked && (
        <View style={styles.keypadWrapper}>
          <PinKeypad onPressNum={handleNum} onPressDel={handleDel} disabled={keypadDisabled} />
          {logoutButton}
          {mode === 'login' && (
            <Pressable
              onPress={handleResetPin}
              hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
              style={styles.forgotBtn}
            >
              <Text style={styles.forgotText}>PIN을 잊으셨나요?</Text>
            </Pressable>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: redesign.bg,
  },
  header: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 12,
    paddingBottom: 8,
    minHeight: 22 + 12 + 8,
    alignItems: 'flex-start',
  },
  backBtnPressed: {
    opacity: 0.6,
  },
  body: {
    flex: 1,
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 24,
  },
  title: {
    fontSize: 29,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: redesign.textPrimary,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 21,
    color: redesign.textSecondary,
  },
  indicatorArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
  },
  dotEmpty: {
    borderColor: redesign.navInactive,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    borderColor: redesign.accent,
    backgroundColor: redesign.accent,
  },
  errorSlot: {
    alignSelf: 'stretch',
    minHeight: 40,
    marginTop: 16,
  },
  errorMsg: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
    color: colors.red,
  },
  lockedBox: {
    marginTop: 32,
    gap: 16,
    alignItems: 'flex-start',
  },
  lockedText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.red,
  },
  forgotBtn: {
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 8,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '500',
    color: redesign.textSecondary,
  },
  keypadWrapper: {
    paddingHorizontal: redesign.pagePaddingX - 8,
    paddingBottom: Platform.OS === 'android' ? 24 : 16,
  },
  keypad: {
    gap: 4,
  },
  keyRow: {
    flexDirection: 'row',
    gap: 4,
  },
  keyEmpty: {
    flex: 1,
    height: 60,
  },
  key: {
    flex: 1,
    height: 60,
    borderRadius: 12,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: {
    backgroundColor: redesign.surfaceSoft,
  },
  keyDisabled: {
    opacity: 0.4,
  },
  keyNum: {
    fontSize: 28,
    fontWeight: '500',
    color: redesign.textPrimary,
  },
});

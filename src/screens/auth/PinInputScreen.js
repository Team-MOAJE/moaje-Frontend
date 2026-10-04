import React, { useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch } from 'react-redux';
import { colors } from '../../theme';
import { redesign } from '../../theme/redesign';
import { API_CODES } from '../../constants/apiCodes';
import { loginUser, registerUser, verifyUnlockPin } from '../../features/auth/authApi';
import { unlockApp } from '../../features/auth/authSlice';
import { getVerificationProof, clearVerificationProof } from '../../features/auth/signupFlowMemory';

const PIN_LENGTH = 6;

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
  unlock: {
    setup: { title: 'PIN 번호 입력', subtitle: '안전한 이용을 위해 PIN 번호를 입력해 주세요.' },
  },
};

export default function PinInputScreen({ navigation, route }) {
  const dispatch = useDispatch();
  const { mode, phoneNumber, name, termsRecords } = route.params ?? {};

  const [pin, setPin] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [phase, setPhase] = useState('setup'); // 'setup' | 'confirm' — signup 모드에서만 의미 있음
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const pendingPinRef = useRef(null);

  const isTwoPhaseMode = mode === 'signup';
  const copy = TITLES[mode]?.[isTwoPhaseMode ? phase : 'setup'] ?? TITLES.login.setup;

  const resetInput = useCallback(() => setPin([]), []);

  const handleLoginAttempt = useCallback(
    async enteredPin => {
      setIsSubmitting(true);
      try {
        await dispatch(loginUser({ phoneNumber, pin: enteredPin })).unwrap();
        // 성공 시 navigate 없음 — authSlice 상태 변화로 RootNavigator가 자동 전환한다.
      } catch (error) {
        if (error?.code === API_CODES.AUTH_ACCOUNT_LOCKED) {
          setIsLocked(true);
        } else {
          setErrorMsg('PIN이 올바르지 않아요. 다시 입력해 주세요.');
        }
        resetInput();
      } finally {
        setIsSubmitting(false);
      }
    },
    [dispatch, phoneNumber, resetInput]
  );

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

      setIsSubmitting(true);
      setErrorMsg('');
      const verificationProof = getVerificationProof('signup', phoneNumber);
      try {
        await dispatch(
          registerUser({ phoneNumber, name, pin: enteredPin, verificationProof, termsRecords })
        ).unwrap();
        // 성공 시 navigate 없음 — authSlice가 인증 상태 반영, RootNavigator가 자동 전환한다.
        clearVerificationProof();
      } catch {
        setErrorMsg('처리 중 문제가 발생했어요. 다시 시도해 주세요.');
        setPhase('setup');
        resetInput();
      } finally {
        pendingPinRef.current = null;
        setIsSubmitting(false);
      }
    },
    [dispatch, phoneNumber, name, termsRecords, resetInput]
  );

  const handleUnlockAttempt = useCallback(
    async enteredPin => {
      setIsSubmitting(true);
      try {
        await dispatch(verifyUnlockPin({ pin: enteredPin })).unwrap();
        dispatch(unlockApp());
      } catch {
        setErrorMsg('PIN이 올바르지 않아요. 다시 입력해 주세요.');
        resetInput();
      } finally {
        setIsSubmitting(false);
      }
    },
    [dispatch, resetInput]
  );

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

  const keypadDisabled = isSubmitting || isLocked;

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
            </View>
          </View>
        )}

        {isLocked && (
          <View style={styles.lockedBox}>
            <Text style={styles.lockedText}>
              PIN이 여러 번 잘못 입력되어 잠겼어요. 잠시 후 다시 시도해 주세요.
            </Text>
          </View>
        )}
      </View>

      {!isLocked && (
        <View style={styles.keypadWrapper}>
          <PinKeypad onPressNum={handleNum} onPressDel={handleDel} disabled={keypadDisabled} />
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

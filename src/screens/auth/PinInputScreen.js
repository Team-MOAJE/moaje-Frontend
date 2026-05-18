import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadows, spacing } from '../../theme';

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

function PinKey({ label, onPress }) {
  const isDel = label === 'del';
  return (
    <Pressable
      style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
      onPress={onPress}
      accessibilityLabel={isDel ? '지우기' : `${label} 입력`}
    >
      {isDel ? (
        <View style={styles.delInner}>
          <Text style={styles.delIcon}>⌫</Text>
          <Text style={styles.delText}>지우기</Text>
        </View>
      ) : (
        <Text style={styles.keyNum}>{label}</Text>
      )}
    </Pressable>
  );
}

function PinKeypad({ onPressNum, onPressDel }) {
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
                onPress={() => (k === 'del' ? onPressDel() : onPressNum(k))}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

export default function PinInputScreen({ navigation }) {
  const [pin, setPin] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  const handlePinComplete = useCallback(() => {
    // TODO: API Gateway PIN verification will be connected later.
    setPin([]);
  }, []);

  const handleNum = useCallback(
    num => {
      if (pin.length >= PIN_LENGTH) return;
      setErrorMsg('');
      const next = [...pin, num];
      setPin(next);
      if (next.length === PIN_LENGTH) {
        setTimeout(handlePinComplete, 180);
      }
    },
    [pin, handlePinComplete]
  );

  const handleDel = useCallback(() => {
    if (pin.length === 0) return;
    setPin(prev => prev.slice(0, -1));
  }, [pin]);

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
    // TODO: fallback navigation when called from a specific security event
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={handleBack}
          accessibilityLabel="뒤로가기"
        >
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.iconBox}>
          <Ionicons name="lock-closed" size={30} color={colors.white} />
        </View>

        <View style={styles.titleGroup}>
          <Text style={styles.title}>PIN 번호 입력</Text>
          <Text style={styles.subtitle}>안전한 이용을 위해 PIN 번호를 입력해 주세요.</Text>
        </View>

        <PinDotIndicator pinLength={pin.length} />

        {errorMsg ? <Text style={styles.errorMsg}>{errorMsg}</Text> : null}
      </View>

      <View style={styles.keypadWrapper}>
        <PinKeypad onPressNum={handleNum} onPressDel={handleDel} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  backBtnPressed: {
    opacity: 0.7,
  },
  backIcon: {
    fontSize: 24,
    color: colors.textDark,
    lineHeight: 28,
    marginTop: -2,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.oliveDark,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  titleGroup: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textDark,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textLight,
    textAlign: 'center',
    lineHeight: 20,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  dotEmpty: {
    borderWidth: 2,
    borderColor: colors.olive,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: colors.olive,
  },
  errorMsg: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.red,
    textAlign: 'center',
  },
  keypadWrapper: {
    paddingHorizontal: spacing.xl,
    paddingBottom: Platform.OS === 'android' ? spacing.xl : spacing.lg,
  },
  keypad: {
    gap: spacing.sm,
  },
  keyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  keyEmpty: {
    flex: 1,
    height: 64,
  },
  key: {
    flex: 1,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  keyPressed: {
    opacity: 0.75,
  },
  keyNum: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.textDark,
  },
  delInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  delIcon: {
    fontSize: 20,
    color: colors.textDark,
  },
  delText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textMid,
    marginTop: 1,
  },
});

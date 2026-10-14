import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useSelector, useDispatch, useStore } from 'react-redux';
import { redesign } from '../../theme';
import { ROUTES } from '../../constants/routes';
import { fetchAccounts, openAccount } from '../../features/asset/assetApi';
import {
  DEMO_BANK_CODE,
  DEMO_PRODUCT_NAME,
  OPEN_ACCOUNT_BLOCK_MESSAGE,
  OPEN_ACCOUNT_BLOCK_REASON,
  OPEN_ACCOUNT_SUCCESS_MESSAGE,
  buildOpenAccountInput,
} from '../../features/asset/accountOpenInput';

const QUICK_AMOUNTS = [100000, 500000, 1000000];

const PLACEHOLDER_COLOR = '#C4C4BF';

// 시연용 Mock 계좌 개설(API-09). 실제 금융 계좌 개설이나 본인인증이 아니며, 기존 "계좌 연결"과는 다른 기능이다.
// 요청 값(ci·이름·전화번호)은 로그인 사용자 정보에서만 만들고, 계좌 목록에는 API-52 재조회 결과만 반영된다.
export default function AccountOpenScreen({ navigation }) {
  const dispatch = useDispatch();
  const store = useStore();
  const user = useSelector(state => state.auth.user);
  const openAccountLoading = useSelector(state => state.asset.openAccountLoading);

  const [initialBalance, setInitialBalance] = useState(0);
  const submittingRef = useRef(false);

  const built = buildOpenAccountInput({ user, initialBalance });
  const blockReason = built.ok ? null : built.reason;
  // 이름·전화번호·로그인 정보 부족은 입력으로 해결할 수 없으므로 항상 안내한다(잔액 입력 오류와 구분).
  const profileNotice =
    blockReason !== null && blockReason !== OPEN_ACCOUNT_BLOCK_REASON.INITIAL_BALANCE
      ? OPEN_ACCOUNT_BLOCK_MESSAGE[blockReason]
      : null;
  const isActive = built.ok && !openAccountLoading;

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate(ROUTES.HOME);
  };

  const handleBalanceChange = text => {
    setInitialBalance(parseInt(text.replace(/[^0-9]/g, '') || '0', 10));
  };

  const handleQuickAmount = add => setInitialBalance(prev => prev + add);

  const handleOpenPress = async () => {
    if (!isActive || submittingRef.current) return;
    submittingRef.current = true;
    const generation = store.getState().asset.sessionGeneration;
    try {
      const result = await dispatch(openAccount(built.input));
      if (result.meta?.condition) return; // 이미 진행 중인 요청
      if (store.getState().asset.sessionGeneration !== generation) return; // 그 사이 로그아웃·사용자 전환

      if (openAccount.fulfilled.match(result)) {
        // 개설 성공이 확인된 경우에만 계좌 목록을 1회 재조회한다. Kafka 반영 지연으로 아직 안 보일 수 있고 자동 반복하지 않는다.
        dispatch(fetchAccounts());
        Alert.alert('계좌 개설 요청 완료', OPEN_ACCOUNT_SUCCESS_MESSAGE, [
          { text: '확인', onPress: handleBack },
        ]);
      } else {
        Alert.alert('계좌 개설 실패', result.payload?.message ?? '계좌 개설에 실패했습니다.');
      }
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="뒤로 가기"
              hitSlop={12}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            >
              <Feather name="arrow-left" size={24} color={redesign.textPrimary} />
            </Pressable>

            <Text style={styles.pageTitle}>계좌 개설</Text>
            <Text style={styles.notice}>
              시연용 Mock 계좌를 만들어요. 실제 금융 계좌 개설이나 본인인증이 아니에요.
            </Text>

            {profileNotice ? <Text style={styles.warning}>{profileNotice}</Text> : null}

            <View style={styles.section}>
              <Text style={styles.label}>은행 코드</Text>
              <Text style={styles.fixedValue}>{DEMO_BANK_CODE}</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>상품</Text>
              <Text style={styles.fixedValue}>{DEMO_PRODUCT_NAME}</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.question}>시연용 초기 잔액</Text>
              <View style={styles.amountRow}>
                <TextInput
                  style={styles.amountInput}
                  keyboardType="number-pad"
                  editable={!openAccountLoading}
                  value={initialBalance === 0 ? '' : initialBalance.toLocaleString('ko-KR')}
                  onChangeText={handleBalanceChange}
                  placeholder="0"
                  placeholderTextColor={PLACEHOLDER_COLOR}
                />
                <Text style={styles.amountUnit}>원</Text>
              </View>
              <View style={styles.quickRow}>
                {QUICK_AMOUNTS.map(add => (
                  <Pressable
                    key={add}
                    onPress={() => handleQuickAmount(add)}
                    disabled={openAccountLoading}
                    style={({ pressed }) => [styles.quickBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.quickBtnText}>+{add / 10000}만</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable
              onPress={handleOpenPress}
              disabled={!isActive}
              accessibilityRole="button"
              accessibilityState={{ disabled: !isActive }}
              style={({ pressed }) => [
                styles.submitButton,
                isActive ? styles.submitButtonActive : styles.submitButtonInactive,
                isActive && pressed && styles.submitButtonPressed,
              ]}
            >
              <Text
                style={[
                  styles.submitText,
                  isActive ? styles.submitTextActive : styles.submitTextInactive,
                ]}
              >
                {openAccountLoading ? '요청 중이에요' : '계좌 만들기'}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: redesign.bg,
  },
  screen: {
    flex: 1,
    backgroundColor: redesign.bg,
  },
  keyboardView: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 16,
    paddingBottom: 110,
  },
  back: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: redesign.textPrimary,
    marginTop: 12,
  },
  notice: {
    fontSize: 13,
    color: redesign.textSecondary,
    marginTop: 8,
  },
  warning: {
    fontSize: 13,
    fontWeight: '600',
    color: redesign.textPrimary,
    marginTop: 16,
  },
  section: {
    marginTop: 32,
  },
  label: {
    fontSize: 12,
    color: redesign.textSecondary,
  },
  fixedValue: {
    fontSize: 20,
    fontWeight: '700',
    color: redesign.textPrimary,
    marginTop: 4,
  },
  question: {
    fontSize: 18,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: redesign.divider,
  },
  amountInput: {
    flex: 1,
    fontSize: 44,
    fontWeight: '800',
    color: redesign.textPrimary,
    paddingVertical: 8,
  },
  amountUnit: {
    fontSize: 22,
    fontWeight: '700',
    color: redesign.textPrimary,
    paddingBottom: 14,
    marginLeft: 8,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  quickBtn: {
    backgroundColor: redesign.surfaceSoft,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  quickBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: redesign.textPrimary,
  },
  submitButton: {
    marginTop: 40,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonActive: {
    backgroundColor: redesign.accent,
  },
  submitButtonInactive: {
    backgroundColor: redesign.divider,
  },
  submitButtonPressed: {
    opacity: 0.85,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '700',
  },
  submitTextActive: {
    color: redesign.bg,
  },
  submitTextInactive: {
    color: redesign.textSecondary,
  },
});

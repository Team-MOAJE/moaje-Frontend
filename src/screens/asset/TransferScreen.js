import React, { useState, useEffect, useRef } from 'react';
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
import { useSelector, useDispatch } from 'react-redux';
import { redesign } from '../../theme';
import { ROUTES } from '../../constants/routes';
import BottomNavBar from '../../components/home/BottomNavBar';
import { formatKRW } from '../../utils/formatMoney';
import { fetchAccounts, transferFunds } from '../../features/asset/assetApi';
import { selectDefaultAccount } from '../../utils/selectDefaultAccount';
import { ensureIdempotencyKey } from '../../utils/idempotencyKey';
import {
  canTransferFrom,
  formatExactMoney,
  getAccountStatusLabel,
  resolveHomeAccountsState,
} from '../../features/asset/assetScreenLogic';
import {
  TRANSFER_ERROR_OUTCOME,
  TRANSFER_OUTCOME,
  classifyTransferStatus,
  describeBlockedTransfer,
  describePendingTransfer,
  describeTransferOutcome,
  describeUncertainTransfer,
  isValidDepositInput,
  sanitizeDigits,
} from '../../features/asset/transferOutcome';
import { DEMO_BANK_CODE } from '../../features/asset/accountOpenInput';

const QUICK_AMOUNTS = [10000, 50000, 100000];

const PLACEHOLDER_COLOR = '#C4C4BF';

export default function TransferScreen({ navigation, route }) {
  const dispatch = useDispatch();
  const accounts = useSelector(state => state.asset.accounts);
  const accountsLoading = useSelector(state => state.asset.accountsLoading);
  const accountsError = useSelector(state => state.asset.accountsError);
  const sessionGeneration = useSelector(state => state.asset.sessionGeneration);
  const transferLoading = useSelector(state => state.asset.transferLoading);
  // 결과가 확정되지 않은 송금(처리 중 / 결과 확인 불가). 있으면 새 송금은 막고 같은 요청만 다시 확인한다.
  const pendingTransfer = useSelector(state => state.asset.pendingTransfer);
  const hasPending = pendingTransfer != null;
  const pendingNotice = describePendingTransfer(pendingTransfer);

  // 출금 계좌 결정 (다른 계좌로 조용히 대체하지 않는다. 새 선택 UI는 없다).
  // - fromAccountId 파라미터가 "있으면" 그 값만 사용한다. 문자열이 아니거나 빈 값이거나, 목록에 없거나, ACTIVE가 아니면 차단.
  // - 파라미터가 아예 없을 때만 일반 진입이며, 최초로 유효한 ACTIVE 계좌 1개의 id를 이 화면 세션 동안 고정한다.
  //   고정값은 id 문자열과 sessionGeneration뿐이다(계좌 객체·잔액은 복사하지 않고 매 렌더 Redux 목록으로 검증).
  const routeParams = route?.params;
  const hasFromParam =
    routeParams != null && Object.prototype.hasOwnProperty.call(routeParams, 'fromAccountId');
  const fromParam = hasFromParam ? routeParams.fromAccountId : null;
  const [pinned, setPinned] = useState(null);
  const pinnedId = pinned && pinned.generation === sessionGeneration ? pinned.id : null;

  useEffect(() => {
    if (hasFromParam) return;
    if (pinned && pinned.generation === sessionGeneration) return;
    const first = selectDefaultAccount(accounts);
    if (first) setPinned({ generation: sessionGeneration, id: first.id });
  }, [hasFromParam, pinned, sessionGeneration, accounts]);

  let requestedFromId = null;
  let fromParamValid = true;
  if (hasFromParam) {
    fromParamValid = typeof fromParam === 'string' && fromParam.trim().length > 0;
    requestedFromId = fromParamValid ? fromParam : null;
  } else {
    requestedFromId = pinnedId;
  }
  const requestedAccount =
    requestedFromId == null ? null : (accounts.find(a => a.id === requestedFromId) ?? null);
  const selectedAccount = canTransferFrom(requestedAccount) ? requestedAccount : null;
  // 차단 사유: 파라미터 형식 오류, 지정/고정된 계좌가 목록에 없음(삭제), 지정/고정된 계좌가 ACTIVE가 아님.
  const fromInvalid =
    (hasFromParam && !fromParamValid) || (requestedFromId != null && !selectedAccount);

  const [accountsRequested, setAccountsRequested] = useState(false);
  const accountsState = resolveHomeAccountsState({
    accounts,
    loading: accountsLoading,
    error: accountsError,
    fetched: accountsRequested,
  });
  let accountViewKind = 'ready';
  if (accountsState !== 'list') accountViewKind = accountsState;
  else if (fromInvalid) accountViewKind = 'fromInvalid';
  else if (!selectedAccount) {
    // 고정 전 한 프레임(effect 이전)은 loading, ACTIVE 계좌가 아예 없으면 noActive.
    accountViewKind = selectDefaultAccount(accounts) ? 'loading' : 'noActive';
  }

  const maxAmount =
    selectedAccount &&
    selectedAccount.balanceExact === true &&
    Number.isSafeInteger(selectedAccount.balance) &&
    selectedAccount.balance > 0
      ? selectedAccount.balance
      : null;
  const fromInvalidReason =
    requestedAccount && !canTransferFrom(requestedAccount)
      ? getAccountStatusLabel(requestedAccount)
      : null;

  const [amount, setAmount] = useState(0);
  const [depositBankCode, setDepositBankCode] = useState(DEMO_BANK_CODE);
  const [depositAccountNumber, setDepositAccountNumber] = useState('');
  const [memo, setMemo] = useState(''); // 서버 송금 요청에 없는 값이라 전송하지 않는다.

  // 미확정 송금이 있으면 입력란은 그 요청의 값을 보여주고 잠근다(새 의도로 바뀌지 않게).
  const shownAmount = hasPending ? pendingTransfer.request.amount : amount;
  const shownBankCode = hasPending ? pendingTransfer.request.depositBankCode : depositBankCode;
  const shownAccountNumber = hasPending
    ? pendingTransfer.request.depositAccountNumber
    : depositAccountNumber;

  // 한 번 확정된 송금 요청에 대한 멱등성 키 — 자동 재시도 시 동일 키 재사용
  const pendingIdempotencyKeyRef = useRef(null);

  const getCurrentTransferKey = () => {
    pendingIdempotencyKeyRef.current = ensureIdempotencyKey(pendingIdempotencyKeyRef.current);
    return pendingIdempotencyKeyRef.current;
  };

  const clearPendingTransferKey = () => {
    pendingIdempotencyKeyRef.current = null;
  };

  const isNewTransferActive =
    amount > 0 &&
    isValidDepositInput({ depositBankCode, depositAccountNumber }) &&
    !accountsLoading &&
    !transferLoading &&
    !!selectedAccount &&
    accountViewKind === 'ready';
  // 미확정 송금의 재확인은 저장된 요청만 보내므로 출금 계좌 상태와 무관하게 결과를 확인할 수 있어야 한다.
  const isActive = hasPending ? !transferLoading : isNewTransferActive;

  useEffect(() => {
    setAccountsRequested(true);
    dispatch(fetchAccounts());
  }, [dispatch]);

  const handleRetryAccounts = () => {
    if (accountsLoading) return;
    dispatch(fetchAccounts());
  };

  // 입력 잠금: 미확정 송금이 있는 동안에는 값을 바꾸지 않는다(키를 새로 만들어 새 송금을 보내는 경로 차단).
  const handleAmountChange = text => {
    if (hasPending) return;
    const n = parseInt(text.replace(/[^0-9]/g, '') || '0', 10);
    setAmount(n);
    clearPendingTransferKey();
  };

  const handleQuickAmount = add => {
    if (hasPending) return;
    setAmount(prev => prev + add);
    clearPendingTransferKey();
  };

  // 정확한 잔액(balanceExact=true인 안전한 양의 정수)일 때만 전액을 입력한다. 그 외에는 아무것도 하지 않는다.
  const handleMaxAmount = () => {
    if (hasPending || maxAmount == null) return;
    setAmount(maxAmount);
    clearPendingTransferKey();
  };

  const handleDepositBankChange = text => {
    if (hasPending) return;
    setDepositBankCode(sanitizeDigits(text));
    clearPendingTransferKey();
  };

  const handleDepositAccountChange = text => {
    if (hasPending) return;
    setDepositAccountNumber(sanitizeDigits(text));
    clearPendingTransferKey();
  };

  const handleMemoChange = text => {
    setMemo(text); // 요청 본문에 없으므로 송금 의도(멱등성 키)에 영향이 없다.
  };

  // 응답으로 확정된 결과만 성공으로 안내한다. 처리 중·결과 확인 불가는 완료로 표시하지 않는다.
  const submitTransfer = async arg => {
    const result = await dispatch(transferFunds(arg));
    if (result.meta?.condition) return; // 이미 진행 중인 요청 — 아무것도 하지 않는다.

    if (transferFunds.fulfilled.match(result)) {
      const outcome = classifyTransferStatus(result.payload.transfer.status);
      const notice = describeTransferOutcome(outcome);
      if (outcome === TRANSFER_OUTCOME.COMPLETED) {
        clearPendingTransferKey();
        Alert.alert(notice.title, notice.message);
        dispatch(fetchAccounts());
        navigation.goBack();
        return;
      }
      if (outcome !== TRANSFER_OUTCOME.IN_PROGRESS) clearPendingTransferKey(); // FAILED/REVERSED: 확정됨
      if (notice) Alert.alert(notice.title, notice.message);
      return;
    }

    const payload = result.payload ?? {};
    if (payload.outcome === TRANSFER_ERROR_OUTCOME.BLOCKED) {
      const notice = describeBlockedTransfer();
      Alert.alert(notice.title, notice.message);
    } else if (payload.outcome === TRANSFER_ERROR_OUTCOME.UNCERTAIN) {
      const notice = describeUncertainTransfer();
      Alert.alert(notice.title, notice.message);
    } else {
      // 서버가 실행하지 않았음이 확실한 거절 — 키는 유지(입력을 바꾸지 않고 다시 누르면 같은 키)
      Alert.alert('송금 실패', payload.message ?? '송금에 실패했습니다.');
    }
  };

  const handleTransferPress = () => {
    if (!isActive || transferLoading) return;
    if (hasPending) {
      // 사용자가 직접 누를 때만, 저장된 같은 요청 본문과 같은 키로 결과를 다시 확인한다(자동 재송금 없음).
      submitTransfer({ recheckPending: true });
      return;
    }
    if (!canTransferFrom(selectedAccount)) return;
    Alert.alert(
      '확인',
      `${depositBankCode}-${depositAccountNumber} 계좌로 ${formatKRW(amount)}을 송금할까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '확인',
          onPress: () =>
            submitTransfer({
              withdrawalAccountId: selectedAccount.id,
              depositBankCode,
              depositAccountNumber,
              amount,
              idempotencyKey: getCurrentTransferKey(),
            }),
        },
      ]
    );
  };

  const handleBottomHomePress = () => navigation.navigate(ROUTES.HOME);
  const handleBottomTransferPress = () => {};
  const handleBottomCategoryPress = () => navigation.navigate(ROUTES.CATEGORY);

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
            <Text style={styles.pageTitle}>송금</Text>

            {pendingNotice ? (
              <View style={styles.pendingBox}>
                <Text style={styles.accountNotice}>{pendingNotice.title}</Text>
                <Text style={styles.balance}>{pendingNotice.message}</Text>
              </View>
            ) : null}

            {/* 출금 계좌 */}
            <View style={styles.account}>
              <Text style={styles.accountLabel}>출금 계좌</Text>
              {accountViewKind === 'ready' ? (
                <>
                  <View style={styles.accountRow}>
                    <Text style={styles.accountBank}>{selectedAccount.label ?? '내 계좌'}</Text>
                  </View>
                  <Text style={styles.balance}>
                    현재 잔액{' '}
                    <Text style={styles.balanceValue}>
                      {formatExactMoney(selectedAccount.balance, selectedAccount.balanceExact)}
                    </Text>
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.accountRow}>
                    <Text style={styles.accountNotice}>
                      {accountViewKind === 'loading' && '계좌 정보를 불러오는 중이에요'}
                      {accountViewKind === 'error' && '계좌 정보를 불러오지 못했어요'}
                      {accountViewKind === 'empty' && '연결된 계좌가 없어 송금할 수 없어요'}
                      {accountViewKind === 'noActive' && '송금할 수 있는 계좌가 없어요'}
                      {accountViewKind === 'fromInvalid' && '출금 계좌를 확인해 주세요'}
                    </Text>
                  </View>
                  {accountViewKind === 'fromInvalid' && (
                    <Text style={styles.balance}>
                      {fromInvalidReason
                        ? `${fromInvalidReason} 상태의 계좌에서는 송금할 수 없어요.`
                        : '선택한 출금 계좌를 찾을 수 없어요.'}
                    </Text>
                  )}
                  {accountViewKind === 'error' && (
                    <Pressable
                      onPress={handleRetryAccounts}
                      disabled={accountsLoading}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.quickBtn,
                        styles.retryBtn,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.quickBtnText}>다시 시도</Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>

            {/* 받는 계좌 (입금 은행 코드 + 계좌번호, 숫자 문자열) */}
            <View style={styles.section}>
              <Text style={styles.question}>누구에게 보낼까요?</Text>
              <TextInput
                style={styles.lineInput}
                placeholder="입금 은행 코드"
                placeholderTextColor={PLACEHOLDER_COLOR}
                keyboardType="number-pad"
                maxLength={20}
                editable={!hasPending}
                value={shownBankCode}
                onChangeText={handleDepositBankChange}
                returnKeyType="next"
              />
              <TextInput
                style={styles.lineInput}
                placeholder="입금 계좌번호 (숫자만)"
                placeholderTextColor={PLACEHOLDER_COLOR}
                keyboardType="number-pad"
                maxLength={100}
                editable={!hasPending}
                value={shownAccountNumber}
                onChangeText={handleDepositAccountChange}
                returnKeyType="done"
              />
            </View>

            {/* 보낼 금액 */}
            <View style={styles.section}>
              <Text style={styles.question}>얼마를 보낼까요?</Text>
              <View style={styles.amountRow}>
                <TextInput
                  style={styles.amountInput}
                  keyboardType="number-pad"
                  editable={!hasPending}
                  value={shownAmount === 0 ? '' : shownAmount.toLocaleString('ko-KR')}
                  onChangeText={handleAmountChange}
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
                    disabled={hasPending}
                    style={({ pressed }) => [
                      styles.quickBtn,
                      hasPending && styles.quickBtnDisabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.quickBtnText}>+{add / 10000}만</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={handleMaxAmount}
                  disabled={hasPending || maxAmount == null}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: hasPending || maxAmount == null }}
                  style={({ pressed }) => [
                    styles.quickBtn,
                    (hasPending || maxAmount == null) && styles.quickBtnDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.quickBtnText,
                      hasPending || maxAmount == null
                        ? styles.submitTextInactive
                        : styles.quickBtnMaxText,
                    ]}
                  >
                    전액
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* 메모 */}
            <View style={styles.section}>
              <Text style={styles.question}>메모 (송금에 반영되지 않아요)</Text>
              <TextInput
                style={styles.lineInput}
                placeholder="예: 점심값, 교재비, 스터디 회비"
                placeholderTextColor={PLACEHOLDER_COLOR}
                value={memo}
                onChangeText={handleMemoChange}
                returnKeyType="done"
              />
            </View>

            {/* 하단 송금 버튼 */}
            <Pressable
              onPress={handleTransferPress}
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
                {hasPending ? '같은 요청 다시 확인' : '보내기'}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>

        <BottomNavBar
          onHomePress={handleBottomHomePress}
          onTransferPress={handleBottomTransferPress}
          onCategoryPress={handleBottomCategoryPress}
          activeKey="transfer"
        />
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
    paddingTop: 24,
    paddingBottom: 110,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
  account: {
    marginTop: 28,
    paddingVertical: 4,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  accountLabel: {
    fontSize: 12,
    color: redesign.textSecondary,
  },
  accountBank: {
    fontSize: 20,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  balance: {
    fontSize: 13,
    color: redesign.textSecondary,
    marginTop: 4,
  },
  balanceValue: {
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  section: {
    marginTop: 40,
  },
  question: {
    fontSize: 18,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  lineInput: {
    fontSize: 16,
    color: redesign.textPrimary,
    paddingVertical: 14,
    marginTop: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: redesign.divider,
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
  quickBtnDisabled: {
    opacity: 0.5,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  pendingBox: {
    marginTop: 20,
    padding: 14,
    borderRadius: 10,
    backgroundColor: redesign.surfaceSoft,
  },
  accountNotice: {
    fontSize: 16,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  quickBtnMaxText: {
    color: redesign.accent,
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

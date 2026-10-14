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
import { useSelector, useDispatch, useStore } from 'react-redux';
import { colors, redesign } from '../../theme';
import { ROUTES } from '../../constants/routes';
import BottomNavBar from '../../components/home/BottomNavBar';
import BankSelectModal from '../../components/asset/BankSelectModal';
import AccountSelectorBottomSheet from '../../components/asset/AccountSelectorBottomSheet';
import { formatKRW } from '../../utils/formatMoney';
import { fetchAccounts, transferFunds } from '../../features/asset/assetApi';
import { accountDataInvalidated } from '../../features/asset/assetSlice';
import { selectDefaultAccount } from '../../utils/selectDefaultAccount';
import { ensureIdempotencyKey } from '../../utils/idempotencyKey';
import {
  AMOUNT_TOO_LARGE_MESSAGE,
  BALANCE_CHECKING_MESSAGE,
  EXCEEDS_BALANCE_MESSAGE,
  TRANSFER_AMOUNT_ISSUE,
  canTransferFrom,
  formatExactMoney,
  getAccountStatusLabel,
  getTransferAmountIssue,
  isBalanceStale,
  resolveHomeAccountsState,
  resolveTransferFromId,
  transferFromParamKey,
  validateTransferAtConfirm,
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
import { getVirtualBankByCode } from '../../features/asset/virtualBanks';

const QUICK_AMOUNTS = [10000, 50000, 100000];

const PLACEHOLDER_COLOR = '#C4C4BF';
const BANK_PLACEHOLDER = '받는 은행을 선택해 주세요';

export default function TransferScreen({ navigation, route }) {
  const dispatch = useDispatch();
  const store = useStore();
  const accounts = useSelector(state => state.asset.accounts);
  const accountsLoading = useSelector(state => state.asset.accountsLoading);
  const accountsError = useSelector(state => state.asset.accountsError);
  const sessionGeneration = useSelector(state => state.asset.sessionGeneration);
  const staleBalanceAccountIds = useSelector(state => state.asset.staleBalanceAccountIds);
  const transferLoading = useSelector(state => state.asset.transferLoading);
  // 결과가 확정되지 않은 송금(처리 중 / 결과 확인 불가). 있으면 새 송금은 막고 같은 요청만 다시 확인한다.
  const pendingTransfer = useSelector(state => state.asset.pendingTransfer);
  const hasPending = pendingTransfer != null;
  const pendingNotice = describePendingTransfer(pendingTransfer);

  // 출금 계좌 결정 (다른 계좌로 조용히 대체하지 않는다).
  // - 사용자가 출금 계좌 선택창에서 고른 계좌(userPick)가 최우선이다. 선택 당시와 같은 세션·같은 param 상태일 때만 유효하다.
  // - fromAccountId 파라미터가 "있으면" 그 값만 사용한다. 문자열이 아니거나 빈 값이거나, 목록에 없거나, ACTIVE가 아니면 차단.
  // - 파라미터가 아예 없을 때만 일반 진입이며, 최초로 유효한 ACTIVE 계좌 1개의 id를 이 화면 세션 동안 고정한다.
  //   고정값은 id 문자열과 sessionGeneration뿐이다(계좌 객체·잔액은 복사하지 않고 매 렌더 Redux 목록으로 검증).
  const routeParams = route?.params;
  const hasFromParam =
    routeParams != null && Object.prototype.hasOwnProperty.call(routeParams, 'fromAccountId');
  const fromParam = hasFromParam ? routeParams.fromAccountId : null;
  const [pinned, setPinned] = useState(null);
  const pinnedId = pinned && pinned.generation === sessionGeneration ? pinned.id : null;
  const [userPick, setUserPick] = useState(null);
  const [fromSheetVisible, setFromSheetVisible] = useState(false);

  useEffect(() => {
    if (hasFromParam) return;
    if (pinned && pinned.generation === sessionGeneration) return;
    const first = selectDefaultAccount(accounts);
    if (first) setPinned({ generation: sessionGeneration, id: first.id });
  }, [hasFromParam, pinned, sessionGeneration, accounts]);

  const { requestedFromId, fromParamValid } = resolveTransferFromId({
    hasFromParam,
    fromParam,
    pinnedId,
    userPick,
    sessionGeneration,
  });
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

  // 송금 후 서버 잔액을 아직 확인하지 못한 출금 계좌: 목록의 이전 잔액으로 새 송금을 검증·전액 입력하지 않는다.
  const isSelectedStale = isBalanceStale(staleBalanceAccountIds, selectedAccount?.id);

  const maxAmount =
    !isSelectedStale &&
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
  // 안전 정수 범위를 넘는 입력(숫자 문자열). 있으면 amount는 0으로 두어 송금을 막고 입력 오류를 보여준다.
  const [amountOverflow, setAmountOverflow] = useState(null);
  // 받는 은행: 가상 은행 목록에서 고른 코드(문자열). 미선택이면 빈 문자열이며 송금이 차단된다. 요청에는 코드만 보낸다.
  const [depositBankCode, setDepositBankCode] = useState('');
  const [depositAccountNumber, setDepositAccountNumber] = useState('');
  const [bankModalVisible, setBankModalVisible] = useState(false);

  // 미확정 송금이 있으면 입력란은 그 요청의 값을 보여주고 잠근다(새 의도로 바뀌지 않게).
  const shownAmount = hasPending ? pendingTransfer.request.amount : amount;
  const shownAmountText =
    !hasPending && amountOverflow !== null
      ? amountOverflow
      : shownAmount === 0
        ? ''
        : shownAmount.toLocaleString('ko-KR');
  const shownBankCode = hasPending ? pendingTransfer.request.depositBankCode : depositBankCode;
  const shownAccountNumber = hasPending
    ? pendingTransfer.request.depositAccountNumber
    : depositAccountNumber;
  const shownBankName = getVirtualBankByCode(shownBankCode)?.bankName ?? null;
  const bankLabel = shownBankName ?? (shownBankCode === '' ? null : shownBankCode);

  // 한 번 확정된 송금 요청에 대한 멱등성 키 — 자동 재시도 시 동일 키 재사용
  const pendingIdempotencyKeyRef = useRef(null);

  const getCurrentTransferKey = () => {
    pendingIdempotencyKeyRef.current = ensureIdempotencyKey(pendingIdempotencyKeyRef.current);
    return pendingIdempotencyKeyRef.current;
  };

  const clearPendingTransferKey = () => {
    pendingIdempotencyKeyRef.current = null;
  };

  // 확인 시점의 화면 입력(매 렌더 갱신). 확인창을 연 때의 송금 내용과 비교해 달라졌으면 보내지 않는다.
  const currentIntentRef = useRef(null);
  currentIntentRef.current = {
    accountId: selectedAccount?.id ?? null,
    amount,
    depositBankCode,
    depositAccountNumber,
  };

  // 새 송금 금액 검증(선택한 출금 계좌의 서버 잔액 기준). 매 렌더 다시 계산하므로 출금 계좌를 바꾸면 자동 재검증된다.
  // 입력값은 바꾸지 않고 판정만 한다. 0원(빈 입력)은 오류 문구 없이 버튼만 비활성이다.
  const amountIssue = getTransferAmountIssue({ account: selectedAccount, amount });
  let amountError = null;
  if (!hasPending) {
    if (amountOverflow !== null) amountError = AMOUNT_TOO_LARGE_MESSAGE;
    else if (amountIssue === TRANSFER_AMOUNT_ISSUE.EXCEEDS_BALANCE) {
      amountError = EXCEEDS_BALANCE_MESSAGE;
    }
  }

  const isNewTransferActive =
    amount > 0 &&
    amountOverflow === null &&
    amountIssue === null &&
    !isSelectedStale &&
    getVirtualBankByCode(depositBankCode) !== null &&
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
    const digits = text.replace(/[^0-9]/g, '');
    const n = parseInt(digits || '0', 10);
    if (Number.isSafeInteger(n)) {
      setAmountOverflow(null);
      setAmount(n);
    } else {
      // 정밀도를 잃는 값은 0원으로 두어 송금을 막고, 입력한 숫자는 그대로 보여 오류를 알린다.
      setAmountOverflow(digits);
      setAmount(0);
    }
    clearPendingTransferKey();
  };

  const handleQuickAmount = add => {
    if (hasPending) return;
    const next = amount + add;
    if (amountOverflow === null && Number.isSafeInteger(next)) {
      setAmount(next);
    } else {
      // 입력 오류 상태이거나 합이 안전 정수를 넘으면 금액을 만들지 않고 오류 상태로 둔다.
      setAmountOverflow(amountOverflow ?? (BigInt(amount) + BigInt(add)).toString());
      setAmount(0);
    }
    clearPendingTransferKey();
  };

  // 정확한 잔액(balanceExact=true인 안전한 양의 정수)일 때만 전액을 입력한다. 그 외에는 아무것도 하지 않는다.
  const handleMaxAmount = () => {
    if (hasPending || maxAmount == null) return;
    setAmountOverflow(null);
    setAmount(maxAmount);
    clearPendingTransferKey();
  };

  // 출금 계좌 변경: 송금 요청 진행 중이거나 미확정 송금이 있으면 바꾸지 않는다.
  // 미전송 요청의 키만 새로 만들게 비우고, 이미 전송했거나 결과가 불확실한 요청의 키·pendingTransfer는 건드리지 않는다.
  const handleFromAccountPress = () => {
    if (hasPending || transferLoading) return;
    setFromSheetVisible(true);
  };

  const handleFromAccountSelect = id => {
    if (hasPending || transferLoading) return;
    setFromSheetVisible(false);
    if (id === selectedAccount?.id) return;
    if (!canTransferFrom(accounts.find(account => account.id === id))) return;
    setUserPick({
      generation: sessionGeneration,
      id,
      paramKey: transferFromParamKey(hasFromParam, fromParam),
    });
    clearPendingTransferKey();
  };

  const handleBankPress = () => {
    if (hasPending || transferLoading) return;
    setBankModalVisible(true);
  };

  // 요청에는 선택한 은행 코드만 담긴다. 서버 계약에 없는 값(은행명 등)은 보내지 않는다.
  const handleDepositBankSelect = bank => {
    if (hasPending || transferLoading) return;
    setBankModalVisible(false);
    setDepositBankCode(bank.bankCode);
    clearPendingTransferKey();
  };

  const handleDepositAccountChange = text => {
    if (hasPending) return;
    setDepositAccountNumber(sanitizeDigits(text));
    clearPendingTransferKey();
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
        // 확정된 송금 이후에만: 이전 잔액·상세·거래를 무효화하고 서버에서 다시 받는다(재조회 실패가 송금 결과를 바꾸지 않는다).
        dispatch(accountDataInvalidated());
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
    // 확인창을 열 때의 송금 내용. 확인 버튼 시점에 최신 Redux 상태·화면 입력과 다시 대조한다(새 송금 전용).
    const snapshot = {
      userId: store.getState().auth?.user?.userId,
      sessionGeneration: store.getState().asset.sessionGeneration,
      accountId: selectedAccount.id,
      amount,
      depositBankCode,
      depositAccountNumber,
    };
    const blockIfInvalid = () => {
      const reason = validateTransferAtConfirm({
        state: store.getState(),
        snapshot,
        current: currentIntentRef.current,
      });
      if (reason === null) return false;
      Alert.alert(
        '송금할 수 없어요',
        reason === TRANSFER_AMOUNT_ISSUE.EXCEEDS_BALANCE
          ? EXCEEDS_BALANCE_MESSAGE
          : reason === 'STALE_BALANCE'
            ? BALANCE_CHECKING_MESSAGE
            : '송금 정보가 바뀌었거나 확인할 수 없어 송금하지 않았어요. 내용을 다시 확인해 주세요.'
      );
      return true;
    };
    if (blockIfInvalid()) return;
    Alert.alert(
      '확인',
      `${getVirtualBankByCode(depositBankCode).bankName} ${depositAccountNumber} 계좌로 ${formatKRW(amount)}을 송금할까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '확인',
          onPress: () => {
            if (blockIfInvalid()) return;
            submitTransfer({
              withdrawalAccountId: selectedAccount.id,
              depositBankCode,
              depositAccountNumber,
              amount,
              idempotencyKey: getCurrentTransferKey(),
            });
          },
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
                  <Pressable
                    onPress={handleFromAccountPress}
                    disabled={hasPending || transferLoading}
                    accessibilityRole="button"
                    accessibilityLabel="출금 계좌 선택"
                    accessibilityState={{ disabled: hasPending || transferLoading }}
                    style={({ pressed }) => [styles.accountRow, pressed && styles.pressed]}
                  >
                    <Text style={styles.accountBank}>{selectedAccount.label ?? '내 계좌'}</Text>
                    {!(hasPending || transferLoading) && (
                      <Feather name="chevron-down" size={20} color={redesign.textSecondary} />
                    )}
                  </Pressable>
                  <Text style={styles.balance}>
                    현재 잔액{' '}
                    <Text style={styles.balanceValue}>
                      {isSelectedStale && !hasPending
                        ? '-'
                        : formatExactMoney(selectedAccount.balance, selectedAccount.balanceExact)}
                    </Text>
                  </Text>
                  {isSelectedStale && !hasPending ? (
                    <Text style={styles.balance}>{BALANCE_CHECKING_MESSAGE}</Text>
                  ) : null}
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
                  {accountViewKind === 'fromInvalid' && (
                    <Pressable
                      onPress={handleFromAccountPress}
                      disabled={hasPending || transferLoading}
                      accessibilityRole="button"
                      accessibilityLabel="출금 계좌 선택"
                      style={({ pressed }) => [
                        styles.quickBtn,
                        styles.retryBtn,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.quickBtnText}>다른 계좌 선택</Text>
                    </Pressable>
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

            {/* 받는 계좌 (받는 은행 선택 + 계좌번호, 숫자 문자열) */}
            <View style={styles.section}>
              <Text style={styles.question}>누구에게 보낼까요?</Text>
              <Pressable
                onPress={handleBankPress}
                disabled={hasPending || transferLoading}
                accessibilityRole="button"
                accessibilityLabel="받는 은행 선택"
                accessibilityState={{ disabled: hasPending || transferLoading }}
                style={({ pressed }) => [styles.bankSelect, pressed && styles.pressed]}
              >
                <Text
                  style={[
                    styles.bankSelectText,
                    bankLabel === null && styles.bankSelectPlaceholder,
                  ]}
                >
                  {bankLabel ?? BANK_PLACEHOLDER}
                </Text>
                <Feather name="chevron-down" size={20} color={redesign.textSecondary} />
              </Pressable>
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
                  value={shownAmountText}
                  onChangeText={handleAmountChange}
                  placeholder="0"
                  placeholderTextColor={PLACEHOLDER_COLOR}
                />
                <Text style={styles.amountUnit}>원</Text>
              </View>
              {amountError ? (
                <Text style={styles.amountError} accessibilityLiveRegion="polite">
                  {amountError}
                </Text>
              ) : null}
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

        <AccountSelectorBottomSheet
          visible={fromSheetVisible}
          title="출금 계좌 선택"
          accounts={accounts}
          selectedAccountId={selectedAccount?.id ?? null}
          isSelectable={canTransferFrom}
          onSelect={handleFromAccountSelect}
          onClose={() => setFromSheetVisible(false)}
        />

        <BankSelectModal
          visible={bankModalVisible}
          title="받는 은행 선택"
          selectedBankCode={shownBankCode === '' ? null : shownBankCode}
          onSelect={handleDepositBankSelect}
          onClose={() => setBankModalVisible(false)}
        />

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
  bankSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    marginTop: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: redesign.divider,
  },
  bankSelectText: {
    flex: 1,
    fontSize: 16,
    color: redesign.textPrimary,
  },
  bankSelectPlaceholder: {
    color: PLACEHOLDER_COLOR,
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
  amountError: {
    marginTop: 8,
    fontSize: 13,
    color: colors.red,
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

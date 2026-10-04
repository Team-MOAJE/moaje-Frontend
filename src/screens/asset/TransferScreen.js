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

const QUICK_AMOUNTS = [10000, 50000, 100000];

const PLACEHOLDER_COLOR = '#C4C4BF';

export default function TransferScreen({ navigation, route }) {
  const dispatch = useDispatch();
  const accounts = useSelector(state => state.asset.accounts);
  const accountsLoading = useSelector(state => state.asset.accountsLoading);
  const transferLoading = useSelector(state => state.asset.transferLoading);
  const defaultAccount = selectDefaultAccount(accounts);
  // AccountDetail의 "송금하기"에서 fromAccountId가 전달되면 해당 계좌를 우선 사용하고,
  // 없으면(기존 진입 경로 전부) 기존처럼 기본 계좌를 사용한다.
  const fromAccount = accounts.find(a => a.id === route?.params?.fromAccountId);
  const selectedAccount = fromAccount ?? defaultAccount;

  const [amount, setAmount] = useState(0);
  const [recipient, setRecipient] = useState('');
  const [memo, setMemo] = useState('');

  // 한 번 확정된 송금 요청에 대한 멱등성 키 — 자동 재시도 시 동일 키 재사용
  const pendingIdempotencyKeyRef = useRef(null);

  const getCurrentTransferKey = () => {
    pendingIdempotencyKeyRef.current = ensureIdempotencyKey(pendingIdempotencyKeyRef.current);
    return pendingIdempotencyKeyRef.current;
  };

  const clearPendingTransferKey = () => {
    pendingIdempotencyKeyRef.current = null;
  };

  const isActive =
    amount > 0 && recipient.length > 0 && !accountsLoading && !transferLoading && !!selectedAccount;

  useEffect(() => {
    dispatch(fetchAccounts());
  }, [dispatch]);

  const handleAmountChange = text => {
    const n = parseInt(text.replace(/[^0-9]/g, '') || '0', 10);
    setAmount(n);
    clearPendingTransferKey();
  };

  const handleQuickAmount = add => {
    setAmount(prev => prev + add);
    clearPendingTransferKey();
  };

  const handleMaxAmount = () => {
    setAmount(selectedAccount?.balance ?? 0);
    clearPendingTransferKey();
  };

  const handleRecipientChange = text => {
    setRecipient(text);
    clearPendingTransferKey();
  };

  const handleMemoChange = text => {
    setMemo(text);
    clearPendingTransferKey();
  };

  const handleTransferPress = () => {
    if (!isActive || transferLoading) return;
    Alert.alert('확인', `${recipient}님에게 ${formatKRW(amount)}을 송금할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '확인',
        onPress: async () => {
          const result = await dispatch(
            transferFunds({
              fromAccountId: selectedAccount?.id,
              toRecipient: recipient,
              amount,
              memo,
              idempotencyKey: getCurrentTransferKey(),
            })
          );
          if (transferFunds.fulfilled.match(result)) {
            clearPendingTransferKey();
            Alert.alert('완료', '송금이 완료됐어요.');
            dispatch(fetchAccounts());
            navigation.goBack();
          } else {
            // 실패 시 키를 유지 — 사용자가 폼을 수정하지 않고 재시도하면 동일 키 재사용
            Alert.alert('송금 실패', result.payload?.message ?? '송금에 실패했습니다.');
          }
        },
      },
    ]);
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

            {/* 출금 계좌 */}
            <View style={styles.account}>
              <Text style={styles.accountLabel}>출금 계좌</Text>
              <View style={styles.accountRow}>
                <Text style={styles.accountBank}>
                  {selectedAccount?.bankName ?? '계좌 정보를 불러오는 중...'}
                </Text>
              </View>
              <Text style={styles.balance}>
                현재 잔액{' '}
                <Text style={styles.balanceValue}>{formatKRW(selectedAccount?.balance ?? 0)}</Text>
              </Text>
            </View>

            {/* 받는 사람 */}
            <View style={styles.section}>
              <Text style={styles.question}>누구에게 보낼까요?</Text>
              <TextInput
                style={styles.lineInput}
                placeholder="이름 또는 등록된 계좌 토큰"
                placeholderTextColor={PLACEHOLDER_COLOR}
                value={recipient}
                onChangeText={handleRecipientChange}
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
                  value={amount === 0 ? '' : amount.toLocaleString('ko-KR')}
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
                    style={({ pressed }) => [styles.quickBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.quickBtnText}>+{add / 10000}만</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={handleMaxAmount}
                  style={({ pressed }) => [styles.quickBtn, pressed && styles.pressed]}
                >
                  <Text style={[styles.quickBtnText, styles.quickBtnMaxText]}>전액</Text>
                </Pressable>
              </View>
            </View>

            {/* 메모 */}
            <View style={styles.section}>
              <Text style={styles.question}>메모</Text>
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
                보내기
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

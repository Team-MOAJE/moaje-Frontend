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
import { colors, radius, shadows, spacing } from '../../theme';
import { ROUTES } from '../../constants/routes';
import BottomNavBar from '../../components/home/BottomNavBar';
import { formatKRW } from '../../utils/formatMoney';
import { fetchAccounts, transferFunds } from '../../features/asset/assetApi';
import { selectDefaultAccount } from '../../utils/selectDefaultAccount';
import { ensureIdempotencyKey } from '../../utils/idempotencyKey';

const RECENT = ['이서연', '박지호', '스터디회비', '교재공구'];
const QUICK_AMOUNTS = [10000, 50000, 100000];

export default function TransferScreen({ navigation }) {
  const dispatch = useDispatch();
  const accounts = useSelector(state => state.asset.accounts);
  const accountsLoading = useSelector(state => state.asset.accountsLoading);
  const transferLoading = useSelector(state => state.asset.transferLoading);
  const defaultAccount = selectDefaultAccount(accounts);

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
    amount > 0 && recipient.length > 0 && !accountsLoading && !transferLoading && !!defaultAccount;

  useEffect(() => {
    dispatch(fetchAccounts());
  }, [dispatch]);

  const handleBackPress = () => {
    if (navigation.canGoBack()) navigation.goBack();
  };

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
    setAmount(defaultAccount?.balance ?? 0);
    clearPendingTransferKey();
  };

  const handleRecipientChange = text => {
    setRecipient(text);
    clearPendingTransferKey();
  };

  const handleRecipientSelect = name => {
    setRecipient(name);
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
              fromAccountId: defaultAccount?.id,
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
  const handleBottomChartPress = () => navigation.navigate(ROUTES.DAILY_LIMIT);
  const handleBottomCategoryPress = () => navigation.navigate(ROUTES.CATEGORY);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <Pressable
              onPress={handleBackPress}
              style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            >
              <Feather name="arrow-left" size={20} color={colors.textDark} />
            </Pressable>
            <Text style={styles.headerTitle}>송금하기</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* 출금 계좌 카드 */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>출금 계좌</Text>
              <View style={styles.accountRow}>
                <View style={styles.accountLeft}>
                  <View style={styles.accountIconBg}>
                    <Text style={styles.accountIconText}>₩</Text>
                  </View>
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountBank}>
                      {defaultAccount?.bankName ?? '계좌 정보를 불러오는 중...'}
                    </Text>
                    <Text style={styles.accountToken}>{defaultAccount?.tokenId ?? '-'}</Text>
                  </View>
                </View>
                <View style={styles.balanceWrap}>
                  <Text style={styles.balanceLabel}>출금 가능</Text>
                  <Text style={styles.balanceAmount}>
                    {formatKRW(defaultAccount?.balance ?? 0)}
                  </Text>
                </View>
              </View>
              <View style={styles.noticeBanner}>
                <Feather name="lock" size={11} color={colors.textMid} />
                <Text style={styles.noticeText}>실제 계좌번호는 표시하지 않아요</Text>
              </View>
            </View>

            {/* 받는 사람 카드 */}
            <View style={[styles.card, styles.cardTop]}>
              <Text style={styles.cardLabel}>받는 사람</Text>
              <View style={styles.inputWrap}>
                <Feather name="user" size={16} color={colors.textLight} />
                <TextInput
                  style={styles.textInput}
                  placeholder="이름 또는 등록된 계좌 토큰"
                  placeholderTextColor={colors.textLight}
                  value={recipient}
                  onChangeText={handleRecipientChange}
                  returnKeyType="done"
                />
              </View>
              <View style={styles.chipRow}>
                {RECENT.map(name => (
                  <Pressable
                    key={name}
                    onPress={() => handleRecipientSelect(name)}
                    style={({ pressed }) => [
                      styles.chip,
                      recipient === name && styles.chipActive,
                      pressed && styles.chipPressed,
                    ]}
                  >
                    <Text style={[styles.chipText, recipient === name && styles.chipTextActive]}>
                      {name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* 보낼 금액 카드 */}
            <View style={[styles.card, styles.cardTop]}>
              <Text style={styles.cardLabel}>보낼 금액</Text>
              <View style={styles.amountRow}>
                <TextInput
                  style={styles.amountInput}
                  keyboardType="number-pad"
                  value={amount === 0 ? '' : amount.toLocaleString('ko-KR')}
                  onChangeText={handleAmountChange}
                  placeholder="0"
                  placeholderTextColor="rgba(52,66,37,0.3)"
                />
                <Text style={styles.amountUnit}>원</Text>
              </View>
              <View style={styles.quickRow}>
                {QUICK_AMOUNTS.map(add => (
                  <Pressable
                    key={add}
                    onPress={() => handleQuickAmount(add)}
                    style={({ pressed }) => [styles.quickBtn, pressed && styles.quickBtnPressed]}
                  >
                    <Text style={styles.quickBtnText}>+{add / 10000}만</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={handleMaxAmount}
                  style={({ pressed }) => [
                    styles.quickBtn,
                    styles.quickBtnMax,
                    pressed && styles.quickBtnPressed,
                  ]}
                >
                  <Text style={[styles.quickBtnText, styles.quickBtnMaxText]}>전액</Text>
                </Pressable>
              </View>
            </View>

            {/* 메모 카드 */}
            <View style={[styles.card, styles.cardTop]}>
              <Text style={styles.cardLabel}>메모</Text>
              <View style={styles.inputWrap}>
                <Feather name="message-square" size={16} color={colors.textLight} />
                <TextInput
                  style={styles.textInput}
                  placeholder="예: 점심값, 교재비, 스터디 회비"
                  placeholderTextColor={colors.textLight}
                  value={memo}
                  onChangeText={handleMemoChange}
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* 하단 송금 버튼 */}
            <Pressable
              onPress={handleTransferPress}
              disabled={!isActive}
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
                {isActive ? '안전하게 송금하기' : '금액을 입력해주세요'}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>

        <BottomNavBar
          onHomePress={handleBottomHomePress}
          onTransferPress={handleBottomTransferPress}
          onChartPress={handleBottomChartPress}
          onGridPress={handleBottomCategoryPress}
          activeKey="transfer"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bgMain,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  backButtonPressed: {
    backgroundColor: colors.bgOuter,
    opacity: 0.8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textDark,
  },
  headerSpacer: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: 110,
  },
  card: {
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.sm,
  },
  cardTop: {
    marginTop: spacing.md,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMid,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  accountIconBg: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.olive,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  accountIconText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.white,
  },
  accountInfo: {
    flex: 1,
    gap: 2,
  },
  accountBank: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textDark,
  },
  accountToken: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textLight,
  },
  balanceWrap: {
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textLight,
  },
  balanceAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textDark,
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.bgLight,
    borderRadius: radius.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  noticeText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMid,
    flex: 1,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgLight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.textDark,
    paddingVertical: 0,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    backgroundColor: colors.bgMain,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipActive: {
    backgroundColor: colors.olive,
    borderColor: colors.olive,
  },
  chipPressed: {
    opacity: 0.75,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMid,
  },
  chipTextActive: {
    color: colors.white,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  amountInput: {
    flex: 1,
    fontSize: 36,
    fontWeight: '800',
    color: colors.textDark,
    paddingVertical: 0,
  },
  amountUnit: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textDark,
    paddingBottom: 4,
  },
  quickRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  quickBtn: {
    flex: 1,
    backgroundColor: colors.bgMain,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBtnPressed: {
    opacity: 0.7,
  },
  quickBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textDark,
  },
  quickBtnMax: {
    backgroundColor: colors.textDark,
    borderColor: colors.textDark,
  },
  quickBtnMaxText: {
    color: colors.white,
  },
  submitButton: {
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  submitButtonActive: {
    backgroundColor: colors.oliveDark,
  },
  submitButtonInactive: {
    backgroundColor: colors.bgOuter,
  },
  submitButtonPressed: {
    opacity: 0.85,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '800',
  },
  submitTextActive: {
    color: colors.white,
  },
  submitTextInactive: {
    color: colors.textLight,
  },
});

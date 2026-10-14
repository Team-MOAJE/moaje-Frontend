import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import { redesign } from '../../theme';
import { ROUTES } from '../../constants/routes';
import { submitDailyLimit } from '../../features/asset/assetApi';
import {
  buildDailyLimitFormulaItems,
  dailyLimitInputToText,
  formatCashflowAmount,
  parseDailyLimitInput,
  resolveDailyLimitErrorMessage,
  sanitizeWonText,
  toDisplayWon,
} from '../../features/asset/cashflowScreenLogic';
import DailyLimitHeroCard from '../../components/dailylimit/DailyLimitHeroCard';
import DailyLimitFormulaCard from '../../components/dailylimit/DailyLimitFormulaCard';
import BottomNavBar from '../../components/home/BottomNavBar';

const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

const PLACEHOLDER_COLOR = '#C4C4BF';

// ── 메인 화면 ──────────────────────────────────────────────────
// 서버(API-15)가 계산한 값만 표시한다. 계산 입력(남은 일수 등)은 사용자가 직접 넣고, 앱에서 값을 만들어 채우지 않는다.
// 서버가 주지 않는 오늘 쓴 돈·상태(안정/주의/초과)는 표시하지 않는다.
export default function DailyLimitScreen({ navigation }) {
  const dispatch = useDispatch();
  const { result, input, loading, error, errorStatus } = useSelector(
    state => state.asset.cashflowDaily
  );

  const [form, setForm] = useState(() => dailyLimitInputToText(input));
  const [inputError, setInputError] = useState(null);

  const today = useMemo(() => new Date(), []);
  const dateLabel = `${today.getMonth() + 1}월 ${today.getDate()}일 ${WEEKDAY_NAMES[today.getDay()]}`;

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(ROUTES.HOME);
    }
  };

  const handleBottomHomePress = () => navigation.navigate(ROUTES.HOME);
  const handleBottomTransferPress = () => navigation.navigate(ROUTES.TRANSFER);
  const handleBottomCategoryPress = () => navigation.navigate(ROUTES.CATEGORY);
  // TODO: 오늘 거래만 필터링하려면 TransactionHistory가 기간 params를 받아야 한다(현재는 전체 내역).
  const handleViewTodaySpendingPress = () => navigation.navigate(ROUTES.TRANSACTION_HISTORY);
  const handleViewMonthlyPress = () => navigation.navigate(ROUTES.ANALYSIS);

  const handleChange = key => text => {
    setForm(prev => ({ ...prev, [key]: sanitizeWonText(text) }));
    setInputError(null);
  };

  const handleCalculatePress = () => {
    if (loading) return;
    const parsed = parseDailyLimitInput(form);
    if (!parsed.ok) {
      setInputError(parsed.message);
      return;
    }
    setInputError(null);
    dispatch(submitDailyLimit(parsed.input));
  };

  const amount = result ? toDisplayWon(result.dailyLimit) : null;
  const formulaItems = buildDailyLimitFormulaItems(result);
  const errorMessage = error
    ? resolveDailyLimitErrorMessage({ message: error, status: errorStatus })
    : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="뒤로가기"
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Feather name="chevron-left" size={24} color={redesign.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>오늘의 가용금액</Text>
          <Text style={styles.headerDate}>{dateLabel}</Text>
        </View>

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
            {result && amount !== null && (
              <>
                <DailyLimitHeroCard amount={amount} daysLeft={result.daysUntilNextPayday} />
                {amount < 0 && (
                  <Text style={styles.note}>
                    지출 예정액이 잔액과 예상 수입보다 커서 서버 계산 결과가 마이너스예요.
                  </Text>
                )}

                <View style={styles.formula}>
                  <DailyLimitFormulaCard
                    title={`${formatCashflowAmount(result.dailyLimit)}은 이렇게 계산했어요`}
                    items={formulaItems}
                  />
                  <Text style={styles.note}>원 미만은 표시하지 않아요.</Text>
                </View>
              </>
            )}

            <View style={styles.inputSection}>
              <Text style={styles.question}>계산에 쓸 값을 알려주세요</Text>
              <Text style={styles.label}>다음 수입일까지 남은 일수 (필수)</Text>
              <TextInput
                style={styles.lineInput}
                keyboardType="number-pad"
                placeholder="예: 14"
                placeholderTextColor={PLACEHOLDER_COLOR}
                editable={!loading}
                value={form.days}
                onChangeText={handleChange('days')}
                maxLength={4}
              />
              <Text style={styles.label}>예상 수입 (선택, 원)</Text>
              <TextInput
                style={styles.lineInput}
                keyboardType="number-pad"
                placeholder="비워 두면 0원으로 계산돼요"
                placeholderTextColor={PLACEHOLDER_COLOR}
                editable={!loading}
                value={form.expectedIncome}
                onChangeText={handleChange('expectedIncome')}
                maxLength={12}
              />
              <Text style={styles.label}>고정 지출 (선택, 원)</Text>
              <TextInput
                style={styles.lineInput}
                keyboardType="number-pad"
                placeholder="비워 두면 0원으로 계산돼요"
                placeholderTextColor={PLACEHOLDER_COLOR}
                editable={!loading}
                value={form.fixedExpenses}
                onChangeText={handleChange('fixedExpenses')}
                maxLength={12}
              />
              <Text style={styles.label}>예비비 (선택, 원)</Text>
              <TextInput
                style={styles.lineInput}
                keyboardType="number-pad"
                placeholder="비워 두면 0원으로 계산돼요"
                placeholderTextColor={PLACEHOLDER_COLOR}
                editable={!loading}
                value={form.eventBuffer}
                onChangeText={handleChange('eventBuffer')}
                maxLength={12}
              />

              {inputError ? <Text style={styles.errorText}>{inputError}</Text> : null}
              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

              <Pressable
                onPress={handleCalculatePress}
                disabled={loading}
                accessibilityRole="button"
                accessibilityState={{ disabled: loading }}
                style={({ pressed }) => [
                  styles.submitButton,
                  loading ? styles.submitButtonInactive : styles.submitButtonActive,
                  !loading && pressed && styles.submitButtonPressed,
                ]}
              >
                <Text
                  style={[
                    styles.submitText,
                    loading ? styles.submitTextInactive : styles.submitTextActive,
                  ]}
                >
                  {loading ? '계산 중이에요' : result ? '다시 계산하기' : '계산하기'}
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={handleViewTodaySpendingPress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="오늘 쓴 돈 보기"
              style={({ pressed }) => [styles.link, pressed && styles.pressed]}
            >
              <Text style={styles.linkText}>오늘 쓴 돈 보기</Text>
              <Text style={styles.linkChevron}>›</Text>
            </Pressable>

            <Pressable
              onPress={handleViewMonthlyPress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="월별 분석 보기"
              style={({ pressed }) => [styles.link, pressed && styles.pressed]}
            >
              <Text style={styles.linkText}>월별 분석 보기</Text>
              <Text style={styles.linkChevron}>›</Text>
            </Pressable>

            <View style={styles.bottomPad} />
          </ScrollView>
        </KeyboardAvoidingView>

        <BottomNavBar
          onHomePress={handleBottomHomePress}
          onTransferPress={handleBottomTransferPress}
          onCategoryPress={handleBottomCategoryPress}
          activeKey="home"
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: {
    marginLeft: -8,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: redesign.textPrimary,
    marginLeft: 4,
  },
  headerDate: {
    fontSize: 13,
    color: redesign.textSecondary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: redesign.pagePaddingX,
    paddingTop: 28,
    paddingBottom: 110,
  },
  formula: {
    marginTop: 44,
  },
  note: {
    fontSize: 12,
    color: redesign.textSecondary,
    marginTop: 10,
  },
  inputSection: {
    marginTop: 44,
  },
  question: {
    fontSize: 18,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  label: {
    fontSize: 12,
    color: redesign.textSecondary,
    marginTop: 20,
  },
  lineInput: {
    fontSize: 16,
    color: redesign.textPrimary,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: redesign.divider,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    color: redesign.textPrimary,
    marginTop: 16,
  },
  submitButton: {
    marginTop: 28,
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
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 32,
    paddingVertical: 4,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
    color: redesign.accent,
  },
  linkChevron: {
    fontSize: 18,
    color: redesign.accent,
    marginLeft: 6,
  },
  pressed: {
    opacity: 0.6,
  },
  bottomPad: {
    height: 8,
  },
});

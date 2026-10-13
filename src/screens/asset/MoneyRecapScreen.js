import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { View, StyleSheet, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import MoneyRecapEntry from '../../components/moneyRecap/MoneyRecapEntry';
import MoneyRecapMonthSelector from '../../components/moneyRecap/MoneyRecapMonthSelector';
import MoneyRecapStories from '../../components/moneyRecap/MoneyRecapStories';
import WorkOnboardingStatePanel, {
  LoadingPanel,
  PanelButton,
} from '../../components/onboarding/WorkOnboardingStatePanel';
import { ROUTES } from '../../constants/routes';
import { redesign } from '../../theme/redesign';
import { isValidOnboardingUserId } from '../../features/onboarding/onboardingApi';
import { fetchRecap, fetchRecapMonths } from '../../features/moneyRecap/recapApi';
import {
  RECAP_EMPTY_REASON,
  RECAP_SESSION_STATUS,
  buildRecapEntryViewModel,
  createRecapSession,
  describeRecapEmpty,
  describeRecapError,
  formatYearMonthLabel,
} from '../../features/moneyRecap/recapScreenLogic';

const S = RECAP_SESSION_STATUS;
const RETRY_LABEL = '다시 불러오기';

export default function MoneyRecapScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const rawUserId = useSelector(state => state.auth.user?.userId);
  const userId = isValidOnboardingUserId(rawUserId) ? rawUserId : null;

  // 월 목록·월별 Recap 상태와 메모리 캐시는 이 화면 세션에서만 유지하고 화면을 떠나면 폐기한다.
  const [session] = useState(() =>
    createRecapSession({ fetchMonths: fetchRecapMonths, fetchRecap })
  );
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);

  // 화면 이탈: 진행 중 요청 무효화 + 캐시 폐기.
  useEffect(() => () => session.dispose(), [session]);

  // 사용자 설정과 API-37(월 목록). API-38은 여기서 호출하지 않는다.
  useEffect(() => {
    session.setUser(userId);
    if (userId) session.loadMonths();
  }, [session, userId]);

  const isOwnSnapshot = snapshot.userId === userId;
  const recapStatus = isOwnSnapshot ? snapshot.recapStatus : S.IDLE;
  const hasActiveRecap = recapStatus === S.LOADING || recapStatus === S.READY;

  const exitToPreviousScreen = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(ROUTES.CATEGORY);
    }
  }, [navigation]);

  useEffect(() => {
    const onHardwareBack = () => {
      if (hasActiveRecap) {
        session.closeRecap();
      } else {
        exitToPreviousScreen();
      }
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [hasActiveRecap, session, exitToPreviousScreen]);

  const monthItems = useMemo(
    () =>
      snapshot.months.map(value => ({
        value,
        label: formatYearMonthLabel(value) ?? value,
      })),
    [snapshot.months]
  );

  const renderPanel = panel => (
    <View style={[styles.panelRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {panel}
    </View>
  );

  if (!userId) {
    return renderPanel(
      <WorkOnboardingStatePanel
        title="사용자 정보를 확인할 수 없어요"
        message="다시 로그인한 뒤 확인해주세요."
      />
    );
  }

  if (!isOwnSnapshot || snapshot.monthsStatus === S.IDLE || snapshot.monthsStatus === S.LOADING) {
    return renderPanel(<LoadingPanel message="머니 리캡을 불러오는 중이에요" />);
  }

  if (snapshot.monthsStatus === S.ERROR) {
    return renderPanel(
      <WorkOnboardingStatePanel
        tone="error"
        title="머니 리캡을 불러오지 못했어요"
        message={describeRecapError(snapshot.monthsErrorType)}
      >
        {snapshot.monthsRetryable ? (
          <PanelButton label={RETRY_LABEL} onPress={() => session.loadMonths()} />
        ) : null}
      </WorkOnboardingStatePanel>
    );
  }

  if (snapshot.monthsStatus === S.EMPTY) {
    const empty = describeRecapEmpty(RECAP_EMPTY_REASON.NO_MONTHS);
    return renderPanel(<WorkOnboardingStatePanel title={empty.title} message={empty.message} />);
  }

  if (recapStatus === S.READY) {
    return (
      <View style={styles.root}>
        <MoneyRecapStories
          key={snapshot.recapMonth}
          data={snapshot.storiesData}
          onClose={() => session.closeRecap()}
        />
      </View>
    );
  }

  let notice = null;
  if (recapStatus === S.EMPTY) {
    notice = describeRecapEmpty(snapshot.recapEmptyReason);
  } else if (recapStatus === S.ERROR) {
    notice = { message: describeRecapError(snapshot.recapErrorType) };
  }
  const recapRetryable = recapStatus === S.ERROR && snapshot.recapRetryable;
  const baseVm = buildRecapEntryViewModel(snapshot.selectedMonth);
  const vm = recapRetryable ? { ...baseVm, ctaLabel: RETRY_LABEL } : baseVm;

  return (
    <View style={styles.root}>
      <MoneyRecapEntry
        vm={vm}
        // API-38은 시작 버튼에서만 호출한다. 월 선택은 선택 상태만 바꾼다.
        onStart={() => session.openRecap()}
        monthSelector={
          <MoneyRecapMonthSelector
            items={monthItems}
            selectedValue={snapshot.selectedMonth}
            disabled={recapStatus === S.LOADING}
            onSelect={month => session.selectMonth(month)}
          />
        }
        notice={notice}
        ctaLoading={recapStatus === S.LOADING}
        ctaDisabled={recapStatus === S.ERROR && !snapshot.recapRetryable}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  panelRoot: { flex: 1, backgroundColor: redesign.bg },
});

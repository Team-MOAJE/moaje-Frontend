import { View, Text, Pressable, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';
import { ALERTS_LIMIT_NOTICE, FDS_LABELS, FDS_STATUS } from '../../../features/work/fdsScreenLogic';
import { InlineEmpty, InlineError, InlineLoading } from '../spending/SpendingInlineState';
import FdsAlertRow from './FdsAlertRow';

const FILTER_OPTIONS = [
  { value: false, label: '전체' },
  { value: true, label: '확인 전만' },
];

// API-26 알림 목록 + 미확인만 보기. props만 받는다(요청은 상위 세션이 담당).
// 서버가 준 집계(total/unread)만 표시하고 직접 세지 않는다.
export default function FdsAlertsSection({
  status,
  items,
  unread,
  total,
  unreadOnly,
  isTruncated,
  onChangeUnreadOnly,
  onConfirm,
  onRefresh,
  errorMessage,
  canRetry,
  onRetry,
}) {
  const renderBody = () => {
    if (status === FDS_STATUS.ERROR) {
      return (
        <InlineError
          title="알림을 불러오지 못했어요"
          message={errorMessage}
          canRetry={canRetry}
          onRetry={onRetry}
        />
      );
    }
    if (status !== FDS_STATUS.READY) {
      return <InlineLoading message="알림을 불러오는 중이에요" />;
    }
    if (items.length === 0) {
      return (
        <InlineEmpty
          title={unreadOnly ? FDS_LABELS.alertsEmptyUnread : FDS_LABELS.alertsEmptyAll}
        />
      );
    }
    return (
      <View>
        {items.map(item => (
          <FdsAlertRow key={item.key} item={item} onConfirm={() => onConfirm(item.alertId)} />
        ))}
        {isTruncated ? <Text style={styles.notice}>{ALERTS_LIMIT_NOTICE}</Text> : null}
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>알림</Text>
          {status === FDS_STATUS.READY ? (
            <Text style={styles.count}>
              전체 {total}건 · 확인 전 {unread}건
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={onRefresh}
          hitSlop={8}
          accessibilityRole="button"
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.refresh}>새로고침</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        {FILTER_OPTIONS.map(option => {
          const selected = option.value === unreadOnly;
          return (
            <Pressable
              key={option.label}
              onPress={() => onChangeUnreadOnly(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {renderBody()}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
  count: {
    fontSize: 12,
    color: redesign.textSecondary,
  },
  refresh: {
    fontSize: 13,
    fontWeight: '700',
    color: redesign.accent,
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: redesign.surfaceSoft,
  },
  chipSelected: {
    backgroundColor: redesign.accent,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: redesign.textPrimary,
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  notice: {
    marginTop: 10,
    fontSize: 12,
    color: redesign.textSecondary,
  },
  pressed: {
    opacity: 0.6,
  },
});

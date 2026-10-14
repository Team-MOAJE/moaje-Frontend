import { View, Text, StyleSheet } from 'react-native';
import { redesign } from '../../../theme/redesign';
import {
  FDS_LABELS,
  FDS_STATUS,
  LOGS_LIMIT_NOTICE,
  LOGS_NOTICE,
} from '../../../features/work/fdsScreenLogic';
import { InlineEmpty, InlineError, InlineLoading } from '../spending/SpendingInlineState';
import FdsLogRow from './FdsLogRow';

// API-25 점검 기록(읽기 전용). props만 받는다(요청은 상위 세션이 담당).
export default function FdsLogsSection({
  status,
  items,
  isTruncated,
  errorMessage,
  canRetry,
  onRetry,
}) {
  const renderBody = () => {
    if (status === FDS_STATUS.ERROR) {
      return (
        <InlineError
          title="점검 기록을 불러오지 못했어요"
          message={errorMessage}
          canRetry={canRetry}
          onRetry={onRetry}
        />
      );
    }
    if (status !== FDS_STATUS.READY) {
      return <InlineLoading message="점검 기록을 불러오는 중이에요" />;
    }
    if (items.length === 0) {
      return <InlineEmpty title={FDS_LABELS.logsEmpty} />;
    }
    return (
      <View>
        {items.map(item => (
          <FdsLogRow key={item.key} item={item} />
        ))}
        {isTruncated ? <Text style={styles.notice}>{LOGS_LIMIT_NOTICE}</Text> : null}
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>점검 기록</Text>
      <Text style={styles.description}>{LOGS_NOTICE}</Text>
      {renderBody()}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: redesign.textPrimary,
  },
  description: {
    fontSize: 12,
    lineHeight: 18,
    color: redesign.textSecondary,
  },
  notice: {
    marginTop: 10,
    fontSize: 12,
    color: redesign.textSecondary,
  },
});

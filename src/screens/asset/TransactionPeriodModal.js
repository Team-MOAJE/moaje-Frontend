import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { colors, radius, shadows, spacing } from '../../theme';
import { formatDateDot } from '../../utils/formatDate';

export const PERIOD_OPTIONS = [
  '전체',
  '최근 1개월',
  '최근 3개월',
  '최근 6개월',
  '최근 1년',
  '직접 설정',
];

const PRESET_MONTHS = {
  '최근 1개월': 1,
  '최근 3개월': 3,
  '최근 6개월': 6,
  '최근 1년': 12,
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function dateKeyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 3/31의 "최근 1개월" 시작일이 2월로 clamp되지 않고 3월로 롤오버되는 것을 방지
function subtractMonthsClamped(date, n) {
  const targetFirst = new Date(date.getFullYear(), date.getMonth() - n, 1);
  const lastDayOfTargetMonth = new Date(
    targetFirst.getFullYear(),
    targetFirst.getMonth() + 1,
    0
  ).getDate();
  const clampedDay = Math.min(date.getDate(), lastDayOfTargetMonth);
  return new Date(
    targetFirst.getFullYear(),
    targetFirst.getMonth(),
    clampedDay,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds()
  );
}

export function computePeriodRange(periodType, customStartKey, customEndKey) {
  if (periodType === '직접 설정') {
    return { startKey: customStartKey ?? null, endKey: customEndKey ?? null };
  }
  const months = PRESET_MONTHS[periodType];
  if (!months) {
    return { startKey: null, endKey: null }; // '전체'
  }
  const today = new Date();
  return {
    startKey: toDateKey(subtractMonthsClamped(today, months)),
    endKey: toDateKey(today),
  };
}

export function getPeriodLabel(periodType, customStartKey, customEndKey) {
  if (periodType === '직접 설정' && customStartKey && customEndKey) {
    return `${formatDateDot(customStartKey)} ~ ${formatDateDot(customEndKey)}`;
  }
  return periodType;
}

function PeriodOptionRow({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.optionRow, pressed && styles.optionRowPressed]}
    >
      <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{label}</Text>
      {active && <Feather name="check" size={18} color={colors.olive} />}
    </Pressable>
  );
}

export default function TransactionPeriodModal({
  visible,
  periodType,
  customStartKey,
  customEndKey,
  onApply,
  onClose,
}) {
  const [customMode, setCustomMode] = useState(false);
  const [draftStartKey, setDraftStartKey] = useState(customStartKey);
  const [draftEndKey, setDraftEndKey] = useState(customEndKey);
  const [errorText, setErrorText] = useState('');
  const [activeDateField, setActiveDateField] = useState(null);

  useEffect(() => {
    if (visible) {
      setCustomMode(periodType === '직접 설정');
      setDraftStartKey(customStartKey ?? toDateKey(subtractMonthsClamped(new Date(), 1)));
      setDraftEndKey(customEndKey ?? toDateKey(new Date()));
      setErrorText('');
      setActiveDateField(null);
    }
  }, [visible, periodType, customStartKey, customEndKey]);

  const handleApplyCustom = () => {
    if (draftStartKey > draftEndKey) {
      setErrorText('시작일은 종료일보다 늦을 수 없어요.');
      return;
    }
    onApply('직접 설정', draftStartKey, draftEndKey);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, shadows.xl]}>
          <Text style={styles.title}>조회 기간</Text>

          {!customMode ? (
            <View style={styles.optionList}>
              {PERIOD_OPTIONS.map(option => (
                <PeriodOptionRow
                  key={option}
                  label={option}
                  active={periodType === option}
                  onPress={() => {
                    if (option === '직접 설정') {
                      setCustomMode(true);
                      return;
                    }
                    onApply(option, null, null);
                    onClose();
                  }}
                />
              ))}
            </View>
          ) : (
            <View style={styles.customArea}>
              <Pressable
                onPress={() => setActiveDateField('start')}
                style={({ pressed }) => [
                  styles.dateFieldRow,
                  pressed && styles.dateFieldRowPressed,
                ]}
              >
                <Text style={styles.dateRowLabel}>시작일</Text>
                <View style={styles.dateFieldValueWrap}>
                  <Text style={styles.dateFieldValue}>{formatDateDot(draftStartKey)}</Text>
                  <Feather name="chevron-right" size={16} color={colors.textMid} />
                </View>
              </Pressable>

              <Pressable
                onPress={() => setActiveDateField('end')}
                style={({ pressed }) => [
                  styles.dateFieldRow,
                  pressed && styles.dateFieldRowPressed,
                ]}
              >
                <Text style={styles.dateRowLabel}>종료일</Text>
                <View style={styles.dateFieldValueWrap}>
                  <Text style={styles.dateFieldValue}>{formatDateDot(draftEndKey)}</Text>
                  <Feather name="chevron-right" size={16} color={colors.textMid} />
                </View>
              </Pressable>

              {activeDateField && (
                <DateTimePicker
                  value={dateKeyToDate(activeDateField === 'start' ? draftStartKey : draftEndKey)}
                  mode="date"
                  presentation="dialog"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  locale="ko_KR"
                  themeVariant={Platform.OS === 'ios' ? 'light' : undefined}
                  accentColor={colors.olive}
                  positiveButton={{ label: '완료' }}
                  negativeButton={{ label: '취소' }}
                  onValueChange={(_, date) => {
                    const key = toDateKey(date);
                    if (activeDateField === 'start') {
                      setDraftStartKey(key);
                    } else {
                      setDraftEndKey(key);
                    }
                    setErrorText('');
                    if (Platform.OS !== 'ios') {
                      // Android: 다이얼로그 "완료" 시에만 오는 콜백이므로 여기서 닫는 게 맞음
                      setActiveDateField(null);
                    }
                    // iOS: 연/월 조작·월 이동·날짜 재선택 모두 이 콜백으로 오지만, draft 값만
                    // 갱신하고 "적용"을 누르기 전까지는 캘린더를 열어둔다.
                  }}
                  onDismiss={() => setActiveDateField(null)}
                />
              )}

              {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}

              <View style={styles.modalBtnRow}>
                <Pressable
                  onPress={onClose}
                  style={({ pressed }) => [styles.modalBtnCancel, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.modalBtnCancelText}>취소</Text>
                </Pressable>
                <Pressable
                  onPress={handleApplyCustom}
                  style={({ pressed }) => [styles.modalBtnConfirm, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.modalBtnConfirmText}>적용</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  sheet: {
    width: '100%',
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    padding: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
    marginBottom: spacing.md,
  },
  optionList: {
    gap: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  optionRowPressed: {
    backgroundColor: colors.bgMain,
  },
  optionLabel: {
    fontSize: 14,
    color: colors.textDark,
  },
  optionLabelActive: {
    fontWeight: '700',
    color: colors.olive,
  },
  customArea: {
    gap: spacing.md,
  },
  dateFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.sm,
    backgroundColor: colors.bgMain,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  dateFieldRowPressed: {
    backgroundColor: colors.bgOuter,
  },
  dateFieldValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  dateFieldValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
  },
  dateRowLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMid,
  },
  errorText: {
    fontSize: 12,
    color: colors.red,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.sm,
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.bgMain,
    alignItems: 'center',
  },
  modalBtnCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
  },
  modalBtnConfirm: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.olive,
    alignItems: 'center',
  },
  modalBtnConfirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.cream,
  },
});

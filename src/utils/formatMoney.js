export const formatKRW = (amount, showSign = false) => {
  if (amount === null || amount === undefined) return '-';
  const formatted = Math.abs(amount).toLocaleString('ko-KR');
  if (showSign && amount > 0) return `+${formatted}원`;
  if (amount < 0) return `-${formatted}원`;
  return `${formatted}원`;
};

export const formatKRWShort = (amount) => {
  if (amount === null || amount === undefined) return '-';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(1)}억원`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(1)}만원`;
  return `${sign}${abs.toLocaleString('ko-KR')}원`;
};

export const formatDateKR = isoString => {
  if (!isoString) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(isoString));
};

export const formatDateTime = isoString => {
  if (!isoString) return '-';
  const d = new Date(isoString);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// 'YYYY-MM-DD' 키 또는 Date를 'YYYY.MM.DD'로 표시한다.
export const formatDateDot = dateKeyOrDate => {
  if (!dateKeyOrDate) return '-';
  const d = dateKeyOrDate instanceof Date ? dateKeyOrDate : new Date(`${dateKeyOrDate}T00:00:00`);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
};

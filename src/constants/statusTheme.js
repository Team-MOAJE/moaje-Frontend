import { colors as themeColors, spacing, radius as themeRadius } from '../theme';

// ── 상태 화면 전용 디자인 토큰 ────────────────────────────────────
// 배경·텍스트·카드: 기존 Moaje theme 재사용
// 올리브 forest 계열·chip 색상: design-reference 기준값 사용
export const colors = {
  // 기존 theme 재사용
  bg: themeColors.bgMain,
  bgSoft: themeColors.bgLight,
  card: themeColors.white,
  cardSoft: '#FAFBEF',
  ink: themeColors.textDark,
  muted: themeColors.textLight,
  hairline: themeColors.border,
  white: themeColors.white,

  // 올리브/숲 계열 (design-reference 기준)
  forest: '#3D5A2A',
  forestDark: '#2C4220',
  olive: '#A8C46A',
  oliveDeep: '#7FA84A',
  oliveLight: '#D4E5A8',
  oliveSoft: '#EAF2D0',

  // 상태 칩 전용 (기존 theme에 없음)
  coral: '#F2A57A',
  coralSoft: '#FCE6D6',
  sand: '#F4D88A',
  sandSoft: '#FBF1CF',
  peach: '#F9C9A0',
  peachSoft: '#FDE9D4',
};

// 기존 spacing 그대로 재사용 (xs:4 sm:8 md:12 lg:16 xl:20 xxl:24 xxxl:32)
export { spacing };

// 기존 radius 재사용 + xxl만 32로 override (design-reference 기준)
export const radius = {
  ...themeRadius,
  xxl: 32,
  full: 999,
};

// 상태 화면 전용 shadow
export const shadow = {
  card: {
    shadowColor: '#3C5028',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 4,
  },
  cardHeavy: {
    shadowColor: '#3C5028',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 6,
  },
};

// 상태 칩 테마
export const chipTheme = {
  RETRY: {
    label: '재시도 가능',
    bg: colors.coralSoft,
    text: '#C0552A',
    dot: colors.coral,
  },
  RETRY_LATER: {
    label: '잠시 후 다시 시도',
    bg: colors.sandSoft,
    text: '#A07820',
    dot: colors.sand,
  },
  RE_LOGIN: {
    label: '재로그인 필요',
    bg: colors.oliveSoft,
    text: colors.forest,
    dot: colors.oliveDeep,
  },
  MFA_AUTH: {
    label: '추가 인증 필요',
    bg: colors.peachSoft,
    text: '#9A4820',
    dot: colors.peach,
  },
  CONTACT_SUPPORT: {
    label: '문의 필요',
    bg: colors.cardSoft,
    text: colors.muted,
    dot: colors.olive,
  },
};

// 아이콘박스 테마
export const iconBoxTheme = {
  RETRY: { bg: colors.coralSoft, color: '#C0552A' },
  RETRY_LATER: { bg: colors.sandSoft, color: '#A07820' },
  RE_LOGIN: { bg: colors.oliveSoft, color: colors.forest },
  MFA_AUTH: { bg: colors.peachSoft, color: '#9A4820' },
  CONTACT_SUPPORT: { bg: colors.peachSoft, color: colors.forest },
  PLANT: { bg: colors.oliveSoft, color: colors.oliveDeep },
  DATA: { bg: colors.oliveSoft, color: colors.forest },
};

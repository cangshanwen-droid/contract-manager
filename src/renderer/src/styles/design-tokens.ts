// ═══════════════════════════════════════════════════════════════
// Gipfel 统一设计系统 - Design Tokens
// ═══════════════════════════════════════════════════════════════
// 金融金主题：深海蓝黑背景 + 暖金 accent
// 统一导出 colors / radii / space / fontSize / fontFamily
// 所有核心页面引用此 tokens，确保一致性
// ═══════════════════════════════════════════════════════════════

export const colors = {
  primary: '#D4AF37',
  bg: '#061A33',
  surface: '#0F2748',
  elevated: '#1A1F2E',
  border: 'rgba(212,175,55,0.12)',
  textPrimary: '#F5F7FA',
  textSecondary: '#8A9BB5',
  textMuted: 'rgba(138,155,181,0.5)',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  positive: '#22C55E',
  negative: '#EF4444',
  neutral: '#8A9BB5',
} as const

export const radii = {
  sm: 3,
  md: 4,
  lg: 6,
  xl: 8,
  xxl: 10,
} as const

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  xhuge: 48,
} as const

export const fontSize = {
  caption: 11,
  body: 13,
  bodyLarge: 14,
  subtitle: 15,
  title: 18,
  h3: 20,
  h2: 24,
  h1: 28,
  display: 36,
} as const

export const fontFamily = {
  sans: "'Microsoft YaHei','PingFang SC','Segoe UI',system-ui,sans-serif",
  mono: "'JetBrains Mono','SF Mono',monospace",
} as const

// ═══════════════════════════════════════════════════════════════
// Convenience aliases for page-level token objects
// ═══════════════════════════════════════════════════════════════

export const tokens = {
  // Background stack
  bgRoot: colors.bg,
  bgPanel: colors.surface,
  bgCard: colors.elevated,
  bgElevated: colors.elevated,
  // Borders
  border: colors.border,
  borderHover: colors.primary,
  // Accent
  accent: colors.primary,
  accentDim: 'rgba(212,175,55,0.12)',
  primary: colors.primary,
  // Text
  textPrimary: colors.textPrimary,
  textSecondary: colors.textSecondary,
  textMuted: colors.textMuted,
  // Semantic
  success: colors.success,
  warning: colors.warning,
  error: colors.error,
  positive: colors.positive,
  negative: colors.negative,
  neutral: colors.neutral,
  // Legacy aliases for easy migration
  green: colors.success,
  red: colors.error,
  blue: colors.primary,
  warmGold: colors.primary,
  silver: colors.textPrimary,
  silverSec: colors.textSecondary,
  silverMut: colors.textMuted,
  // Page-level shorthand aliases (migrated from inline const T={})
  panel: colors.surface,
  card: colors.elevated,
  warmDim: 'rgba(212,175,55,0.08)',
  silver2: colors.textSecondary,
  silver3: '#64748B',
  // Stock chart K-line colors
  klineUp: '#F24957',
  klineDown: '#2CB67D',
  klineMA5: '#FFC107',
  klineMA10: '#0EA5E9',
  klineVolume: 'rgba(255,255,255,0.08)',
} as const

export default tokens

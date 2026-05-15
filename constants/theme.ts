import { Platform } from 'react-native';

export const Colors = {
  primary: '#1E2D4D',
  primaryDark: '#162240',
  primaryLight: '#2D4A7A',
  secondary: '#B5860D',
  secondaryLight: '#E0C48F',
  background: '#F4F6FB',
  card: '#FFFFFF',
  text: '#1E293B',
  textMuted: '#6B7280',
  textLight: '#9CA3AF',
  border: '#E2E8F0',
  success: '#16A34A',
  error: '#DC2626',
  warning: '#D97706',
  info: '#2563EB',
  pending: '#D97706',
  upcoming: '#2563EB',
  completed: '#16A34A',
  cancelled: '#DC2626',
  available: '#16A34A',
  busy: '#D97706',
  offline: '#6B7280',
  light: {
    text: '#1A1A2E',
    background: '#F5F7FA',
    tint: '#1B3A6B',
    icon: '#6B7280',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: '#1B3A6B',
  },
  dark: {
    text: '#F9FAFB',
    background: '#0F172A',
    tint: '#C9A96E',
    icon: '#9CA3AF',
    tabIconDefault: '#6B7280',
    tabIconSelected: '#C9A96E',
  },
};

export const RoleColors = {
  client: {
    shell: '#1E2D4D',
    shellDark: '#162240',
    accent: '#B5860D',
    accentSoft: '#FEF3C7',
    background: '#F4F6FB',
  },
  lawyer: {
    shell: '#1E2D4D',
    shellDark: '#162240',
    accent: '#B5860D',
    accentSoft: '#FEF3C7',
    background: '#F4F6FB',
  },
  lawFirm: {
    shell: '#1A3D2B',
    shellDark: '#123120',
    accent: '#D9B45A',
    accentSoft: '#ECFDF3',
    background: '#F0F2F5',
  },
  admin: {
    shell: '#1E2D4D',
    shellDark: '#162240',
    accent: '#B5860D',
    accentSoft: '#FFF5DC',
    background: '#F0F2F5',
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

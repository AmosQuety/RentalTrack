// theme/colors.ts

export const colors = {
  light: {
    background: '#F9FAFB', // Paper background
    card: '#FFFFFF',
    text: '#1F2937',
    textSecondary: '#6B7280',
    primary: '#0F172A', // Professional Navy
    primaryContrast: '#FFFFFF',
    success: '#10B981', // Sage Green (Paid)
    successBackground: '#D1FAE5',
    warning: '#F59E0B', // Amber (Due Soon)
    warningBackground: '#FEF3C7',
    danger: '#EF4444', // Soft Red (Overdue)
    dangerBackground: '#FEE2E2',
    border: '#E5E7EB',
    iconActive: '#0F172A',
    iconInactive: '#9CA3AF',
    tabBarBackground: 'rgba(255, 255, 255, 0.8)',
    inputBackground: '#F3F4F6',
    overlay: 'rgba(0, 0, 0, 0.5)',
  },
  dark: {
    background: '#111827', // Deep Charcoal
    card: '#1F2937', // Slightly lighter for cards
    text: '#F9FAFB',
    textSecondary: '#9CA3AF',
    primary: '#10B981', // Emerald Green looks great on dark
    primaryContrast: '#FFFFFF',
    success: '#10B981',
    successBackground: 'rgba(16, 185, 129, 0.1)',
    warning: '#F59E0B',
    warningBackground: 'rgba(245, 158, 11, 0.1)',
    danger: '#EF4444',
    dangerBackground: 'rgba(239, 68, 68, 0.1)',
    border: '#374151',
    iconActive: '#10B981',
    iconInactive: '#6B7280',
    tabBarBackground: 'rgba(31, 41, 55, 0.8)',
    inputBackground: '#374151',
    overlay: 'rgba(0, 0, 0, 0.7)',
  }
};

export type ThemeColors = typeof colors.light;

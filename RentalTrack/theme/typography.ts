// theme/typography.ts
import { Platform } from 'react-native';

export const typography = {
  fonts: {
    regular: Platform.OS === 'ios' ? 'San Francisco' : 'Inter_400Regular',
    medium: Platform.OS === 'ios' ? 'San Francisco' : 'Inter_500Medium',
    semibold: Platform.OS === 'ios' ? 'San Francisco' : 'Inter_600SemiBold',
    bold: Platform.OS === 'ios' ? 'San Francisco' : 'Inter_700Bold',
  },
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    hero: 32,
  },
  lineHeights: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 28,
    xl: 32,
    xxl: 36,
    hero: 40,
  }
};

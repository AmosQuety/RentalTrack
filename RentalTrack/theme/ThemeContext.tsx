// theme/ThemeContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { ThemeColors, colors } from './colors';
import { typography } from './typography';
import * as NavigationBar from 'expo-navigation-bar';
import { Platform } from 'react-native';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  typography: typeof typography;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'system',
  isDark: false,
  colors: colors.light,
  typography,
  setMode: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('system');

  const isDark = mode === 'system' ? systemColorScheme === 'dark' : mode === 'dark';
  const currentColors = isDark ? colors.dark : colors.light;

  useEffect(() => {
    if (Platform.OS === 'android' && NavigationBar?.setBackgroundColorAsync) {
      // Sync bottom navigation bar with theme
      NavigationBar.setBackgroundColorAsync(currentColors.background).catch(() => {});
      NavigationBar.setButtonStyleAsync(isDark ? 'light' : 'dark').catch(() => {});
    }
  }, [isDark, currentColors]);

  const value = {
    mode,
    isDark,
    colors: currentColors,
    typography,
    setMode,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

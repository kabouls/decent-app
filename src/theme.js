import React, { useState, useEffect } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// per explicit request.
const THEME_DARK = {
  mode: 'dark',
  bg: '#0B0F17',
  surface: '#151D2A',
  border: '#26334D',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  textTertiary: '#7B889C',
  primary: '#8B5CF6',
  accent: '#C084FC',
  accentLight: '#D8B4FE'
};

const THEME_LIGHT = {
  mode: 'light',
  bg: '#F4F2FA',
  surface: '#FFFFFF',
  border: '#E2DFF0',
  text: '#1A1625',
  textSecondary: '#6B6478',
  textTertiary: '#6F6A80',
  primary: '#7C3AED',
  accent: '#7C3AED',
  accentLight: '#9061F9'
};

const THEME_STORAGE_KEY = '@decent_theme_mode';

const ThemeContext = React.createContext({ theme: THEME_DARK, themeMode: 'dark', toggleTheme: () => {} });

const useTheme = () => React.useContext(ThemeContext);

const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeMode] = useState('dark');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark') {
        setThemeMode(saved);
      } else {
        // No explicit preference saved yet (new install / fresh onboarding) -
        // follow the device's system theme until the user picks one
        // themselves via the toggle, at which point their choice persists
        // and takes over from here on.
        const systemScheme = Appearance.getColorScheme();
        if (systemScheme === 'light' || systemScheme === 'dark') setThemeMode(systemScheme);
      }
    });
  }, []);

  const toggleTheme = () => {
    setThemeMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {});
      return next;
    });
  };

  const theme = themeMode === 'dark' ? THEME_DARK : THEME_LIGHT;

  return (
    <ThemeContext.Provider value={{ theme, themeMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export { THEME_DARK, THEME_LIGHT, THEME_STORAGE_KEY, ThemeContext, useTheme, ThemeProvider };

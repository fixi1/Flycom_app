import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { DARK_COLORS, LIGHT_COLORS } from '../styles/colors';
import { StyleSheet } from 'react-native';
import { loadSettings, updateSetting } from '../storage';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    loadSettings().then(s => {
      setIsDark(s.darkMode !== false);
    });
  }, []);

  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

  const toggleTheme = async () => {
    const next = !isDark;
    setIsDark(next);
    await updateSetting('darkMode', next);
  };

  const styles = useMemo(() => StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.darkBg,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: 0.5,
    },
    subtitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    bodyText: {
      fontSize: 14,
      color: colors.text,
      lineHeight: 20,
    },
    caption: {
      fontSize: 12,
      color: colors.gray,
    },
    infoText: {
      fontSize: 14,
      color: colors.gray,
      lineHeight: 20,
    },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: colors.primaryBlue,
    },
    topBarTitle: {
      color: colors.white,
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    topBarSubtitle: {
      color: colors.whiteAlpha50,
      fontSize: 12,
      marginTop: 2,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    cardTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 2,
    },
    cardSubtitle: {
      color: colors.gray,
      fontSize: 13,
      marginTop: 2,
    },
    listItem: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 14,
      marginBottom: 8,
    },
    listItemTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    listItemSub: {
      color: colors.gray,
      fontSize: 13,
      marginTop: 3,
    },
    button: {
      backgroundColor: colors.primaryBlue,
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    buttonText: {
      color: colors.white,
      fontSize: 14,
      fontWeight: '600',
    },
    buttonSmall: {
      backgroundColor: colors.primaryBlue,
      paddingVertical: 7,
      paddingHorizontal: 14,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    buttonTextSmall: {
      color: colors.white,
      fontSize: 13,
      fontWeight: '600',
    },
    buttonDanger: {
      backgroundColor: colors.red,
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    buttonDangerText: {
      color: colors.white,
      fontSize: 14,
      fontWeight: '600',
    },
    input: {
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      color: colors.inputText,
      fontSize: 15,
    },
    sectionHeader: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.gray,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 8,
      marginTop: 16,
      paddingHorizontal: 4,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 6,
    },
    divider: {
      height: 1,
      backgroundColor: colors.surfaceLight,
      marginVertical: 8,
    },
    sosButton: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.red,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
      shadowColor: colors.black,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
    },
    sosButtonText: {
      color: colors.white,
      fontSize: 18,
      fontWeight: '700',
      marginTop: 2,
    },
    fab: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primaryBlue,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
      shadowColor: colors.black,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
    },
    popupMenu: {
      position: 'absolute',
      right: 16,
      top: 56,
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 6,
      minWidth: 200,
      elevation: 8,
      shadowColor: colors.black,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
    },
    popupMenuTitle: {
      color: colors.gray,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    popupMenuOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 6,
    },
    popupMenuOptionText: {
      color: colors.text,
      fontSize: 14,
      marginLeft: 10,
    },
    bottomNav: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      backgroundColor: colors.primaryBlue,
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    navButton: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      paddingHorizontal: 20,
      borderRadius: 8,
    },
    navButtonActive: {
      backgroundColor: colors.primaryBlueLight,
    },
    navButtonText: {
      color: colors.whiteAlpha50,
      fontSize: 11,
      marginTop: 3,
      fontWeight: '500',
    },
    navButtonTextActive: {
      color: colors.white,
      fontSize: 11,
      marginTop: 3,
      fontWeight: '600',
    },
    infoCard: {
      backgroundColor: colors.primaryBlue,
      borderRadius: 10,
      padding: 14,
    },
    infoCardTitle: {
      color: colors.white,
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 8,
    },
    infoCardRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    infoCardLabel: {
      color: colors.whiteAlpha50,
      fontSize: 13,
    },
    infoCardValue: {
      color: colors.white,
      fontSize: 13,
      fontWeight: '500',
    },
    mapSection: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    floatingButtons: {
      position: 'absolute',
      bottom: 80,
      right: 16,
      flexDirection: 'column',
    },
    callDroneButton: {
      backgroundColor: colors.primaryBlue,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 8,
      alignItems: 'center',
      marginBottom: 10,
      elevation: 4,
    },
    callDroneButtonText: {
      color: colors.white,
      fontSize: 13,
      fontWeight: '600',
    },
  }), [colors]);

  const value = useMemo(() => ({
    isDark,
    colors,
    styles,
    toggleTheme,
  }), [isDark, colors, styles]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

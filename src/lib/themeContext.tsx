import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

import { useStore } from './store';
import { buildColors, fonts, type AccentId, type Colors, type Scheme } from './theme';

function makeStyles(c: Colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 120, gap: 18 },
    card: {
      backgroundColor: c.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.hairline,
      boxShadow: c.shadow,
      padding: 14,
    },
    group: {
      backgroundColor: c.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.hairline,
      boxShadow: c.shadow,
      overflow: 'hidden',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowPad: { paddingHorizontal: 14, paddingVertical: 12 },
    separator: { height: 1, backgroundColor: c.separator, marginLeft: 66 },

    h1: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, color: c.text, letterSpacing: -0.3 },
    h2: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: c.text },
    name: { fontFamily: fonts.displayMedium, fontSize: 17, lineHeight: 22, color: c.text },
    title: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, color: c.text },
    body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: c.text },
    muted: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: c.text2 },
    caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: c.text3 },
    sectionLabel: {
      fontFamily: fonts.semibold,
      fontSize: 11,
      lineHeight: 14,
      color: c.text3,
      textTransform: 'uppercase',
      letterSpacing: 0.9,
      paddingHorizontal: 4,
    },
    label: {
      fontFamily: fonts.medium,
      fontSize: 13,
      lineHeight: 18,
      color: c.text2,
      paddingHorizontal: 4,
      marginBottom: 6,
    },

    field: { marginBottom: 14 },
    input: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.hairline,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 50,
      fontSize: 16,
      fontFamily: fonts.body,
      color: c.text,
    },
    inputMultiline: { minHeight: 84, textAlignVertical: 'top' },

    button: {
      backgroundColor: c.accent,
      borderRadius: 14,
      minHeight: 50,
      paddingHorizontal: 18,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    buttonText: { color: c.onAccent, fontSize: 16, lineHeight: 20, fontFamily: fonts.semibold },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      minHeight: 36,
      paddingHorizontal: 13,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.hairline,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    chipSelected: { backgroundColor: c.text, borderColor: c.text },
    chipText: { fontSize: 13, lineHeight: 18, fontFamily: fonts.medium, color: c.text },
    chipTextSelected: { color: c.bg, fontFamily: fonts.semibold },

    fab: {
      position: 'absolute',
      right: 20,
      bottom: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 8px 20px rgba(0, 0, 0, 0.25)',
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.checkbox,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: c.accent, borderColor: c.accent },
    checkboxDone: { backgroundColor: c.success, borderColor: c.success },
    empty: { alignItems: 'center', paddingHorizontal: 28, paddingVertical: 32, gap: 8, marginTop: 24 },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.chip,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

export interface Theme {
  scheme: Scheme;
  accentId: AccentId;
  colors: Colors;
  fonts: typeof fonts;
  s: ReturnType<typeof makeStyles>;
}

const cache = new Map<string, Theme>();

export function getTheme(scheme: Scheme, accentId: AccentId): Theme {
  const key = `${scheme}/${accentId}`;
  let t = cache.get(key);
  if (!t) {
    const colors = buildColors(scheme, accentId);
    t = { scheme, accentId, colors, fonts, s: makeStyles(colors) };
    cache.set(key, t);
  }
  return t;
}

const ThemeContext = createContext<Theme | null>(null);

/** Тема берётся из настроек (система / светлая / тёмная) и акцента для этой темы. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data } = useStore();
  const system = useColorScheme();
  const mode = data.settings.theme;
  const scheme: Scheme = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  const accentId = scheme === 'dark' ? data.settings.accentDark : data.settings.accentLight;
  const theme = useMemo(() => getTheme(scheme, accentId), [scheme, accentId]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** Поддерево в другой теме: предпросмотр оформления рисует настоящие компоненты в выбранных цветах. */
export function ThemeScope({ scheme, accentId, children }: { scheme: Scheme; accentId: AccentId; children: ReactNode }) {
  const theme = useMemo(() => getTheme(scheme, accentId), [scheme, accentId]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('useTheme вне ThemeProvider');
  return t;
}

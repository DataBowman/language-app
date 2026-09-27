import { useColorScheme } from 'react-native';

const palette = {
  light: { background: '#ffffff', surface: '#f2f5f8', text: '#10161c', muted: '#5b6773', primary: '#208AEF', onPrimary: '#ffffff', danger: '#c62828', border: '#d9e0e6' },
  dark: { background: '#0f1318', surface: '#1b2229', text: '#eef2f5', muted: '#9aa7b3', primary: '#4ea3f5', onPrimary: '#0f1318', danger: '#ef6461', border: '#2c353e' },
};

export type Colors = (typeof palette)['light'];

export function useColors(): Colors {
  return palette[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
/** Content column width on wide screens (tablet, desktop browser). */
export const maxContentWidth = 640;

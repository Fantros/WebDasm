import { useState, useCallback } from 'react';

const THEMES_VARS: Record<string, Record<string, string>> = {
  dark: {
    '--ida-bg': '#1E1E1E',
    '--ida-panel': '#252526',
    '--ida-panel-2': '#2D2D2D',
    '--ida-border': '#3F3F46',
    '--ida-text': '#D4D4D4',
    '--ida-text-dim': '#808080',
    '--ida-menu-bg': '#333333',
    '--ida-menu-hover': '#505050',
    '--ida-tab-active': '#1E1E1E',
    '--ida-tab-inactive': '#2D2D2D',
    '--ida-accent': '#007ACC',
    '--ida-accent-hover': '#1A8AD4',
    '--ida-keyword': '#569CD6',
    '--ida-string': '#CE9178',
    '--ida-number': '#B5CEA8',
    '--ida-offset': '#B5CEA8',
    '--ida-comment': '#6A9955',
    '--ida-red': '#F44336',
    '--ida-yellow': '#DCDCAA',
    '--ida-purple': '#C586C0',
    '--ida-success': '#4EC9B0',
    '--ida-warning': '#FFD700',
    '--ida-error': '#F44336',
  },
  silver: {
    '--ida-bg': '#FFFFFF',
    '--ida-panel': '#F3F3F3',
    '--ida-panel-2': '#E5E5E5',
    '--ida-border': '#999999',
    '--ida-text': '#000000',
    '--ida-text-dim': '#555555',
    '--ida-menu-bg': '#E5E5E5',
    '--ida-menu-hover': '#0A246A',
    '--ida-tab-active': '#FFFFFF',
    '--ida-tab-inactive': '#D4D0C8',
    '--ida-accent': '#0A246A',
    '--ida-accent-hover': '#000080',
    '--ida-keyword': '#000080',
    '--ida-string': '#008080',
    '--ida-number': '#FF0000',
    '--ida-offset': '#800080',
    '--ida-comment': '#808080',
    '--ida-red': '#FF0000',
    '--ida-yellow': '#000080',
    '--ida-purple': '#800080',
    '--ida-success': '#008000',
    '--ida-warning': '#808000',
    '--ida-error': '#FF0000',
  },
  cyberpunk: {
    '--ida-bg': '#050505',
    '--ida-panel': '#0D0D0D',
    '--ida-panel-2': '#151515',
    '--ida-border': '#1FDF6F',
    '--ida-text': '#39FF14',
    '--ida-text-dim': '#1F8F30',
    '--ida-menu-bg': '#0D0D0D',
    '--ida-menu-hover': '#1FDF6F',
    '--ida-tab-active': '#050505',
    '--ida-tab-inactive': '#151515',
    '--ida-accent': '#1FDF6F',
    '--ida-accent-hover': '#39FF14',
    '--ida-keyword': '#00FFFF',
    '--ida-string': '#FF007F',
    '--ida-number': '#FFD700',
    '--ida-offset': '#FFD700',
    '--ida-comment': '#7900FF',
    '--ida-red': '#FF0000',
    '--ida-yellow': '#39FF14',
    '--ida-purple': '#00FFFF',
    '--ida-success': '#1FDF6F',
    '--ida-warning': '#FFD700',
    '--ida-error': '#FF0000',
  },
};

export const THEME_CATALOG = [
  { id: 'dark',      name: 'IDA Dark',       desc: 'Modern dark theme',      colors: ['#1E1E1E', '#252526', '#007ACC', '#569CD6'] },
  { id: 'silver',    name: 'Classic Silver',  desc: 'Vintage Win95 style',    colors: ['#FFFFFF', '#F0F0F0', '#3B619C', '#0000FF'] },
  { id: 'cyberpunk', name: 'Cyberpunk Neon',  desc: 'High contrast green',    colors: ['#050505', '#0D0D0D', '#1FDF6F', '#00FFFF'] },
];

export function useTheme() {
  const [activeThemeId, setActiveThemeId] = useState('dark');

  const switchTheme = useCallback((themeId: string) => {
    const vars = THEMES_VARS[themeId];
    if (!vars) return;
    setActiveThemeId(themeId);
    Object.entries(vars).forEach(([key, val]) => {
      document.documentElement.style.setProperty(key, val);
    });
    window.dispatchEvent(new Event('theme-changed'));
  }, []);

  return { activeThemeId, switchTheme, THEME_CATALOG };
}

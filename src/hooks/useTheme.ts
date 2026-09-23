import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { readUiPreference, writeUiPreference } from '../storage/uiPreferences';
import {
  academicDarkTheme,
  academicLightTheme,
  DEFAULT_THEME_ID,
  getThemeById,
  type DiagramTheme,
  type DiagramThemeId,
  type StatusTone,
} from '../theme/themes';

type ThemeCssProperties = CSSProperties & Record<`--${string}`, string | number>;

/** What the user picked; 'system' follows the OS appearance. */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCE_KEY = 'modelador.theme-preference';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const isThemePreference = (value: unknown): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

const readSystemPrefersDark = (): boolean => {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
};

const projectToneKeys = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;
const statusTones: StatusTone[] = ['danger', 'warning', 'success', 'info', 'violet'];

const buildStatusVariables = (theme: DiagramTheme): Record<`--${string}`, string> =>
  Object.fromEntries(
    statusTones.flatMap((tone) => {
      const palette = theme.status[tone];
      return [
        [`--status-${tone}-soft`, palette.soft],
        [`--status-${tone}-soft-strong`, palette.softStrong],
        [`--status-${tone}-border`, palette.border],
        [`--status-${tone}-border-strong`, palette.borderStrong],
        [`--status-${tone}-text`, palette.text],
      ];
    }),
  );

export const buildThemeVariables = (theme: DiagramTheme): ThemeCssProperties => ({
  colorScheme: theme.appearance,
  '--app-font-family': theme.typography.fontFamily,
  '--diagram-font-family': theme.typography.fontFamily,
  '--ui-font-family': theme.typography.fontFamily,
  '--app-code-font': theme.typography.codeFontFamily,
  '--canvas-background': theme.canvas.background,
  '--canvas-grid-color': theme.canvas.gridColor,
  '--canvas-grid-color-strong': theme.canvas.gridColorStrong,
  '--class-background': theme.classNode.background,
  '--class-border': theme.classNode.border,
  '--class-border-selected': theme.classNode.borderSelected,
  '--class-text': theme.classNode.text,
  '--class-muted-text': theme.classNode.mutedText,
  '--class-header-text': theme.classNode.headerText,
  '--class-divider': theme.classNode.divider,
  '--class-shadow': theme.classNode.shadow,
  '--class-radius': theme.classNode.borderRadius,
  '--class-border-width': theme.classNode.borderWidth,
  '--class-name-size': theme.typography.classNameSize,
  '--attribute-size': theme.typography.attributeSize,
  '--class-name-weight': theme.typography.fontWeightClassName,
  '--normal-weight': theme.typography.fontWeightNormal,
  '--note-background': theme.parametricNote.background,
  '--note-border': theme.parametricNote.border,
  '--note-text': theme.parametricNote.text,
  '--note-connection-line': theme.parametricNote.connectionLine,
  '--note-connection-dash': theme.parametricNote.connectionDash,
  '--note-radius': theme.parametricNote.borderRadius,
  '--note-size': theme.typography.noteSize,
  '--association-stroke': theme.association.stroke,
  '--association-stroke-selected': theme.association.strokeSelected,
  '--association-stroke-width': theme.association.strokeWidth,
  '--multiplicity-text': theme.association.multiplicityText,
  '--multiplicity-size': theme.typography.multiplicitySize,
  '--marker-stroke': theme.association.markerStroke,
  '--marker-fill': theme.association.markerFill,
  '--handle-background': theme.handles.background,
  '--handle-border': theme.handles.border,
  '--handle-size': `${theme.handles.size}px`,
  '--accent': theme.ui.accent,
  '--accent-strong': theme.ui.accentStrong,
  '--accent-soft': theme.ui.accentSoft,
  '--accent-soft-strong': theme.ui.accentSoftStrong,
  '--accent-outline': theme.ui.accentOutline,
  '--warning-text': theme.ui.warningText,
  '--panel-background': theme.ui.panelBackground,
  '--panel-subtle-background': theme.ui.panelSubtleBackground,
  '--panel-muted-background': theme.ui.panelMutedBackground,
  '--panel-strong-background': theme.ui.panelStrongBackground,
  '--panel-border': theme.ui.panelBorder,
  '--panel-text': theme.ui.panelText,
  '--panel-muted-text': theme.ui.panelMutedText,
  '--toolbar-background': theme.ui.toolbarBackground,
  '--button-background': theme.ui.buttonBackground,
  '--button-border': theme.ui.buttonBorder,
  '--button-text': theme.ui.buttonText,
  '--button-active-background': theme.ui.buttonActiveBackground,
  '--button-active-text': theme.ui.buttonActiveText,
  '--input-background': theme.ui.inputBackground,
  '--input-text': theme.ui.inputText,
  '--input-border': theme.ui.inputBorder,
  '--panel-border-strong': theme.ui.panelBorderStrong,
  '--panel-secondary-text': theme.ui.panelSecondaryText,
  '--panel-faint-text': theme.ui.panelFaintText,
  '--panel-placeholder-text': theme.ui.panelPlaceholderText,
  '--accent-border': theme.ui.accentBorder,
  '--accent-strong-fill': theme.ui.accentStrongFill,
  '--ui-app-background': theme.ui.appBackground,
  '--ui-sidebar-background': theme.ui.sidebarBackground,
  '--ui-hover-background': theme.ui.hoverBackground,
  '--ui-selected-background': theme.ui.selectedBackground,
  '--ui-selected-text': theme.ui.selectedText,
  '--ui-danger': theme.ui.danger,
  '--ui-feedback-background': theme.ui.feedbackBackground,
  ...Object.fromEntries(projectToneKeys.map((key, index) => [`--project-tone-${key}`, theme.ui.projectTones[index]])),
  ...buildStatusVariables(theme),
});

/**
 * Applies the light variables to a subtree so an export ignores dark mode.
 * Color transitions are suspended first, otherwise the capture would read
 * colors halfway between both palettes.
 */
export const applyExportThemeVariables = (element: HTMLElement): (() => void) => {
  const previous = element.getAttribute('style');
  element.classList.add('export-theme-override');
  void element.offsetWidth;
  Object.entries(buildThemeVariables(academicLightTheme)).forEach(([name, value]) => {
    if (name.startsWith('--')) element.style.setProperty(name, String(value));
  });
  element.style.colorScheme = 'light';
  return () => {
    if (previous === null) element.removeAttribute('style');
    else element.setAttribute('style', previous);
    void element.offsetWidth;
    element.classList.remove('export-theme-override');
  };
};

export const useTheme = () => {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    const stored = readUiPreference(THEME_PREFERENCE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState(readSystemPrefersDark);

  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia(DARK_QUERY);
    } catch {
      return undefined;
    }
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  const isDark = preference === 'dark' || (preference === 'system' && systemPrefersDark);
  const themeId: DiagramThemeId = isDark ? academicDarkTheme.id : DEFAULT_THEME_ID;
  const theme = getThemeById(themeId);
  const themeStyle = useMemo(() => buildThemeVariables(theme), [theme]);

  // The page behind the shell (overscroll, native scrollbars) follows too.
  useEffect(() => {
    const root = document.documentElement;
    root.style.colorScheme = theme.appearance;
    root.style.backgroundColor = theme.ui.appBackground;
    root.dataset.appearance = theme.appearance;
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writeUiPreference(THEME_PREFERENCE_KEY, next);
  }, []);

  const setThemeId = useCallback(
    (nextThemeId: DiagramThemeId) => setPreference(getThemeById(nextThemeId).appearance),
    [setPreference],
  );

  return { preference, setPreference, setThemeId, theme, themeId, themeStyle };
};

export { DEFAULT_THEME_ID };

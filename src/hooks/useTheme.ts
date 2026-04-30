import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { DEFAULT_THEME_ID, getThemeById, type DiagramTheme, type DiagramThemeId } from '../theme/themes';

const THEME_STORAGE_KEY = 'class-diagram-ui-theme';

type ThemeCssProperties = CSSProperties & Record<`--${string}`, string | number>;

const buildThemeVariables = (theme: DiagramTheme): ThemeCssProperties => ({
  '--app-font-family': theme.typography.fontFamily,
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
  '--panel-background': theme.ui.panelBackground,
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
});

export const useTheme = () => {
  const [themeId, setThemeId] = useState<DiagramThemeId>(() => {
    const storedThemeId = localStorage.getItem(THEME_STORAGE_KEY);
    return getThemeById(storedThemeId).id as DiagramThemeId;
  });
  const theme = getThemeById(themeId);
  const themeStyle = useMemo(() => buildThemeVariables(theme), [theme]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
  }, [themeId]);

  return { setThemeId, theme, themeId, themeStyle };
};

export { DEFAULT_THEME_ID, THEME_STORAGE_KEY };

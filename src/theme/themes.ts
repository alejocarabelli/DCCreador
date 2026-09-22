export type DiagramTheme = {
  id: string;
  name: string;
  description: string;
  canvas: {
    background: string;
    gridColor: string;
    gridColorStrong: string;
  };
  classNode: {
    background: string;
    border: string;
    borderSelected: string;
    text: string;
    mutedText: string;
    headerText: string;
    divider: string;
    shadow: string;
    borderRadius: string;
    borderWidth: string;
  };
  parametricNote: {
    background: string;
    border: string;
    text: string;
    connectionLine: string;
    connectionDash: string;
    borderRadius: string;
  };
  association: {
    stroke: string;
    strokeSelected: string;
    strokeWidth: number;
    multiplicityText: string;
    markerStroke: string;
    markerFill: string;
  };
  handles: {
    background: string;
    border: string;
    size: number;
  };
  typography: {
    fontFamily: string;
    codeFontFamily: string;
    classNameSize: string;
    attributeSize: string;
    multiplicitySize: string;
    noteSize: string;
    fontWeightClassName: number;
    fontWeightNormal: number;
  };
  ui: {
    accent: string;
    /** Accent ramp: pressed state, two tints for hover/active chrome, and a hairline. */
    accentStrong: string;
    accentSoft: string;
    accentSoftStrong: string;
    accentOutline: string;
    warningText: string;
    panelBackground: string;
    /** Three named fills for surfaces that sit on the panel, lightest first. */
    panelSubtleBackground: string;
    panelMutedBackground: string;
    panelStrongBackground: string;
    panelBorder: string;
    panelText: string;
    panelMutedText: string;
    toolbarBackground: string;
    buttonBackground: string;
    buttonBorder: string;
    buttonText: string;
    buttonActiveBackground: string;
    buttonActiveText: string;
    inputBackground: string;
    inputText: string;
    inputBorder: string;
  };
};

/** The product ships one deliberate visual language. */
export type DiagramThemeId = 'academic-light';

export const academicLightTheme: DiagramTheme = {
  id: 'academic-light',
  name: 'Academic Light',
  description: 'Tema claro, moderno y cómodo para estudiar',
  canvas: { background: '#F7F8FA', gridColor: '#E3E7EE', gridColorStrong: '#B8C3D2' },
  classNode: {
    background: '#FFFFFF',
    border: '#AEB7C4',
    borderSelected: '#3B6EA8',
    text: '#1F2933',
    mutedText: '#52606D',
    headerText: '#102A43',
    divider: '#D9E2EC',
    shadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
    borderRadius: '10px',
    borderWidth: '1px',
  },
  parametricNote: {
    background: '#FFFDF5',
    border: '#D9C98F',
    text: '#2F2A1D',
    connectionLine: '#8A7A45',
    connectionDash: '4 4',
    borderRadius: '8px',
  },
  association: {
    stroke: '#334E68',
    strokeSelected: '#1D4ED8',
    strokeWidth: 1.6,
    multiplicityText: '#102A43',
    markerStroke: '#334E68',
    markerFill: 'none',
  },
  handles: { background: '#FFFFFF', border: '#3B6EA8', size: 8 },
  typography: {
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    codeFontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    classNameSize: '14px',
    attributeSize: '13px',
    multiplicitySize: '12px',
    noteSize: '13px',
    fontWeightClassName: 650,
    fontWeightNormal: 400,
  },
  ui: {
    accent: '#2F648F',
    accentStrong: '#274F73',
    accentSoft: '#EEF3F8',
    accentSoftStrong: '#E8F0F7',
    accentOutline: '#B8CBDC',
    warningText: '#9A5B11',
    panelBackground: '#FFFFFF',
    panelSubtleBackground: '#F8FAFB',
    panelMutedBackground: '#F1F4F7',
    panelStrongBackground: '#E3E8ED',
    panelBorder: '#DCE2E8',
    panelText: '#1F2933',
    panelMutedText: '#52606D',
    toolbarBackground: '#FFFFFF',
    buttonBackground: '#F3F5F7',
    buttonBorder: '#CFD7DF',
    buttonText: '#26313B',
    buttonActiveBackground: '#315F8C',
    buttonActiveText: '#FFFFFF',
    inputBackground: '#FFFFFF',
    inputText: '#1F2933',
    inputBorder: '#CFD7DF',
  },
};

export const themes = [academicLightTheme] as const;

export const DEFAULT_THEME_ID: DiagramThemeId = 'academic-light';

export const getThemeById = (themeId: string | null): DiagramTheme => {
  void themeId;
  return academicLightTheme;
};

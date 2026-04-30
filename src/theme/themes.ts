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
    classNameSize: string;
    attributeSize: string;
    multiplicitySize: string;
    noteSize: string;
    fontWeightClassName: number;
    fontWeightNormal: number;
  };
  ui: {
    panelBackground: string;
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

export type DiagramThemeId =
  | 'legacy'
  | 'academic-light'
  | 'dark-studio'
  | 'minimal-paper'
  | 'blueprint';

export const legacyTheme: DiagramTheme = {
  id: 'legacy',
  name: 'Legacy',
  description: 'Estilo similar a los diagramas de la cátedra',
  canvas: { background: '#FFFFFF', gridColor: '#F2F2F2', gridColorStrong: '#E6E6E6' },
  classNode: {
    background: '#F4E7CC',
    border: '#A9A9A9',
    borderSelected: '#4A4A4A',
    text: '#111111',
    mutedText: '#333333',
    headerText: '#000000',
    divider: '#A9A9A9',
    shadow: 'none',
    borderRadius: '0px',
    borderWidth: '1px',
  },
  parametricNote: {
    background: '#FAF7F0',
    border: '#A9A9A9',
    text: '#111111',
    connectionLine: '#555555',
    connectionDash: '4 4',
    borderRadius: '0px',
  },
  association: {
    stroke: '#222222',
    strokeSelected: '#000000',
    strokeWidth: 1.4,
    multiplicityText: '#111111',
    markerStroke: '#222222',
    markerFill: 'none',
  },
  handles: { background: '#FFFFFF', border: '#222222', size: 8 },
  typography: {
    fontFamily: '"Arial", "Calibri", sans-serif',
    classNameSize: '14px',
    attributeSize: '13px',
    multiplicitySize: '13px',
    noteSize: '13px',
    fontWeightClassName: 600,
    fontWeightNormal: 400,
  },
  ui: {
    panelBackground: '#F8F5EF',
    panelBorder: '#D8CDBB',
    panelText: '#111111',
    panelMutedText: '#5F5549',
    toolbarBackground: '#F8F5EF',
    buttonBackground: '#EFE6D5',
    buttonBorder: '#B8AA92',
    buttonText: '#111111',
    buttonActiveBackground: '#6B5B45',
    buttonActiveText: '#FFFFFF',
    inputBackground: '#FFFFFF',
    inputText: '#111111',
    inputBorder: '#B8AA92',
  },
};

export const academicLightTheme: DiagramTheme = {
  id: 'academic-light',
  name: 'Academic Light',
  description: 'Tema claro, moderno y cómodo para estudiar',
  canvas: { background: '#F7F8FA', gridColor: '#E3E7EE', gridColorStrong: '#CBD3DF' },
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
    fontFamily: '"Inter", "Segoe UI", Arial, sans-serif',
    classNameSize: '14px',
    attributeSize: '13px',
    multiplicitySize: '12px',
    noteSize: '13px',
    fontWeightClassName: 650,
    fontWeightNormal: 400,
  },
  ui: {
    panelBackground: '#FFFFFF',
    panelBorder: '#E1E7EF',
    panelText: '#1F2933',
    panelMutedText: '#52606D',
    toolbarBackground: '#FFFFFF',
    buttonBackground: '#F2F5F9',
    buttonBorder: '#CBD3DF',
    buttonText: '#1F2933',
    buttonActiveBackground: '#3B6EA8',
    buttonActiveText: '#FFFFFF',
    inputBackground: '#FFFFFF',
    inputText: '#1F2933',
    inputBorder: '#CBD3DF',
  },
};

export const darkStudioTheme: DiagramTheme = {
  id: 'dark-studio',
  name: 'Dark Studio',
  description: 'Tema oscuro para trabajar con baja luz',
  canvas: { background: '#0F172A', gridColor: '#1E293B', gridColorStrong: '#334155' },
  classNode: {
    background: '#111827',
    border: '#475569',
    borderSelected: '#38BDF8',
    text: '#E5E7EB',
    mutedText: '#CBD5E1',
    headerText: '#F8FAFC',
    divider: '#334155',
    shadow: '0 8px 18px rgba(0, 0, 0, 0.35)',
    borderRadius: '10px',
    borderWidth: '1px',
  },
  parametricNote: {
    background: '#1E293B',
    border: '#64748B',
    text: '#E5E7EB',
    connectionLine: '#94A3B8',
    connectionDash: '4 4',
    borderRadius: '8px',
  },
  association: {
    stroke: '#CBD5E1',
    strokeSelected: '#38BDF8',
    strokeWidth: 1.7,
    multiplicityText: '#F8FAFC',
    markerStroke: '#CBD5E1',
    markerFill: 'none',
  },
  handles: { background: '#0F172A', border: '#38BDF8', size: 8 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Arial, sans-serif',
    classNameSize: '14px',
    attributeSize: '13px',
    multiplicitySize: '12px',
    noteSize: '13px',
    fontWeightClassName: 650,
    fontWeightNormal: 400,
  },
  ui: {
    panelBackground: '#151C2B',
    panelBorder: '#334155',
    panelText: '#F8FAFC',
    panelMutedText: '#CBD5E1',
    toolbarBackground: '#151C2B',
    buttonBackground: '#253247',
    buttonBorder: '#52627A',
    buttonText: '#F8FAFC',
    buttonActiveBackground: '#0EA5E9',
    buttonActiveText: '#03111C',
    inputBackground: '#0F172A',
    inputText: '#F8FAFC',
    inputBorder: '#52627A',
  },
};

export const minimalPaperTheme: DiagramTheme = {
  id: 'minimal-paper',
  name: 'Minimal Paper',
  description: 'Tema limpio, blanco y gris, ideal para exportar',
  canvas: { background: '#FFFFFF', gridColor: '#F0F0F0', gridColorStrong: '#E0E0E0' },
  classNode: {
    background: '#FFFFFF',
    border: '#222222',
    borderSelected: '#000000',
    text: '#111111',
    mutedText: '#444444',
    headerText: '#000000',
    divider: '#222222',
    shadow: 'none',
    borderRadius: '2px',
    borderWidth: '1px',
  },
  parametricNote: {
    background: '#FFFFFF',
    border: '#333333',
    text: '#111111',
    connectionLine: '#555555',
    connectionDash: '3 3',
    borderRadius: '2px',
  },
  association: {
    stroke: '#111111',
    strokeSelected: '#000000',
    strokeWidth: 1.3,
    multiplicityText: '#000000',
    markerStroke: '#111111',
    markerFill: 'none',
  },
  handles: { background: '#FFFFFF', border: '#111111', size: 7 },
  typography: {
    fontFamily: '"Arial", "Helvetica", sans-serif',
    classNameSize: '14px',
    attributeSize: '12px',
    multiplicitySize: '12px',
    noteSize: '12px',
    fontWeightClassName: 600,
    fontWeightNormal: 400,
  },
  ui: {
    panelBackground: '#FAFAFA',
    panelBorder: '#DDDDDD',
    panelText: '#111111',
    panelMutedText: '#555555',
    toolbarBackground: '#FAFAFA',
    buttonBackground: '#FFFFFF',
    buttonBorder: '#CCCCCC',
    buttonText: '#111111',
    buttonActiveBackground: '#111111',
    buttonActiveText: '#FFFFFF',
    inputBackground: '#FFFFFF',
    inputText: '#111111',
    inputBorder: '#CCCCCC',
  },
};

export const blueprintTheme: DiagramTheme = {
  id: 'blueprint',
  name: 'Blueprint',
  description: 'Estilo técnico inspirado en planos de ingeniería',
  canvas: { background: '#0B1F33', gridColor: '#143A5A', gridColorStrong: '#1F5A85' },
  classNode: {
    background: '#102A43',
    border: '#7DD3FC',
    borderSelected: '#E0F2FE',
    text: '#E0F2FE',
    mutedText: '#BAE6FD',
    headerText: '#FFFFFF',
    divider: '#7DD3FC',
    shadow: '0 0 0 1px rgba(125, 211, 252, 0.12)',
    borderRadius: '4px',
    borderWidth: '1px',
  },
  parametricNote: {
    background: '#123552',
    border: '#7DD3FC',
    text: '#E0F2FE',
    connectionLine: '#BAE6FD',
    connectionDash: '5 5',
    borderRadius: '4px',
  },
  association: {
    stroke: '#BAE6FD',
    strokeSelected: '#FFFFFF',
    strokeWidth: 1.5,
    multiplicityText: '#E0F2FE',
    markerStroke: '#BAE6FD',
    markerFill: 'none',
  },
  handles: { background: '#0B1F33', border: '#E0F2FE', size: 8 },
  typography: {
    fontFamily: '"IBM Plex Mono", "Menlo", "Consolas", monospace',
    classNameSize: '13px',
    attributeSize: '12px',
    multiplicitySize: '12px',
    noteSize: '12px',
    fontWeightClassName: 600,
    fontWeightNormal: 400,
  },
  ui: {
    panelBackground: '#102A43',
    panelBorder: '#2B79AE',
    panelText: '#E0F2FE',
    panelMutedText: '#BAE6FD',
    toolbarBackground: '#102A43',
    buttonBackground: '#164B73',
    buttonBorder: '#3B8FC2',
    buttonText: '#F0FAFF',
    buttonActiveBackground: '#7DD3FC',
    buttonActiveText: '#082033',
    inputBackground: '#0B1F33',
    inputText: '#F0FAFF',
    inputBorder: '#3B8FC2',
  },
};

export const themes = [
  legacyTheme,
  academicLightTheme,
  darkStudioTheme,
  minimalPaperTheme,
  blueprintTheme,
] as const;

export const DEFAULT_THEME_ID: DiagramThemeId = 'academic-light';

export const getThemeById = (themeId: string | null): DiagramTheme =>
  themes.find((theme) => theme.id === themeId) ?? academicLightTheme;

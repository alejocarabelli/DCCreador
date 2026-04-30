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
  canvas: { background: '#FFFFFF', gridColor: '#F0F0F0', gridColorStrong: '#DADADA' },
  classNode: {
    background: '#F7E7C8',
    border: '#9F9F9F',
    borderSelected: '#555555',
    text: '#333333',
    mutedText: '#555555',
    headerText: '#000000',
    divider: '#B4B4B4',
    shadow: '5px 5px 0 rgba(95, 95, 95, 0.52)',
    borderRadius: '0px',
    borderWidth: '1px',
  },
  parametricNote: {
    background: '#F4F0F4',
    border: '#A6A6A6',
    text: '#111111',
    connectionLine: '#8A8A8A',
    connectionDash: '4 4',
    borderRadius: '0px',
  },
  association: {
    stroke: '#222222',
    strokeSelected: '#000000',
    strokeWidth: 1.4,
    multiplicityText: '#111111',
    markerStroke: '#000000',
    markerFill: 'none',
  },
  handles: { background: '#FFFFFF', border: '#6F6F6F', size: 8 },
  typography: {
    fontFamily: '"Arial", "Calibri", sans-serif',
    classNameSize: '14px',
    attributeSize: '12px',
    multiplicitySize: '13px',
    noteSize: '12px',
    fontWeightClassName: 700,
    fontWeightNormal: 600,
  },
  ui: {
    panelBackground: '#F7F8FA',
    panelBorder: '#DDE3EA',
    panelText: '#111111',
    panelMutedText: '#5F6872',
    toolbarBackground: '#F7F8FA',
    buttonBackground: '#FFFFFF',
    buttonBorder: '#C7D0DA',
    buttonText: '#111111',
    buttonActiveBackground: '#8A6F42',
    buttonActiveText: '#FFF8EA',
    inputBackground: '#FFFFFF',
    inputText: '#111111',
    inputBorder: '#C7D0DA',
  },
};

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
  canvas: { background: '#0F172A', gridColor: '#1E293B', gridColorStrong: '#475569' },
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
  canvas: { background: '#FFFFFF', gridColor: '#F0F0F0', gridColorStrong: '#D6D6D6' },
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
  handles: { background: '#FFFFFF', border: '#666666', size: 7 },
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
  canvas: { background: '#0D2236', gridColor: '#173A56', gridColorStrong: '#2D6F9F' },
  classNode: {
    background: '#112C45',
    border: '#62BDE8',
    borderSelected: '#F0FAFF',
    text: '#DDEFFB',
    mutedText: '#A9D7EF',
    headerText: '#FFFFFF',
    divider: '#4EA5D3',
    shadow: '0 6px 14px rgba(0, 0, 0, 0.2)',
    borderRadius: '4px',
    borderWidth: '1px',
  },
  parametricNote: {
    background: '#15324B',
    border: '#62BDE8',
    text: '#DDEFFB',
    connectionLine: '#9BD7F5',
    connectionDash: '5 5',
    borderRadius: '4px',
  },
  association: {
    stroke: '#A9D7EF',
    strokeSelected: '#FFFFFF',
    strokeWidth: 1.4,
    multiplicityText: '#E0F2FE',
    markerStroke: '#A9D7EF',
    markerFill: 'none',
  },
  handles: { background: '#0D2236', border: '#F0FAFF', size: 8 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Arial, sans-serif',
    classNameSize: '13px',
    attributeSize: '12px',
    multiplicitySize: '12px',
    noteSize: '12px',
    fontWeightClassName: 600,
    fontWeightNormal: 400,
  },
  ui: {
    panelBackground: '#11263A',
    panelBorder: '#285E86',
    panelText: '#F0FAFF',
    panelMutedText: '#A9D7EF',
    toolbarBackground: '#11263A',
    buttonBackground: '#153A59',
    buttonBorder: '#3A80AE',
    buttonText: '#F0FAFF',
    buttonActiveBackground: '#6BC5F2',
    buttonActiveText: '#082033',
    inputBackground: '#0D2236',
    inputText: '#F0FAFF',
    inputBorder: '#3A80AE',
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

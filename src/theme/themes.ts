export type ThemeAppearance = 'light' | 'dark';

export type DiagramTheme = {
  id: DiagramThemeId;
  name: string;
  description: string;
  appearance: ThemeAppearance;
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
  /** Sequence canvas ink. These used to be hardcoded in the component behind a
      flag that was always true, which kept a whole warm palette out of the
      system and out of this file. Every hue here sits in the app's cool band. */
  sequence: {
    stroke: string;
    strokeSelected: string;
    participantFill: string;
    participantBorder: string;
    text: string;
    mutedText: string;
    canvasBackground: string;
    canvasGrid: string;
    lifeline: string;
    fragmentStroke: string;
    fragmentFill: string;
    nestedFragmentFill: string;
    fragmentTabFill: string;
    guardFill: string;
    guardText: string;
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
    /** Extra neutral steps between the panel border and the text ramp. */
    panelBorderStrong: string;
    panelSecondaryText: string;
    panelFaintText: string;
    panelPlaceholderText: string;
    /** Focus borders and the solid fill behind white text on hover. */
    accentBorder: string;
    accentStrongFill: string;
    /** Application chrome around the editors. */
    appBackground: string;
    sidebarBackground: string;
    hoverBackground: string;
    selectedBackground: string;
    selectedText: string;
    danger: string;
    feedbackBackground: string;
    projectTones: readonly [string, string, string, string, string, string, string];
  };
  /** Semantic status colors: badges, review items, save state. */
  status: Record<StatusTone, { soft: string; softStrong: string; border: string; borderStrong: string; text: string }>;
};

export type StatusTone = 'danger' | 'warning' | 'success' | 'info' | 'violet';

/** One visual language in two appearances. */
export type DiagramThemeId = 'academic-light' | 'academic-dark';

export const academicLightTheme: DiagramTheme = {
  id: 'academic-light',
  name: 'Academic Light',
  description: 'Tema claro, moderno y cómodo para estudiar',
  appearance: 'light',
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
  sequence: {
    stroke: '#344149',
    strokeSelected: '#2F6F9F',
    participantFill: '#F8FAFB',
    participantBorder: '#839096',
    text: '#303C43',
    mutedText: '#66737B',
    canvasBackground: '#F7F8FA',
    canvasGrid: '#D8DEE6',
    lifeline: '#8B979D',
    fragmentStroke: '#6D7A7E',
    fragmentFill: 'rgba(237, 242, 246, 0.44)',
    nestedFragmentFill: 'rgba(233, 238, 244, 0.38)',
    fragmentTabFill: '#E8EEF3',
    guardFill: '#EAF0F6',
    guardText: '#3D5166',
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
    panelBorderStrong: '#B9C7D3',
    panelSecondaryText: '#3F4D59',
    panelFaintText: '#6D7984',
    panelPlaceholderText: '#9AA5B1',
    accentBorder: '#7FA2C3',
    accentStrongFill: '#294F75',
    appBackground: '#F1F4F6',
    sidebarBackground: '#F7F8FA',
    hoverBackground: '#EDF2F6',
    selectedBackground: '#E6EEF6',
    selectedText: '#244F78',
    danger: '#B63D42',
    feedbackBackground: '#263746',
    projectTones: ['#8F6235', '#456D83', '#65754F', '#745E7A', '#8A633F', '#4C716F', '#715D45'],
  },
  status: {
    danger: { soft: '#FEF2F2', softStrong: '#FEE2E2', border: '#FCA5A5', borderStrong: '#F87171', text: '#B91C1C' },
    warning: { soft: '#FFFBEB', softStrong: '#FEF3C7', border: '#FCD34D', borderStrong: '#F59E0B', text: '#B45309' },
    success: { soft: '#F0FDF4', softStrong: '#DCFCE7', border: '#BBF7D0', borderStrong: '#4F806D', text: '#15803D' },
    info: { soft: '#EFF6FF', softStrong: '#DBEAFE', border: '#BFDBFE', borderStrong: '#7DD3FC', text: '#0369A1' },
    violet: { soft: '#F5F3FF', softStrong: '#EDE9FE', border: '#DDD6FE', borderStrong: '#A78BFA', text: '#7C3AED' },
  },
};

/** Same cool slate band as the light theme, inverted for low light. Diagram
    ink stays desaturated so exports (always light) and screen read alike. */
export const academicDarkTheme: DiagramTheme = {
  ...academicLightTheme,
  id: 'academic-dark',
  name: 'Academic Dark',
  description: 'Tema oscuro para trabajar con poca luz',
  appearance: 'dark',
  canvas: { background: '#13181E', gridColor: '#1F262E', gridColorStrong: '#3A4552' },
  classNode: {
    ...academicLightTheme.classNode,
    background: '#1C232B',
    border: '#4A5664',
    borderSelected: '#6FA8DC',
    text: '#DCE3EA',
    mutedText: '#A3AFBB',
    headerText: '#EEF3F8',
    divider: '#333D48',
    shadow: '0 4px 14px rgba(0, 0, 0, 0.45)',
  },
  parametricNote: {
    ...academicLightTheme.parametricNote,
    background: '#27251A',
    border: '#6B5F35',
    text: '#EDE3C4',
    connectionLine: '#A8965C',
  },
  association: {
    ...academicLightTheme.association,
    stroke: '#9FB3C8',
    strokeSelected: '#7FB6EC',
    multiplicityText: '#DCE6F0',
    markerStroke: '#9FB3C8',
  },
  handles: { ...academicLightTheme.handles, background: '#1C232B', border: '#6FA8DC' },
  sequence: {
    stroke: '#B7C3CC',
    strokeSelected: '#7FB6E3',
    participantFill: '#1E252D',
    participantBorder: '#5D6B75',
    text: '#DCE3E8',
    mutedText: '#9AA7B0',
    canvasBackground: '#13181E',
    canvasGrid: '#262E37',
    lifeline: '#6B7880',
    fragmentStroke: '#7F8C92',
    fragmentFill: 'rgba(40, 50, 61, 0.45)',
    nestedFragmentFill: 'rgba(48, 59, 71, 0.4)',
    fragmentTabFill: '#28323C',
    guardFill: '#243241',
    guardText: '#B5C8DA',
  },
  ui: {
    accent: '#7FB0DB',
    accentStrong: '#A9CBEA',
    accentSoft: '#1D2A37',
    accentSoftStrong: '#213244',
    accentOutline: '#3D5873',
    warningText: '#E0B070',
    panelBackground: '#1B2129',
    panelSubtleBackground: '#1F262E',
    panelMutedBackground: '#242C35',
    panelStrongBackground: '#2D3640',
    panelBorder: '#313B46',
    panelText: '#E3E8EE',
    panelMutedText: '#A5B1BC',
    toolbarBackground: '#1B2129',
    buttonBackground: '#252D36',
    buttonBorder: '#3B4652',
    buttonText: '#DDE3E9',
    buttonActiveBackground: '#3A75AB',
    buttonActiveText: '#FFFFFF',
    inputBackground: '#161B22',
    inputText: '#E3E8EE',
    inputBorder: '#3B4652',
    panelBorderStrong: '#4A5663',
    panelSecondaryText: '#C5CED7',
    panelFaintText: '#8D99A5',
    panelPlaceholderText: '#6C7885',
    accentBorder: '#5C8AB5',
    accentStrongFill: '#2B5780',
    appBackground: '#111519',
    sidebarBackground: '#161B21',
    hoverBackground: '#232B34',
    selectedBackground: '#233549',
    selectedText: '#A3C9EE',
    danger: '#E0777C',
    feedbackBackground: '#34475A',
    projectTones: ['#C49A6C', '#7FA7BE', '#9CAE84', '#B096B6', '#C29A74', '#82ABA8', '#AE977A'],
  },
  status: {
    danger: { soft: '#3A1F22', softStrong: '#4A2327', border: '#7A3A3E', borderStrong: '#B4545A', text: '#F2A5A5' },
    warning: { soft: '#33291A', softStrong: '#45361C', border: '#7A5F2A', borderStrong: '#C08A2E', text: '#EBC27A' },
    success: { soft: '#1C3024', softStrong: '#223D2D', border: '#2F5A3C', borderStrong: '#4F8A66', text: '#8FD3A6' },
    info: { soft: '#1A2D40', softStrong: '#1F3650', border: '#2E4F70', borderStrong: '#4A7FB0', text: '#8CC4F0' },
    violet: { soft: '#2A2440', softStrong: '#342B50', border: '#4A3F75', borderStrong: '#7A68B8', text: '#C4B2F5' },
  },
};

export const themes = [academicLightTheme, academicDarkTheme] as const;

export const DEFAULT_THEME_ID: DiagramThemeId = 'academic-light';

/** Exports are documents: they always render on the light theme. */
export const EXPORT_THEME = academicLightTheme;

export const getThemeById = (themeId: string | null): DiagramTheme =>
  themes.find((theme) => theme.id === themeId) ?? academicLightTheme;

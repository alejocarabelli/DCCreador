import type { SequenceParticipant } from '../types/diagram';
import type { DiagramTheme } from '../theme/themes';

export type ParticipantVisualFamily = {
  id: string;
  name: string;
  headerFill: string;
  headerBorder: string;
  lifelineStroke: string;
  activationFill: string;
  activationBorder: string;
  glyphStroke: string;
};

export type ParticipantVisualIdentity = {
  identityKey: string;
  familyId: string;
  headerFill: string;
  headerBorder: string;
  lifelineStroke: string;
  activationFill: string;
  activationBorder: string;
  glyphStroke: string;
};

/**
 * Paleta de 8 familias cromáticas diseñadas específicamente para diagramas UML
 * sobre fondos claros (blanco y gris perla).
 *
 * Características:
 * - Fondos de encabezados pastel muy claros (~95-97% luminosidad, baja saturación) para máxima legibilidad.
 * - Bordes de encabezados suaves pero nítidos.
 * - Líneas de vida tenues (stroke-dasharray) que guían la mirada vertical sin competir con flechas.
 * - Activaciones con relleno derivado y contraste adecuado respecto a la línea de vida y mensajes.
 * - Ausencia total de colores fluorescentes, estridentes o saturados.
 */
export const SEQUENCE_PARTICIPANT_PALETTE: readonly ParticipantVisualFamily[] = [
  {
    id: 'technical-sand',
    name: 'Arena técnica',
    headerFill: '#F2EDE3',
    headerBorder: '#9A8564',
    lifelineStroke: '#A69A87',
    activationFill: '#EEE8DC',
    activationBorder: '#8D7A60',
    glyphStroke: '#78664D',
  },
  {
    id: 'soft-blue',
    name: 'Azul técnico',
    headerFill: '#E8F0F6',
    headerBorder: '#6684A0',
    lifelineStroke: '#8295A6',
    activationFill: '#E3ECF3',
    activationBorder: '#66829B',
    glyphStroke: '#536F88',
  },
  {
    id: 'technical-slate',
    name: 'Pizarra clara',
    headerFill: '#EDF0F4',
    headerBorder: '#728394',
    lifelineStroke: '#8997A4',
    activationFill: '#E8EDF0',
    activationBorder: '#6F838C',
    glyphStroke: '#5E7180',
  },
  {
    id: 'soft-clay',
    name: 'Arcilla suave',
    headerFill: '#F3EEE7',
    headerBorder: '#9A7F67',
    lifelineStroke: '#AA9684',
    activationFill: '#F0E8E1',
    activationBorder: '#92745E',
    glyphStroke: '#81614D',
  },
  {
    id: 'muted-indigo',
    name: 'Índigo apagado',
    headerFill: '#ECECF5',
    headerBorder: '#787E9D',
    lifelineStroke: '#9195AB',
    activationFill: '#E8E9F2',
    activationBorder: '#747B98',
    glyphStroke: '#626985',
  },
  {
    id: 'blue-mist',
    name: 'Azul bruma',
    headerFill: '#E7F1F4',
    headerBorder: '#5F8392',
    lifelineStroke: '#8299A2',
    activationFill: '#E2EDF1',
    activationBorder: '#607F8C',
    glyphStroke: '#506E7A',
  },
  {
    id: 'dusty-rose',
    name: 'Rosa mineral',
    headerFill: '#F3EBEB',
    headerBorder: '#9A777B',
    lifelineStroke: '#AA9294',
    activationFill: '#F0E6E7',
    activationBorder: '#916D72',
    glyphStroke: '#805D62',
  },
  {
    id: 'warm-stone',
    name: 'Piedra cálida',
    headerFill: '#F0EFEC',
    headerBorder: '#87837A',
    lifelineStroke: '#99958C',
    activationFill: '#ECEAE6',
    activationBorder: '#7D786F',
    glyphStroke: '#6C675F',
  },
] as const;

export const NEUTRAL_PARTICIPANT_FAMILY: ParticipantVisualFamily = {
  id: 'neutral',
  name: 'Neutro',
  headerFill: '#FFFFFF',
  headerBorder: '#AEB7C4',
  lifelineStroke: '#8395A7',
  activationFill: '#FFFFFF',
  activationBorder: '#52606D',
  glyphStroke: '#334E68',
};

/**
 * Normaliza nombres de clasificadores para eliminar prefijos de formato
 * y asegurar comparación case-insensitive consistente.
 */
export const normalizeClassifierName = (name: string | undefined | null): string => {
  if (!name) return '';
  return name
    .trim()
    .replace(/^:+/, '')
    .trim()
    .toLowerCase();
};

export type ResolveParticipantIdentityOptions = {
  classNodesById?: Map<string, { name: string }> | Record<string, { name: string }>;
};

/**
 * Resuelve la identidad conceptual del participante para la asignación de color.
 * Prioridades:
 * 1. Si está vinculado a una clase del diagrama de clases (`classifierNodeId`)
 *    y se conoce su nombre, se usa el nombre conceptual de esa clase.
 * 2. Si no, se utiliza el nombre normalizado de su clasificador (`classifierName`).
 * 3. Si solo existe `classifierNodeId`, se utiliza como identificador estable.
 * 4. Fallback:
 *    - Para actores sin clase: 'actor:default'.
 *    - Para participantes sin clase pero con nombre de instancia: 'instance:<nombre>'.
 *    - Fallback final: 'fallback:<kind>'.
 */
export const resolveParticipantIdentityKey = (
  participant: Pick<SequenceParticipant, 'id' | 'kind' | 'name' | 'classifierName' | 'classifierNodeId'>,
  options?: ResolveParticipantIdentityOptions,
): string => {
  if (participant.classifierNodeId) {
    const linkedNode = options?.classNodesById instanceof Map
      ? options.classNodesById.get(participant.classifierNodeId)
      : options?.classNodesById?.[participant.classifierNodeId];
    const linkedName = linkedNode?.name ? normalizeClassifierName(linkedNode.name) : '';
    if (linkedName) {
      return `class:${linkedName}`;
    }
  }

  const normalizedClassifier = normalizeClassifierName(participant.classifierName);
  if (normalizedClassifier) {
    return `class:${normalizedClassifier}`;
  }

  if (participant.classifierNodeId) {
    return `class-id:${participant.classifierNodeId}`;
  }

  if (participant.kind === 'actor') {
    return 'actor:default';
  }

  const normalizedName = normalizeClassifierName(participant.name);
  if (normalizedName) {
    return `instance:${normalizedName}`;
  }

  return `fallback:${participant.kind || 'object'}`;
};

/**
 * Hash determinista de 32 bits FNV-1a.
 * Garantiza excelente dispersión uniforme sobre la paleta, sin colisiones
 * redundantes y totalmente libre de aleatoriedad.
 */
export const hashParticipantIdentity = (identityKey: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < identityKey.length; i += 1) {
    hash ^= identityKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const parseHex = (hex: string): [number, number, number] => {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as [number, number, number];
};

/** Linear sRGB mix of two #RRGGBB colors; `weight` is the share of `from`. */
export const mixHexColors = (from: string, to: string, weight: number): string => {
  const a = parseHex(from);
  const b = parseHex(to);
  return `#${a.map((channel, index) => Math.round(channel * weight + b[index] * (1 - weight)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

/**
 * Las familias están pensadas para fondos claros. En modo oscuro se conserva el
 * tono (derivado del borde) y se invierte la luminosidad: rellenos profundos,
 * bordes y trazos aclarados para que el texto claro siga siendo legible.
 */
export const toDarkParticipantFamily = (family: ParticipantVisualFamily, canvasBackground: string): ParticipantVisualFamily => ({
  ...family,
  headerFill: mixHexColors(family.headerBorder, canvasBackground, 0.24),
  headerBorder: mixHexColors(family.headerBorder, '#FFFFFF', 0.82),
  lifelineStroke: mixHexColors(family.lifelineStroke, '#FFFFFF', 0.9),
  activationFill: mixHexColors(family.activationBorder, canvasBackground, 0.3),
  activationBorder: mixHexColors(family.activationBorder, '#FFFFFF', 0.8),
  glyphStroke: mixHexColors(family.glyphStroke, '#FFFFFF', 0.55),
});

export type ResolveParticipantVisualIdentityOptions = ResolveParticipantIdentityOptions & {
  enabled?: boolean;
  theme?: DiagramTheme;
};

export const getNeutralVisualIdentity = (
  participant: Pick<SequenceParticipant, 'id' | 'kind' | 'name' | 'classifierName' | 'classifierNodeId'>,
  theme?: DiagramTheme,
): ParticipantVisualIdentity => {
  const identityKey = resolveParticipantIdentityKey(participant);
  return {
    identityKey,
    familyId: NEUTRAL_PARTICIPANT_FAMILY.id,
    headerFill: theme?.classNode?.background ?? NEUTRAL_PARTICIPANT_FAMILY.headerFill,
    headerBorder: theme?.classNode?.border ?? NEUTRAL_PARTICIPANT_FAMILY.headerBorder,
    lifelineStroke: theme?.association?.stroke ?? NEUTRAL_PARTICIPANT_FAMILY.lifelineStroke,
    activationFill: theme?.classNode?.background ?? NEUTRAL_PARTICIPANT_FAMILY.activationFill,
    activationBorder: theme?.classNode?.border ?? NEUTRAL_PARTICIPANT_FAMILY.activationBorder,
    glyphStroke: theme?.association?.stroke ?? NEUTRAL_PARTICIPANT_FAMILY.glyphStroke,
  };
};

/**
 * Resuelve la identidad visual completa (colores de fondo, bordes, líneas de vida
 * y activaciones) para un participante determinado.
 */
export const resolveParticipantVisualIdentity = (
  participant: Pick<SequenceParticipant, 'id' | 'kind' | 'name' | 'classifierName' | 'classifierNodeId'>,
  options?: ResolveParticipantVisualIdentityOptions,
): ParticipantVisualIdentity => {
  if (options?.enabled === false) {
    return getNeutralVisualIdentity(participant, options?.theme);
  }

  const identityKey = resolveParticipantIdentityKey(participant, options);

  if (identityKey === 'actor:default') {
    return getNeutralVisualIdentity(participant, options?.theme);
  }

  const hash = hashParticipantIdentity(identityKey);
  const familyIndex = hash % SEQUENCE_PARTICIPANT_PALETTE.length;
  const paletteFamily = SEQUENCE_PARTICIPANT_PALETTE[familyIndex];
  const family = options?.theme?.appearance === 'dark'
    ? toDarkParticipantFamily(paletteFamily, options.theme.sequence.canvasBackground)
    : paletteFamily;

  return {
    identityKey,
    familyId: family.id,
    headerFill: family.headerFill,
    headerBorder: family.headerBorder,
    lifelineStroke: family.lifelineStroke,
    activationFill: family.activationFill,
    activationBorder: family.activationBorder,
    glyphStroke: family.glyphStroke,
  };
};

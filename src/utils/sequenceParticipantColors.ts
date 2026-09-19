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
    id: 'slate-blue',
    name: 'Azul grisáceo',
    headerFill: '#F0F4F8',
    headerBorder: '#9BB2C9',
    lifelineStroke: '#8CA5BD',
    activationFill: '#E8EEF5',
    activationBorder: '#7C9AB7',
    glyphStroke: '#5B7B9E',
  },
  {
    id: 'sage-green',
    name: 'Verde salvia',
    headerFill: '#F2F6F1',
    headerBorder: '#A3BDA0',
    lifelineStroke: '#92B08E',
    activationFill: '#E9F1E7',
    activationBorder: '#81A47C',
    glyphStroke: '#638A5E',
  },
  {
    id: 'muted-lavender',
    name: 'Violeta apagado',
    headerFill: '#F5F2F8',
    headerBorder: '#B8AACF',
    lifelineStroke: '#A898C2',
    activationFill: '#EEE8F4',
    activationBorder: '#9784B4',
    glyphStroke: '#7D68A1',
  },
  {
    id: 'warm-ochre',
    name: 'Ocre suave',
    headerFill: '#F8F5EE',
    headerBorder: '#D1C2A5',
    lifelineStroke: '#C2B191',
    activationFill: '#F3EFE4',
    activationBorder: '#B29F7C',
    glyphStroke: '#9A825B',
  },
  {
    id: 'dusty-rose',
    name: 'Rosa viejo',
    headerFill: '#F8F1F3',
    headerBorder: '#D4ACBA',
    lifelineStroke: '#C69BAA',
    activationFill: '#F3E6EB',
    activationBorder: '#B78596',
    glyphStroke: '#A16B7E',
  },
  {
    id: 'soft-teal',
    name: 'Celeste grisáceo',
    headerFill: '#EFF6F6',
    headerBorder: '#9DC3C2',
    lifelineStroke: '#8CB6B5',
    activationFill: '#E5F0F0',
    activationBorder: '#78A6A5',
    glyphStroke: '#578E8D',
  },
  {
    id: 'soft-terracotta',
    name: 'Terracota clara',
    headerFill: '#F8F3F0',
    headerBorder: '#D6B5A7',
    lifelineStroke: '#C7A292',
    activationFill: '#F3EBE6',
    activationBorder: '#B78D7B',
    glyphStroke: '#A4705C',
  },
  {
    id: 'steel-blue',
    name: 'Gris azulado',
    headerFill: '#F1F3F6',
    headerBorder: '#A8B4C4',
    lifelineStroke: '#96A4B6',
    activationFill: '#E9ECF1',
    activationBorder: '#8393A8',
    glyphStroke: '#667A94',
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
  const family = SEQUENCE_PARTICIPANT_PALETTE[familyIndex];

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

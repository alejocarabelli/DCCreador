import { Boxes, FileText, GitBranch, UsersRound, Workflow, type LucideIcon } from 'lucide-react';
import type { DesignArtifact } from '../types/diagram';

type ArtifactType = DesignArtifact['type'];

/**
 * The five artifact types, in the order a course project is usually built:
 * who uses the system, what happens, how objects talk, what they are.
 * The same icon and name everywhere (sidebar, breadcrumb, home, menus).
 */
export const ARTIFACT_TYPES: ReadonlyArray<{
  id: ArtifactType;
  label: string;
  description: string;
  /** Short plural for summaries: "2 secuencias". */
  countLabel: [singular: string, plural: string];
  icon: LucideIcon;
}> = [
  { id: 'use-case-model', label: 'Modelo de casos de uso', description: 'Identificá quién usa el sistema y para qué.', countLabel: ['modelo de casos de uso', 'modelos de casos de uso'], icon: UsersRound },
  { id: 'use-case-flow', label: 'Flujo de sucesos', description: 'Describí los pasos de un caso de uso.', countLabel: ['flujo de sucesos', 'flujos de sucesos'], icon: FileText },
  { id: 'sequence-diagram', label: 'Diagrama de secuencia', description: 'Mostrá cómo se comunican los objetos.', countLabel: ['secuencia', 'secuencias'], icon: Workflow },
  { id: 'class-sequence-diagram', label: 'Clases de secuencias', description: 'Reuní las clases que usan tus secuencias.', countLabel: ['modelo de clases de secuencias', 'modelos de clases de secuencias'], icon: GitBranch },
  { id: 'class-diagram', label: 'Diagrama de clases', description: 'Definí las clases y sus relaciones.', countLabel: ['diagrama de clases', 'diagramas de clases'], icon: Boxes },
];

export const artifactTypeInfo = (type: ArtifactType) =>
  ARTIFACT_TYPES.find((candidate) => candidate.id === type) ?? ARTIFACT_TYPES[0];

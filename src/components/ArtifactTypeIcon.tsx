import { Boxes, FileText, GitBranch, UsersRound, Workflow } from 'lucide-react';
import type { DesignArtifact } from '../types/diagram';

type ArtifactTypeIconProps = {
  type: DesignArtifact['type'];
  size?: number;
};

/** One glyph per artifact type, shared by the project rail and the editor header. */
export function ArtifactTypeIcon({ type, size = 15 }: ArtifactTypeIconProps) {
  const Icon = type === 'class-diagram'
    ? Boxes
    : type === 'class-sequence-diagram'
      ? GitBranch
      : type === 'use-case-model'
        ? UsersRound
        : type === 'use-case-flow'
          ? FileText
          : Workflow;
  return <Icon aria-hidden="true" size={size} />;
}

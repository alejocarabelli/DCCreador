import { ChevronRight } from 'lucide-react';
import type { DesignArtifact } from '../types/diagram';
import { ArtifactTypeIcon } from './ArtifactTypeIcon';

type EditorIdentityProps = {
  artifactKind: string;
  artifactName: string;
  artifactType: DesignArtifact['type'];
  projectName: string;
};

/**
 * One line: project › type glyph + artifact name. The type used to sit above as
 * a label, which repeated the name whenever an artifact kept its default
 * ("Diagrama de clases" twice). The glyph matches the project rail, and the
 * type stays in the accessible name and the tooltip.
 */
export function EditorIdentity({ artifactKind, artifactName, artifactType, projectName }: EditorIdentityProps) {
  return (
    <div className="editor-identity" title={`${projectName} › ${artifactName} (${artifactKind})`}>
      <div className="editor-breadcrumb">
        <span className="editor-breadcrumb-project">{projectName}</span>
        <ChevronRight aria-hidden="true" size={14} />
        <span className="editor-breadcrumb-type">
          <ArtifactTypeIcon type={artifactType} size={14} />
        </span>
        <h1>
          {artifactName}
          <span className="visually-hidden"> · {artifactKind}</span>
        </h1>
      </div>
    </div>
  );
}

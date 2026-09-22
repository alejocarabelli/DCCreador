import { ChevronRight } from 'lucide-react';

type EditorIdentityProps = {
  artifactKind: string;
  artifactName: string;
  projectName: string;
};

export function EditorIdentity({ artifactKind, artifactName, projectName }: EditorIdentityProps) {
  return (
    <div className="editor-identity">
      <span className="editor-artifact-kind">{artifactKind}</span>
      <div className="editor-breadcrumb" title={`${projectName} / ${artifactName}`}>
        <span>{projectName}</span>
        <ChevronRight aria-hidden="true" size={14} />
        <h1>{artifactName}</h1>
      </div>
    </div>
  );
}

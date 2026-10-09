import type { ClassSequenceDiagramArtifact, SequenceParticipant } from '../types/diagram';
import { resolveParticipantClassNode } from '../utils/sequenceClassImport';

export function SequenceParticipantClassField({ participant, model, onChange }: {
  participant: SequenceParticipant;
  model?: ClassSequenceDiagramArtifact;
  onChange: (values: Partial<SequenceParticipant>) => void;
}) {
  const linkedClass = model ? resolveParticipantClassNode(participant, model.content) : undefined;
  const classByName = model
    ? resolveParticipantClassNode({ ...participant, classifierNodeId: undefined }, model.content)
    : undefined;

  return (
    <label style={{ marginTop: 10 }}>
      <span>Clase del modelo</span>
      <select
        aria-describedby="sequence-participant-class-help"
        disabled={!model}
        value={linkedClass?.id ?? ''}
        onChange={(event) => {
          const node = model?.content.nodes.find((candidate) => candidate.id === event.target.value);
          onChange({
            classifierNodeId: node?.id,
            classifierName: node?.data.name ?? participant.classifierName,
          });
        }}
      >
        {!classByName ? <option value="">Sin vínculo (manual)</option> : null}
        {model?.content.nodes.map((node) => (
          <option key={node.id} value={node.id}>{node.data.name || 'Clase sin nombre'}</option>
        ))}
      </select>
      <small id="sequence-participant-class-help" className="sequence-inspector-hint">
        {!model
          ? 'Vinculá la secuencia con unas Clases de secuencias para elegir una clase.'
          : classByName
            ? 'La clase se vincula por nombre automáticamente. Podés elegir otra clase del modelo.'
            : 'Si el nombre coincide con una clase del modelo, se vincula automáticamente.'}
      </small>
    </label>
  );
}

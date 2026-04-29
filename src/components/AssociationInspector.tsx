import type {
  AssociationDiamondEnd,
  AssociationEdgeData,
  AssociationNavigability,
  AssociationRelationType,
  ClassDiagramEdge,
} from '../types/diagram';
import { normalizeAssociationData } from '../utils/association';
import { MultiplicityInput } from './MultiplicityInput';

type AssociationInspectorProps = {
  edge: ClassDiagramEdge;
  onUpdateAssociation: (edgeId: string, values: Partial<AssociationEdgeData>) => void;
};

export function AssociationInspector({ edge, onUpdateAssociation }: AssociationInspectorProps) {
  const data = normalizeAssociationData(edge.data);

  return (
    <div className="inspector-content">
      <p className="eyebrow">Relación seleccionada</p>
      <label className="field">
        Tipo de relación
        <select
          value={data.relationType}
          onChange={(event) =>
            onUpdateAssociation(edge.id, { relationType: event.target.value as AssociationRelationType })
          }
        >
          <option value="association">Asociación</option>
          <option value="generalization">Herencia / generalización</option>
          <option value="aggregation">Agregación</option>
          <option value="composition">Composición</option>
        </select>
      </label>

      {data.relationType === 'aggregation' || data.relationType === 'composition' ? (
        <label className="field">
          Rombo en
          <select
            value={data.diamondEnd}
            onChange={(event) => onUpdateAssociation(edge.id, { diamondEnd: event.target.value as AssociationDiamondEnd })}
          >
            <option value="source">Origen</option>
            <option value="target">Destino</option>
          </select>
        </label>
      ) : null}

      {data.relationType === 'association' ? (
        <>
          <div className="inspector-section-header">
            <h2>Extremos</h2>
          </div>

          <div className="association-fields">
            <label className="field">
              Multiplicidad origen
              <MultiplicityInput
                ariaLabel="Multiplicidad origen"
                value={data.sourceMultiplicity}
                onChange={(value) => onUpdateAssociation(edge.id, { sourceMultiplicity: value })}
                placeholder="0..1"
              />
            </label>
            <label className="field">
              Multiplicidad destino
              <MultiplicityInput
                ariaLabel="Multiplicidad destino"
                value={data.targetMultiplicity}
                onChange={(value) => onUpdateAssociation(edge.id, { targetMultiplicity: value })}
                placeholder="*"
              />
            </label>
          </div>

          <label className="field">
            Navegabilidad
            <select
              value={data.navigability}
              onChange={(event) =>
                onUpdateAssociation(edge.id, { navigability: event.target.value as AssociationNavigability })
              }
            >
              <option value="none">Ninguna</option>
              <option value="source-to-target">Origen hacia destino</option>
              <option value="target-to-source">Destino hacia origen</option>
              <option value="bidirectional">Bidireccional</option>
            </select>
          </label>
        </>
      ) : null}
    </div>
  );
}

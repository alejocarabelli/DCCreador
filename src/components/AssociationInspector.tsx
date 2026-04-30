import type {
  AssociationConnectionSide,
  AssociationDiamondEnd,
  AssociationEdgeData,
  AssociationLineStyle,
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

const sideOptions: Array<{ label: string; value: AssociationConnectionSide }> = [
  { label: 'Automático', value: 'automatic' },
  { label: '↑', value: 'top' },
  { label: '→', value: 'right' },
  { label: '↓', value: 'bottom' },
  { label: '←', value: 'left' },
];

export function AssociationInspector({ edge, onUpdateAssociation }: AssociationInspectorProps) {
  const data = normalizeAssociationData(edge.data);
  const resetLine = (): void => {
    onUpdateAssociation(edge.id, {
      lineStyle: 'straight',
      sourceSide: 'automatic',
      targetSide: 'automatic',
      waypoints: [],
    });
  };

  return (
    <div className="inspector-content">
      <p className="eyebrow">Relación seleccionada</p>
      <label className="field compact-field">
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

      {data.relationType === 'generalization' ? (
        <label className="field compact-field">
          Triángulo en
          <select
            value={data.diamondEnd}
            onChange={(event) => onUpdateAssociation(edge.id, { diamondEnd: event.target.value as AssociationDiamondEnd })}
          >
            <option value="source">Origen</option>
            <option value="target">Destino</option>
          </select>
        </label>
      ) : null}

      {data.relationType === 'aggregation' || data.relationType === 'composition' ? (
        <label className="field compact-field">
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
          <div className="inspector-section-header compact-section-header">
            <h2>Extremos</h2>
          </div>

          <div className="association-fields compact-association-fields">
            <label className="field compact-field">
              Origen
              <MultiplicityInput
                ariaLabel="Multiplicidad origen"
                value={data.sourceMultiplicity}
                onChange={(value) => onUpdateAssociation(edge.id, { sourceMultiplicity: value })}
                placeholder="0..1"
              />
            </label>
            <label className="field compact-field">
              Destino
              <MultiplicityInput
                ariaLabel="Multiplicidad destino"
                value={data.targetMultiplicity}
                onChange={(value) => onUpdateAssociation(edge.id, { targetMultiplicity: value })}
                placeholder="*"
              />
            </label>
          </div>

          <label className="field compact-field">
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

      <details className="advanced-line-section">
        <summary>Línea avanzada</summary>

        <label className="field compact-field">
          Estilo
          <select
            value={data.lineStyle}
            onChange={(event) =>
              onUpdateAssociation(edge.id, {
                lineStyle: event.target.value as AssociationLineStyle,
                waypoints: [],
              })
            }
          >
            <option value="automatic">Automática</option>
            <option value="straight">Recta</option>
            <option value="orthogonal">Ortogonal</option>
          </select>
        </label>

        <div className="association-fields compact-association-fields">
          <label className="field compact-field">
            Salida
            <select
              value={data.sourceSide}
              onChange={(event) =>
                onUpdateAssociation(edge.id, {
                  sourceSide: event.target.value as AssociationConnectionSide,
                  waypoints: [],
                })
              }
            >
              {sideOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field compact-field">
            Entrada
            <select
              value={data.targetSide}
              onChange={(event) =>
                onUpdateAssociation(edge.id, {
                  targetSide: event.target.value as AssociationConnectionSide,
                  waypoints: [],
                })
              }
            >
              {sideOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button type="button" onClick={resetLine}>
          Restablecer línea
        </button>
      </details>
    </div>
  );
}

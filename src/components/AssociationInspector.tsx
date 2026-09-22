import type {
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

const sideLabels: Record<string, string> = {
  top: 'Arriba',
  right: 'Derecha',
  bottom: 'Abajo',
  left: 'Izquierda',
};

const describeHandle = (handleId: string | null | undefined): string => {
  if (!handleId) {
    return 'Centro';
  }

  const [side, slot = 'center'] = handleId.split('-');
  const sideLabel = sideLabels[side] ?? side;

  if (slot === 'center') {
    return `${sideLabel} · centro`;
  }

  const isHorizontalSide = side === 'top' || side === 'bottom';
  const slotLabel = isHorizontalSide
    ? slot === 'start' ? 'izquierda' : 'derecha'
    : slot === 'start' ? 'arriba' : 'abajo';

  return `${sideLabel} · ${slotLabel}`;
};

export function AssociationInspector({ edge, onUpdateAssociation }: AssociationInspectorProps) {
  const data = normalizeAssociationData(edge.data);
  const supportsEndpoints = data.relationType === 'association'
    || data.relationType === 'aggregation'
    || data.relationType === 'composition';
  return (
    <div className="inspector-content">
      <div className="inspector-heading">
        <p className="eyebrow">Propiedades</p>
        <h2>Relación</h2>
        <span>Diagrama de clases</span>
      </div>
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
          <option value="dependency">Dependencia</option>
          <option value="realization">Realización</option>
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

      {data.relationType !== 'generalization' ? (
        <>
          <label className="field compact-field association-label-field">
            Etiqueta de relación
            <input
              type="text"
              value={data.name}
              maxLength={80}
              onChange={(event) => onUpdateAssociation(edge.id, { name: event.target.value })}
              placeholder="Ej. responsable, titular"
            />
            <span className="helper-text">
              Opcional. Aparece en el centro de la línea y sirve para distinguir asociaciones similares.
            </span>
          </label>

          {supportsEndpoints ? (
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
          ) : (
            <p className="helper-text">Esta relación es dirigida y se representa con flecha hacia el destino.</p>
          )}
        </>
      ) : null}

      <button type="button" onClick={() => onUpdateAssociation(edge.id, {
        lineStyle: 'automatic', waypoints: [], labelOffset: { x: 0, y: 0 },
      })}>Restablecer recorrido y etiqueta</button>
      <div className="association-routing-control">
        <label className="field compact-field">
          Recorrido
          <select
            value={data.lineStyle}
            onChange={(event) =>
              onUpdateAssociation(edge.id, {
                lineStyle: event.target.value as AssociationLineStyle,
                waypoints: [],
              })
            }
          >
            <option value="automatic">Adaptable</option>
            <option value="orthogonal">Con codos</option>
            <option value="straight">Recto</option>
          </select>
        </label>
        <p className="helper-text">
          Adaptable usa una línea recta cuando puede y agrega codos cuando hace falta. No mueve los puntos elegidos.
        </p>
      </div>

      <div className="association-endpoint-editor">
        <div>
          <strong>Puntos de conexión</strong>
          <p className="helper-text">
            Arrastrá los círculos de los extremos de la línea hasta el punto que prefieras en cada clase.
          </p>
        </div>
        <dl className="association-endpoint-summary">
          <div>
            <dt>Origen</dt>
            <dd>{describeHandle(edge.sourceHandle)}</dd>
          </div>
          <div>
            <dt>Destino</dt>
            <dd>{describeHandle(edge.targetHandle)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

import { FileText, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import type {
  ClassAttribute,
  ClassDiagramNode,
  ClassMethod,
  ParametricValue,
  ParametricValuesNoteConnectionMode,
  ParametricValuesNoteHandle,
} from '../types/diagram';
import { AttributeTypeSelect } from './AttributeTypeSelect';
import { createId } from '../utils/id';

type ClassInspectorProps = {
  node: ClassDiagramNode | null;
  onAddAttribute: () => void;
  onAddMethod: () => void;
  onDeleteAttribute: (attributeId: string) => void;
  onDeleteMethod: (methodId: string) => void;
  onReorderAttributes: (attributeIds: string[]) => void;
  onRenameClass: (name: string) => void;
  onSetParametricValuesNote: (nodeId: string, enabled: boolean) => void;
  onUpdateDescription: (description: string) => void;
  onUpdateAttribute: (attributeId: string, field: keyof Omit<ClassAttribute, 'id'>, value: string) => void;
  onUpdateMethod: (methodId: string, values: Omit<ClassMethod, 'id'>) => void;
  onUpdateParametricValues: (nodeId: string, values: ParametricValue[]) => void;
  onUpdateParametricValuesNoteConnection: (
    nodeId: string,
    values: {
      mode?: ParametricValuesNoteConnectionMode;
      handle?: ParametricValuesNoteHandle;
      changedEnd?: 'class' | 'note';
    },
  ) => void;
};

const noteConnectionSides: Array<{ label: string; value: ParametricValuesNoteHandle }> = [
  { label: 'Arriba', value: 'top' },
  { label: 'Derecha', value: 'right' },
  { label: 'Abajo', value: 'bottom' },
  { label: 'Izquierda', value: 'left' },
];

export function ClassInspector({
  node,
  onAddAttribute,
  onAddMethod,
  onDeleteAttribute,
  onDeleteMethod,
  onReorderAttributes,
  onRenameClass,
  onSetParametricValuesNote,
  onUpdateDescription,
  onUpdateAttribute,
  onUpdateMethod,
  onUpdateParametricValues,
  onUpdateParametricValuesNoteConnection,
}: ClassInspectorProps) {
  const [descriptionEditorNodeId, setDescriptionEditorNodeId] = useState<string | null>(null);
  const [attributeOrder, setAttributeOrder] = useState<string[]>([]);
  const [draggedAttributeId, setDraggedAttributeId] = useState<string | null>(null);
  const attributeOrderRef = useRef<string[]>([]);
  const dragWasCommittedRef = useRef(false);

  if (node === null) {
    return (
      <div className="inspector-content">
        <p className="eyebrow">Clase</p>
        <h2>Seleccioná una clase</h2>
        <p className="helper-text">Al seleccionar un nodo vas a poder editar su nombre y sus atributos.</p>
      </div>
    );
  }

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onRenameClass(event.target.value);
  };

  const values = node.data.parametricValues ?? [];
  const hasValuesNote = node.data.hasParametricValuesNote ?? false;
  const description = node.data.description ?? '';
  const noteConnectionMode = node.data.parametricValuesNoteConnectionMode ?? 'manual';
  const shouldShowDescriptionEditor = descriptionEditorNodeId === node.id || description.trim().length > 0;
  const attributesById = new Map(node.data.attributes.map((attribute) => [attribute.id, attribute]));
  const activeAttributeOrder =
    draggedAttributeId === null ? node.data.attributes.map((attribute) => attribute.id) : attributeOrder;
  const orderedAttributes = activeAttributeOrder
    .map((attributeId) => attributesById.get(attributeId))
    .filter((attribute): attribute is ClassAttribute => attribute !== undefined);
  const visibleAttributes =
    orderedAttributes.length === node.data.attributes.length ? orderedAttributes : node.data.attributes;

  const previewAttributePosition = (targetAttributeId: string): void => {
    if (draggedAttributeId === null || draggedAttributeId === targetAttributeId) {
      return;
    }

    const currentOrder = attributeOrderRef.current;
    const sourceIndex = currentOrder.indexOf(draggedAttributeId);
    const targetIndex = currentOrder.indexOf(targetAttributeId);

    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const nextOrder = currentOrder.filter((attributeId) => attributeId !== draggedAttributeId);
    nextOrder.splice(targetIndex, 0, draggedAttributeId);
    attributeOrderRef.current = nextOrder;
    setAttributeOrder(nextOrder);
  };

  return (
    <div className="inspector-content">
      <div className="inspector-heading">
        <p className="eyebrow">Propiedades</p>
        <h2>{node.data.name.trim() || 'Clase sin nombre'}</h2>
        <span>Clase</span>
      </div>
      <label className="field">
        Nombre
        <input value={node.data.name} onChange={handleNameChange} />
      </label>

      <section className="class-description-panel">
        <div className="class-description-header">
          <div>
            <p className="class-description-title">Descripción</p>
            {!shouldShowDescriptionEditor ? (
              <p className="helper-text class-description-helper">Notas privadas para consultar desde este panel.</p>
            ) : null}
          </div>
          {shouldShowDescriptionEditor ? (
            <button
              className="icon-button class-description-clear"
              type="button"
              onClick={() => {
                onUpdateDescription('');
                setDescriptionEditorNodeId(null);
              }}
              title="Quitar descripción"
            >
              <Trash2 size={15} />
            </button>
          ) : (
            <button
              className="class-description-add-button"
              type="button"
              onClick={() => setDescriptionEditorNodeId(node.id)}
            >
              <FileText size={16} />
              Agregar descripción
            </button>
          )}
        </div>

        {shouldShowDescriptionEditor ? (
          <textarea
            className="class-description-textarea"
            value={description}
            onBlur={() => {
              if (description.trim().length === 0) {
                setDescriptionEditorNodeId(null);
              }
            }}
            onChange={(event) => onUpdateDescription(event.target.value)}
            placeholder="Notas internas de la clase..."
            rows={4}
          />
        ) : null}
      </section>

      <div className="inspector-section-header">
        <h2>Atributos</h2>
        <button className="icon-button" type="button" onClick={onAddAttribute} title="Agregar atributo">
          <Plus size={17} />
        </button>
      </div>

      <div
        className={`attribute-editor-list${draggedAttributeId !== null ? ' is-reordering' : ''}`}
        onDragOver={(event) => {
          if (draggedAttributeId !== null) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }
        }}
        onDrop={(event) => {
          if (draggedAttributeId === null) {
            return;
          }

          event.preventDefault();
          dragWasCommittedRef.current = true;
          onReorderAttributes(attributeOrderRef.current);
          setDraggedAttributeId(null);
        }}
      >
        {visibleAttributes.map((attribute, index) => (
          <div
            className={`attribute-editor${draggedAttributeId === attribute.id ? ' is-dragging' : ''}`}
            key={attribute.id}
            onDragEnter={() => previewAttributePosition(attribute.id)}
            onDragOver={(event) => {
              if (draggedAttributeId !== null) {
                event.preventDefault();
                previewAttributePosition(attribute.id);
              }
            }}
          >
            <button
              aria-label={`Reordenar atributo ${attribute.name || index + 1}`}
              className="attribute-drag-handle"
              type="button"
              draggable
              onDragStart={(event) => {
                event.stopPropagation();
                dragWasCommittedRef.current = false;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', attribute.id);
                const originalOrder = node.data.attributes.map((item) => item.id);
                attributeOrderRef.current = originalOrder;
                setAttributeOrder(originalOrder);
                setDraggedAttributeId(attribute.id);
              }}
              onDragEnd={() => {
                if (!dragWasCommittedRef.current) {
                  const originalOrder = node.data.attributes.map((item) => item.id);
                  attributeOrderRef.current = originalOrder;
                  setAttributeOrder(originalOrder);
                }

                dragWasCommittedRef.current = false;
                setDraggedAttributeId(null);
              }}
              onMouseDown={(event) => event.stopPropagation()}
              title="Mantener presionado y arrastrar para reordenar"
            >
              <GripVertical size={16} />
            </button>
            <input
              aria-label="Nombre del atributo"
              value={attribute.name}
              onChange={(event) => onUpdateAttribute(attribute.id, 'name', event.target.value)}
              placeholder="nombre"
              spellCheck={false}
            />
            <span className="attribute-editor-colon" aria-hidden="true">:</span>
            <AttributeTypeSelect
              value={attribute.type}
              onChange={(value) => onUpdateAttribute(attribute.id, 'type', value)}
            />
            <button
              aria-label={`Borrar atributo ${attribute.name || index + 1}`}
              className="attribute-delete-button"
              type="button"
              onClick={() => onDeleteAttribute(attribute.id)}
              title="Borrar atributo"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {node.data.attributes.length === 0 ? <p className="helper-text">Esta clase no tiene atributos.</p> : null}
      </div>

      <div className="inspector-section-header">
        <h2>Métodos</h2>
        <button className="icon-button" type="button" onClick={onAddMethod} title="Agregar método">
          <Plus size={17} />
        </button>
      </div>

      <div className="method-editor-list">
        {node.data.methods.map((method) => (
          <div className="method-editor" key={method.id}>
            <select
              className="method-visibility"
              aria-label="Visibilidad del método"
              value={method.visibility}
              onChange={(event) =>
                onUpdateMethod(method.id, {
                  ...method,
                  visibility: event.target.value as ClassMethod['visibility'],
                })
              }
            >
              <option value=""> </option>
              <option value="+">+</option>
              <option value="-">-</option>
              <option value="#">#</option>
            </select>
            <input
              className="method-name"
              aria-label="Nombre del método"
              value={method.name}
              onChange={(event) => onUpdateMethod(method.id, { ...method, name: event.target.value })}
              placeholder="nombre"
            />
            <span className="method-signature-open" aria-hidden="true">(</span>
            <input
              className="method-parameters"
              aria-label="Parámetros del método"
              value={method.parameters}
              onChange={(event) => onUpdateMethod(method.id, { ...method, parameters: event.target.value })}
              placeholder="parámetros"
            />
            <span className="method-signature-close" aria-hidden="true">) :</span>
            <input
              className="method-return"
              aria-label="Tipo de retorno"
              value={method.returnType}
              onChange={(event) => onUpdateMethod(method.id, { ...method, returnType: event.target.value })}
              placeholder="retorno"
            />
            <button aria-label={`Borrar método ${method.name}`} className="method-delete" type="button" onClick={() => onDeleteMethod(method.id)} title="Borrar método">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="inspector-section-header">
        <h2>Valores paramétricos</h2>
        <button
          className="icon-button"
          type="button"
          onClick={() => onSetParametricValuesNote(node.id, !hasValuesNote)}
          title={hasValuesNote ? 'Eliminar nota de valores' : 'Agregar nota de valores'}
        >
          {hasValuesNote ? <Trash2 size={16} /> : <Plus size={17} />}
        </button>
      </div>

      {hasValuesNote ? (
        <div className="parametric-values-editor-list">
          <div className="parametric-note-connection-control">
            <div>
              <p className="parametric-note-connection-title">Conexión con la nota</p>
              <p className="helper-text">
                {noteConnectionMode === 'automatic'
                  ? 'Los extremos se acomodan al mover la clase o la nota.'
                  : 'Los lados quedan fijos hasta volver al modo automático.'}
              </p>
            </div>
            <div aria-label="Modo de conexión de la nota" className="parametric-note-mode-picker" role="group">
              <button
                aria-pressed={noteConnectionMode === 'automatic'}
                className={noteConnectionMode === 'automatic' ? 'active' : ''}
                type="button"
                onClick={() => onUpdateParametricValuesNoteConnection(node.id, { mode: 'automatic' })}
              >
                Automática
              </button>
              <button
                aria-pressed={noteConnectionMode === 'manual'}
                className={noteConnectionMode === 'manual' ? 'active' : ''}
                type="button"
                onClick={() => onUpdateParametricValuesNoteConnection(node.id, { mode: 'manual' })}
              >
                Manual
              </button>
            </div>
            {noteConnectionMode === 'manual' ? (
              <div className="parametric-note-manual-sides">
                <label className="field compact-field">
                  Lado en clase
                  <select
                    value={node.data.parametricValuesNoteHandle ?? 'bottom'}
                    onChange={(event) =>
                      onUpdateParametricValuesNoteConnection(node.id, {
                        mode: 'manual',
                        handle: event.target.value as ParametricValuesNoteHandle,
                        changedEnd: 'class',
                      })
                    }
                  >
                    {noteConnectionSides.map((side) => (
                      <option key={side.value} value={side.value}>{side.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field compact-field">
                  Lado en nota
                  <select
                    value={node.data.parametricValuesNoteTargetHandle ?? 'top'}
                    onChange={(event) =>
                      onUpdateParametricValuesNoteConnection(node.id, {
                        mode: 'manual',
                        handle: event.target.value as ParametricValuesNoteHandle,
                        changedEnd: 'note',
                      })
                    }
                  >
                    {noteConnectionSides.map((side) => (
                      <option key={side.value} value={side.value}>{side.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>
          {values.map((value) => (
            <div className="parametric-value-inspector-row" key={value.id}>
              <input
                aria-label="Valor paramétrico"
                value={value.value}
                onChange={(event) =>
                  onUpdateParametricValues(
                    node.id,
                    values.map((currentValue) =>
                      currentValue.id === value.id ? { ...currentValue, value: event.target.value } : currentValue,
                    ),
                  )
                }
                placeholder="valor"
              />
              <button
                type="button"
                onClick={() => onUpdateParametricValues(node.id, values.filter((currentValue) => currentValue.id !== value.id))}
                title="Borrar valor"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onUpdateParametricValues(node.id, [...values, { id: createId(), value: '' }])}
          >
            <Plus size={16} />
            Agregar valor
          </button>
          {values.length === 0 ? <p className="helper-text">La nota todavía no tiene valores.</p> : null}
        </div>
      ) : (
        <p className="helper-text">Agregá una nota separada cuando la clase represente estados o tipos.</p>
      )}
    </div>
  );
}

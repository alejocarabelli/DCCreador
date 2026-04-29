import { Plus, Trash2 } from 'lucide-react';
import type { ChangeEvent } from 'react';
import type { ClassAttribute, ClassDiagramNode, ParametricValue } from '../types/diagram';
import { AttributeTypeSelect } from './AttributeTypeSelect';
import { createId } from '../utils/id';

type ClassInspectorProps = {
  node: ClassDiagramNode | null;
  onAddAttribute: () => void;
  onDeleteAttribute: (attributeId: string) => void;
  onRenameClass: (name: string) => void;
  onSetParametricValuesNote: (nodeId: string, enabled: boolean) => void;
  onUpdateAttribute: (attributeId: string, field: keyof Omit<ClassAttribute, 'id'>, value: string) => void;
  onUpdateParametricValues: (nodeId: string, values: ParametricValue[]) => void;
};

export function ClassInspector({
  node,
  onAddAttribute,
  onDeleteAttribute,
  onRenameClass,
  onSetParametricValuesNote,
  onUpdateAttribute,
  onUpdateParametricValues,
}: ClassInspectorProps) {
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

  return (
    <div className="inspector-content">
      <p className="eyebrow">Clase seleccionada</p>
      <label className="field">
        Nombre
        <input value={node.data.name} onChange={handleNameChange} />
      </label>

      <div className="inspector-section-header">
        <h2>Atributos</h2>
        <button className="icon-button" type="button" onClick={onAddAttribute} title="Agregar atributo">
          <Plus size={17} />
        </button>
      </div>

      <div className="attribute-editor-list">
        {node.data.attributes.map((attribute) => (
          <div className="attribute-editor" key={attribute.id}>
            <input
              aria-label="Nombre del atributo"
              value={attribute.name}
              onChange={(event) => onUpdateAttribute(attribute.id, 'name', event.target.value)}
              placeholder="nombre"
            />
            <AttributeTypeSelect
              value={attribute.type}
              onChange={(value) => onUpdateAttribute(attribute.id, 'type', value)}
            />
            <button type="button" onClick={() => onDeleteAttribute(attribute.id)} title="Borrar atributo">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {node.data.attributes.length === 0 ? <p className="helper-text">Esta clase no tiene atributos.</p> : null}
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

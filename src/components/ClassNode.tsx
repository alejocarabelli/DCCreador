import { getClassGroupColor } from '../constants/classGroupColors';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import type { NodeProps } from 'reactflow';
import { Handle, Position } from 'reactflow';
import { INLINE_ATTRIBUTE_TYPE_SUGGESTIONS } from '../constants/attributeTypes';
import type { ClassAttribute, ClassMethod, ClassNodeData, ConnectionSide } from '../types/diagram';
import { createId } from '../utils/id';

type AttributeEditPhase = 'name' | 'type';
type MethodEditPhase = 'name' | 'parameters' | 'returnType';

type AttributeDraft = {
  id: string;
  name: string;
  type: string;
  original: ClassAttribute | null;
  isNew: boolean;
};

type MethodDraft = ClassMethod & {
  original: ClassMethod | null;
  isNew: boolean;
};

const stopFlowEvent = (event: MouseEvent<HTMLElement>): void => {
  event.stopPropagation();
};

const isEmptyAttribute = (attribute: Pick<ClassAttribute, 'name' | 'type'>): boolean =>
  attribute.name.trim().length === 0 && attribute.type.trim().length === 0;

const isEmptyMethod = (method: Pick<ClassMethod, 'name' | 'parameters' | 'returnType'>): boolean =>
  method.name.trim().length === 0 && method.parameters.trim().length === 0 && method.returnType.trim().length === 0;

const getActiveTypeSuggestion = (typeValue: string): string | null => {
  const normalizedTypeValue = typeValue.trim().toLowerCase();

  if (normalizedTypeValue.length === 0) {
    return null;
  }

  return INLINE_ATTRIBUTE_TYPE_SUGGESTIONS.find((type) => type.startsWith(normalizedTypeValue)) ?? null;
};

type ClassConnectionHandle = {
  id: string;
  offset: number;
  position: Position;
};

const legacyHandlePositions = [Position.Top, Position.Right, Position.Bottom, Position.Left];
const connectionHandles: ClassConnectionHandle[] = legacyHandlePositions.flatMap((position) => [
  { id: `${position}-start`, offset: 20, position },
  { id: position, offset: 50, position },
  { id: `${position}-end`, offset: 80, position },
]);

const getHandleOffsetStyle = (position: Position, offset: number) =>
  position === Position.Top || position === Position.Bottom
    ? { left: `${offset}%` }
    : { top: `${offset}%` };

const getClosestHandleSide = (event: MouseEvent<HTMLElement>): ConnectionSide => {
  const bounds = event.currentTarget.getBoundingClientRect();
  const distances: Array<{ distance: number; side: ConnectionSide }> = [
    { distance: Math.abs(event.clientY - bounds.top), side: 'top' },
    { distance: Math.abs(bounds.right - event.clientX), side: 'right' },
    { distance: Math.abs(bounds.bottom - event.clientY), side: 'bottom' },
    { distance: Math.abs(event.clientX - bounds.left), side: 'left' },
  ];

  return distances.sort((first, second) => first.distance - second.distance)[0].side;
};

export function ClassNode({ id, data, selected }: NodeProps<ClassNodeData>) {
  const groupColor = getClassGroupColor(data.groupColor);
  const shouldStartNameEditing = data.shouldStartNameEditing;
  const shouldStartAttributeEditing = data.shouldStartAttributeEditing;
  const shouldStartMethodEditing = data.shouldStartMethodEditing;
  const onNameEditingStarted = data.onNameEditingStarted;
  const onAttributeEditingStarted = data.onAttributeEditingStarted;
  const onMethodEditingStarted = data.onMethodEditingStarted;
  const attributes = data.attributes;
  const methods = data.methods;
  const [editingName, setEditingName] = useState(data.shouldStartNameEditing ?? false);
  const [nameDraft, setNameDraft] = useState(data.shouldStartNameEditing ? '' : data.name);
  const [editingAttributeId, setEditingAttributeId] = useState<string | null>(null);
  const [attributeEditPhase, setAttributeEditPhase] = useState<AttributeEditPhase>('name');
  const [attributeDraft, setAttributeDraft] = useState<AttributeDraft | null>(null);
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null);
  const [methodEditPhase, setMethodEditPhase] = useState<MethodEditPhase>('name');
  const [methodDraft, setMethodDraft] = useState<MethodDraft | null>(null);
  const [activeHandleSide, setActiveHandleSide] = useState<ConnectionSide | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const nameDraftRef = useRef(data.shouldStartNameEditing ? '' : data.name);
  const attributeNameInputRef = useRef<HTMLInputElement | null>(null);
  const attributeTypeInputRef = useRef<HTMLInputElement | null>(null);
  const attributeDraftRef = useRef<AttributeDraft | null>(null);
  const methodNameInputRef = useRef<HTMLInputElement | null>(null);
  const methodParametersInputRef = useRef<HTMLInputElement | null>(null);
  const methodReturnTypeInputRef = useRef<HTMLInputElement | null>(null);
  const methodDraftRef = useRef<MethodDraft | null>(null);
  const skipNameBlurCommitRef = useRef(false);
  const skipAttributeBlurCommitRef = useRef(false);
  const skipMethodBlurCommitRef = useRef(false);

  const displayedAttributes = useMemo(() => {
    if (attributeDraft === null || data.attributes.some((attribute) => attribute.id === attributeDraft.id)) {
      return data.attributes;
    }

    return [...data.attributes, { id: attributeDraft.id, name: attributeDraft.name, type: attributeDraft.type }];
  }, [attributeDraft, data.attributes]);

  const displayedMethods = useMemo(() => {
    if (methodDraft === null || data.methods.some((method) => method.id === methodDraft.id)) {
      return data.methods;
    }

    return [
      ...data.methods,
      {
        id: methodDraft.id,
        visibility: methodDraft.visibility,
        name: methodDraft.name,
        parameters: methodDraft.parameters,
        returnType: methodDraft.returnType,
      },
    ];
  }, [methodDraft, data.methods]);

  const typeSuggestions = useMemo(() => {
    const typeValue = attributeDraft?.type.trim().toLowerCase() ?? '';

    if (attributeEditPhase !== 'type' || typeValue.length === 0) {
      return [];
    }

    return INLINE_ATTRIBUTE_TYPE_SUGGESTIONS.filter((type) => type.startsWith(typeValue));
  }, [attributeDraft?.type, attributeEditPhase]);

  const activeTypeSuggestion = typeSuggestions[0] ?? null;

  useEffect(() => {
    if (!editingName) {
      return;
    }

    const focusInput = (): void => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    };
    focusInput();
    const animationFrameId = window.requestAnimationFrame(focusInput);

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [editingName]);

  useEffect(() => {
    if (shouldStartNameEditing) {
      onNameEditingStarted?.(id);
    }
  }, [id, onNameEditingStarted, shouldStartNameEditing]);

  useEffect(() => {
    if (editingAttributeId === null) {
      return;
    }

    const focusInput = (): void => {
      const input = attributeEditPhase === 'name' ? attributeNameInputRef.current : attributeTypeInputRef.current;
      input?.focus();
      input?.select();
    };
    focusInput();
    const animationFrameId = window.requestAnimationFrame(focusInput);

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [attributeEditPhase, editingAttributeId]);

  useEffect(() => {
    if (editingMethodId === null) {
      return;
    }

    const focusInput = (): void => {
      const input =
        methodEditPhase === 'name'
          ? methodNameInputRef.current
          : methodEditPhase === 'parameters'
            ? methodParametersInputRef.current
            : methodReturnTypeInputRef.current;
      input?.focus();
      input?.select();
    };
    focusInput();
    const animationFrameId = window.requestAnimationFrame(focusInput);

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [editingMethodId, methodEditPhase]);

  const startNameEditing = (event: MouseEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    nameDraftRef.current = data.name;
    setNameDraft(data.name);
    setEditingName(true);
  };

  const commitNameEditing = (): void => {
    data.onRenameClass?.(id, nameDraftRef.current.trim() || 'Clase sin nombre');
    setEditingName(false);
  };

  const commitNameEditingAndFocusFirstAttribute = (): void => {
    const committedName = nameDraftRef.current.trim() || 'Clase sin nombre';
    skipNameBlurCommitRef.current = true;
    setEditingName(false);

    if (data.attributes.length === 0) {
      const attribute: ClassAttribute = {
        id: createId(),
        name: '',
        type: '',
      };

      data.onRenameClassAndCreateAttribute?.(id, committedName, attribute);
      startAttributeEditing(attribute, undefined, true);
      return;
    }

    data.onRenameClass?.(id, committedName);
    startAttributeEditing(data.attributes[0]);
  };

  const cancelNameEditing = (): void => {
    skipNameBlurCommitRef.current = true;
    const originalName = data.name.trim().length > 0 ? data.name : 'Clase sin nombre';
    nameDraftRef.current = originalName;
    setNameDraft(originalName);
    data.onRenameClass?.(id, originalName);
    setEditingName(false);
  };

  const handleNameBlur = (): void => {
    if (skipNameBlurCommitRef.current) {
      skipNameBlurCommitRef.current = false;
      return;
    }

    commitNameEditing();
  };

  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();

    if (event.key === 'Enter') {
      event.preventDefault();
      commitNameEditingAndFocusFirstAttribute();
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelNameEditing();
    }
  };

  const setCurrentAttributeDraft = useCallback((draft: AttributeDraft | null): void => {
    attributeDraftRef.current = draft;
    setAttributeDraft(draft);
  }, []);

  const startAttributeEditing = useCallback((
    attribute: ClassAttribute,
    event?: MouseEvent<HTMLElement>,
    isNew = false,
    phase: AttributeEditPhase = 'name',
  ): void => {
    event?.stopPropagation();
    const nextDraft = {
      id: attribute.id,
      name: attribute.name,
      type: attribute.type,
      original: isNew ? null : { ...attribute },
      isNew,
    };

    setEditingAttributeId(attribute.id);
    setAttributeEditPhase(phase);
    setCurrentAttributeDraft(nextDraft);
  }, [setCurrentAttributeDraft]);

  useEffect(() => {
    if (shouldStartAttributeEditing === undefined) {
      return;
    }

    const attribute = attributes.find(
      (currentAttribute) => currentAttribute.id === shouldStartAttributeEditing,
    );

    if (attribute === undefined) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      startAttributeEditing(attribute, undefined, true);
      onAttributeEditingStarted?.(id);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [attributes, id, onAttributeEditingStarted, shouldStartAttributeEditing, startAttributeEditing]);

  const createAttributeAndStartEditing = (event?: MouseEvent<HTMLElement>): void => {
    event?.stopPropagation();
    const attribute: ClassAttribute = {
      id: createId(),
      name: '',
      type: '',
    };

    data.onCreateAttribute?.(id, attribute);
    startAttributeEditing(attribute, event, true);
  };

  const stopAttributeEditing = (): void => {
    setEditingAttributeId(null);
    setAttributeEditPhase('name');
    setCurrentAttributeDraft(null);
  };

  const commitAttributeEditing = (): void => {
    const currentDraft = attributeDraftRef.current;

    if (currentDraft === null) {
      return;
    }

    if (currentDraft.isNew && isEmptyAttribute(currentDraft)) {
      data.onDeleteAttribute?.(id, currentDraft.id);
    } else {
      data.onUpdateAttributeFields?.(id, currentDraft.id, {
        name: currentDraft.name,
        type: currentDraft.type,
      });
    }

    stopAttributeEditing();
  };

  const commitAttributeAndCreateNext = (typeOverride?: string): void => {
    const currentDraft = attributeDraftRef.current;

    if (currentDraft === null) {
      return;
    }

    const type = typeOverride ?? currentDraft.type;
    const draftToCommit = { ...currentDraft, type };

    if (draftToCommit.isNew && isEmptyAttribute(draftToCommit)) {
      data.onDeleteAttribute?.(id, draftToCommit.id);
      stopAttributeEditing();
      return;
    }

    const nextAttribute: ClassAttribute = {
      id: createId(),
      name: '',
      type: '',
    };

    data.onUpdateAttributeFieldsAndCreateAttribute?.(
      id,
      draftToCommit.id,
      {
        name: draftToCommit.name,
        type: draftToCommit.type,
      },
      nextAttribute,
    );
    startAttributeEditing(nextAttribute, undefined, true);
  };

  const cancelAttributeEditing = (): void => {
    const currentDraft = attributeDraftRef.current;
    skipAttributeBlurCommitRef.current = true;

    if (currentDraft !== null) {
      if (currentDraft.isNew) {
        data.onDeleteAttribute?.(id, currentDraft.id);
      } else if (currentDraft.original !== null) {
        data.onUpdateAttributeFields?.(id, currentDraft.id, {
          name: currentDraft.original.name,
          type: currentDraft.original.type,
        });
      }
    }

    stopAttributeEditing();
  };

  const updateAttributeDraft = (field: keyof Omit<ClassAttribute, 'id'>, value: string): void => {
    const currentDraft = attributeDraftRef.current;

    if (currentDraft === null) {
      return;
    }

    const nextDraft = { ...currentDraft, [field]: value };
    setCurrentAttributeDraft(nextDraft);
    data.onUpdateAttributeFields?.(id, nextDraft.id, {
      name: nextDraft.name,
      type: nextDraft.type,
    });
  };

  const handleAttributeNameKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();

    if (event.key === 'Enter') {
      event.preventDefault();
      const currentDraft = attributeDraftRef.current;

      if (currentDraft?.isNew && isEmptyAttribute(currentDraft)) {
        createFirstMethodFromEmptyAttribute(currentDraft.id);
        return;
      }

      setAttributeEditPhase('type');
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelAttributeEditing();
    }
  };

  const handleAttributeTypeKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();

    if (event.key === 'Enter') {
      event.preventDefault();
      const currentDraft = attributeDraftRef.current;

      if (currentDraft?.isNew && isEmptyAttribute(currentDraft)) {
        createFirstMethodFromEmptyAttribute(currentDraft.id);
        return;
      }

      commitAttributeAndCreateNext(getActiveTypeSuggestion(attributeDraftRef.current?.type ?? '') ?? undefined);
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelAttributeEditing();
    }
  };

  const handleAttributeBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (skipAttributeBlurCommitRef.current) {
      skipAttributeBlurCommitRef.current = false;
      return;
    }

    if (event.currentTarget.dataset.attributeId !== attributeDraftRef.current?.id) {
      return;
    }

    if (!event.currentTarget.contains(event.relatedTarget)) {
      commitAttributeEditing();
    }
  };

  const chooseTypeSuggestion = (type: string): void => {
    updateAttributeDraft('type', type);
    commitAttributeAndCreateNext(type);
  };

  const setCurrentMethodDraft = useCallback((draft: MethodDraft | null): void => {
    methodDraftRef.current = draft;
    setMethodDraft(draft);
  }, []);

  const startMethodEditing = useCallback((
    method: ClassMethod,
    event?: MouseEvent<HTMLElement>,
    isNew = false,
    phase: MethodEditPhase = 'name',
  ): void => {
    event?.stopPropagation();
    const nextDraft: MethodDraft = {
      ...method,
      original: isNew ? null : { ...method },
      isNew,
    };

    setEditingMethodId(method.id);
    setMethodEditPhase(phase);
    setCurrentMethodDraft(nextDraft);
  }, [setCurrentMethodDraft]);

  useEffect(() => {
    if (shouldStartMethodEditing === undefined) {
      return;
    }

    const method = methods.find((currentMethod) => currentMethod.id === shouldStartMethodEditing);

    if (method === undefined) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      startMethodEditing(method, undefined, true);
      onMethodEditingStarted?.(id);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [id, methods, onMethodEditingStarted, shouldStartMethodEditing, startMethodEditing]);

  const stopMethodEditing = (): void => {
    setEditingMethodId(null);
    setMethodEditPhase('name');
    setCurrentMethodDraft(null);
  };

  const createFirstMethodFromEmptyAttribute = (attributeId: string): void => {
    const method: ClassMethod = {
      id: createId(),
      visibility: '',
      name: '',
      parameters: '',
      returnType: '',
    };

    skipAttributeBlurCommitRef.current = true;
    data.onDeleteAttributeAndCreateMethod?.(id, attributeId, method);
    stopAttributeEditing();
    startMethodEditing(method, undefined, true);
  };

  const commitMethodEditing = (): void => {
    const currentDraft = methodDraftRef.current;

    if (currentDraft === null) {
      return;
    }

    if (currentDraft.isNew && isEmptyMethod(currentDraft)) {
      data.onDeleteMethod?.(id, currentDraft.id);
    } else {
      data.onUpdateMethodFields?.(id, currentDraft.id, {
        visibility: currentDraft.visibility,
        name: currentDraft.name,
        parameters: currentDraft.parameters,
        returnType: currentDraft.returnType,
      });
    }

    stopMethodEditing();
  };

  const commitMethodAndCreateNext = (): void => {
    const currentDraft = methodDraftRef.current;

    if (currentDraft === null) {
      return;
    }

    if (currentDraft.isNew && isEmptyMethod(currentDraft)) {
      data.onDeleteMethod?.(id, currentDraft.id);
      stopMethodEditing();
      return;
    }

    const nextMethod: ClassMethod = {
      id: createId(),
      visibility: '',
      name: '',
      parameters: '',
      returnType: '',
    };

    data.onUpdateMethodFieldsAndCreateMethod?.(
      id,
      currentDraft.id,
      {
        visibility: currentDraft.visibility,
        name: currentDraft.name,
        parameters: currentDraft.parameters,
        returnType: currentDraft.returnType,
      },
      nextMethod,
    );
    startMethodEditing(nextMethod, undefined, true);
  };

  const cancelMethodEditing = (): void => {
    const currentDraft = methodDraftRef.current;
    skipMethodBlurCommitRef.current = true;

    if (currentDraft !== null) {
      if (currentDraft.isNew) {
        data.onDeleteMethod?.(id, currentDraft.id);
      } else if (currentDraft.original !== null) {
        data.onUpdateMethodFields?.(id, currentDraft.id, {
          visibility: currentDraft.original.visibility,
          name: currentDraft.original.name,
          parameters: currentDraft.original.parameters,
          returnType: currentDraft.original.returnType,
        });
      }
    }

    stopMethodEditing();
  };

  const updateMethodDraft = (field: keyof Omit<ClassMethod, 'id'>, value: string): void => {
    const currentDraft = methodDraftRef.current;

    if (currentDraft === null) {
      return;
    }

    const nextDraft = { ...currentDraft, [field]: value };
    setCurrentMethodDraft(nextDraft);
    data.onUpdateMethodFields?.(id, nextDraft.id, {
      visibility: nextDraft.visibility,
      name: nextDraft.name,
      parameters: nextDraft.parameters,
      returnType: nextDraft.returnType,
    });
  };

  const handleMethodKeyDown = (event: KeyboardEvent<HTMLInputElement>, phase: MethodEditPhase): void => {
    event.stopPropagation();

    if (event.key === 'Enter') {
      event.preventDefault();

      if (phase === 'name') {
        setMethodEditPhase('parameters');
      } else if (phase === 'parameters') {
        setMethodEditPhase('returnType');
      } else {
        commitMethodAndCreateNext();
      }
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelMethodEditing();
    }
  };

  const handleMethodBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (skipMethodBlurCommitRef.current) {
      skipMethodBlurCommitRef.current = false;
      return;
    }

    if (event.currentTarget.dataset.methodId !== methodDraftRef.current?.id) {
      return;
    }

    if (!event.currentTarget.contains(event.relatedTarget)) {
      commitMethodEditing();
    }
  };

  return (
    <section
      className={`class-node ${selected ? 'selected' : ''} ${
        data.isConnectionInProgress ? 'connection-in-progress' : ''
      } ${data.isConnectionSource ? 'connection-source' : 'connection-target'}`}
      data-group-color={groupColor?.id}
      style={groupColor ? {
        '--group-border': groupColor.border,
        '--group-name': groupColor.name,
        '--group-border-dark': groupColor.darkBorder,
        '--group-name-dark': groupColor.darkName,
      } as CSSProperties : undefined}
      data-active-handle-side={activeHandleSide ?? undefined}
      onContextMenu={(event) => data.onOpenContextMenu?.(id, event)}
      onMouseMove={(event) => setActiveHandleSide(getClosestHandleSide(event))}
      onMouseLeave={() => setActiveHandleSide(null)}
    >
      {connectionHandles.map(({ id: handleId, offset, position }) => {
        const offsetStyle = getHandleOffsetStyle(position, offset);

        return (
          <div
            className={`class-node-handle-layer class-node-handle-layer-${position}`}
            key={handleId}
          >
            <Handle
              className={`class-node-handle class-node-handle-${position}`}
              id={handleId}
              position={position}
              style={offsetStyle}
              type="source"
            />
            <span
              className={`class-node-handle-visual class-node-handle-visual-${position} ${
                handleId === position ? 'is-central' : 'is-secondary'
              }`}
              style={offsetStyle}
            />
          </div>
        );
      })}
      <div className="class-node-title" onDoubleClick={startNameEditing}>
        {editingName ? (
          <input
            ref={nameInputRef}
            aria-label="Nombre de la clase"
            autoFocus
            className="inline-name-input nodrag"
            value={nameDraft}
            onBlur={handleNameBlur}
            onChange={(event) => {
              nameDraftRef.current = event.target.value;
              setNameDraft(event.target.value);
            }}
            onClick={stopFlowEvent}
            onContextMenu={stopFlowEvent}
            onDoubleClick={stopFlowEvent}
            onKeyDown={handleNameKeyDown}
            onMouseDown={stopFlowEvent}
          />
        ) : (
          data.name.trim() || 'Clase sin nombre'
        )}
      </div>
      <div className="class-node-attributes" hidden={data.hideAttributes && editingAttributeId === null}>
        {displayedAttributes.length === 0 ? (
          <span
            className="muted-attribute"
            onContextMenu={stopFlowEvent}
            onDoubleClick={createAttributeAndStartEditing}
            onMouseDown={stopFlowEvent}
          >
            Sin atributos
          </span>
        ) : (
          displayedAttributes.map((attribute) =>
            editingAttributeId === attribute.id && attributeDraft !== null ? (
              <div
                className="inline-attribute-editor nodrag"
                data-attribute-id={attribute.id}
                key={attribute.id}
                onBlur={handleAttributeBlur}
                onClick={stopFlowEvent}
                onContextMenu={stopFlowEvent}
                onDoubleClick={stopFlowEvent}
                onMouseDown={stopFlowEvent}
              >
                <input
                  ref={attributeNameInputRef}
                  aria-label="Nombre del atributo"
                  value={attributeDraft.name}
                  onChange={(event) => updateAttributeDraft('name', event.target.value)}
                  onKeyDown={handleAttributeNameKeyDown}
                  placeholder="nombre"
                />
                <span className="attribute-separator">:</span>
                <div className="inline-type-field">
                  <input
                    ref={attributeTypeInputRef}
                    aria-label="Tipo del atributo"
                    value={attributeDraft.type}
                    onChange={(event) => updateAttributeDraft('type', event.target.value)}
                    onKeyDown={handleAttributeTypeKeyDown}
                    placeholder="tipo"
                  />
                  {typeSuggestions.length > 0 ? (
                    <div
                      className="inline-type-suggestions"
                      onClick={stopFlowEvent}
                      onContextMenu={stopFlowEvent}
                      onDoubleClick={stopFlowEvent}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      {typeSuggestions.map((type) => (
                        <button
                          className={type === activeTypeSuggestion ? 'active' : ''}
                          key={type}
                          type="button"
                          onClick={() => chooseTypeSuggestion(type)}
                          onContextMenu={stopFlowEvent}
                          onDoubleClick={stopFlowEvent}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="attribute-row" key={attribute.id} onDoubleClick={(event) => startAttributeEditing(attribute, event)}>
                <span>{attribute.name || 'atributo'}</span>
                <span className="attribute-separator">:</span>
                <span>{attribute.type || 'tipo'}</span>
              </div>
            ),
          )
        )}
      </div>
      {displayedMethods.length > 0 && (!data.hideMethods || editingMethodId !== null) ? (
        <div className="class-node-methods">
          {displayedMethods.map((method) =>
            editingMethodId === method.id && methodDraft !== null ? (
              <div
                className="inline-method-editor nodrag"
                data-method-id={method.id}
                key={method.id}
                onBlur={handleMethodBlur}
                onClick={stopFlowEvent}
                onContextMenu={stopFlowEvent}
                onDoubleClick={stopFlowEvent}
                onMouseDown={stopFlowEvent}
              >
                <select
                  aria-label="Visibilidad del método"
                  value={methodDraft.visibility}
                  onChange={(event) =>
                    updateMethodDraft('visibility', event.target.value as ClassMethod['visibility'])
                  }
                  onKeyDown={(event) => {
                    event.stopPropagation();

                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelMethodEditing();
                    }
                  }}
                >
                  <option value=""> </option>
                  <option value="+">+</option>
                  <option value="-">-</option>
                  <option value="#">#</option>
                </select>
                <input
                  ref={methodNameInputRef}
                  aria-label="Nombre del método"
                  value={methodDraft.name}
                  onChange={(event) => updateMethodDraft('name', event.target.value)}
                  onKeyDown={(event) => handleMethodKeyDown(event, 'name')}
                  placeholder="nombre"
                />
                <input
                  ref={methodParametersInputRef}
                  aria-label="Parámetros del método"
                  value={methodDraft.parameters}
                  onChange={(event) => updateMethodDraft('parameters', event.target.value)}
                  onKeyDown={(event) => handleMethodKeyDown(event, 'parameters')}
                  placeholder="parámetros"
                />
                <span className="attribute-separator">:</span>
                <input
                  ref={methodReturnTypeInputRef}
                  aria-label="Tipo de retorno"
                  value={methodDraft.returnType}
                  onChange={(event) => updateMethodDraft('returnType', event.target.value)}
                  onKeyDown={(event) => handleMethodKeyDown(event, 'returnType')}
                  placeholder="retorno"
                />
              </div>
            ) : (
              <div className="method-row" key={method.id} onDoubleClick={(event) => startMethodEditing(method, event)}>
                <span>{method.visibility}</span>
                <span>{method.name || 'método'}</span>
                <span>({method.parameters})</span>
                <span className="attribute-separator">:</span>
                <span>{method.returnType || 'void'}</span>
              </div>
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}

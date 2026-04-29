import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { ParametricValue } from '../types/diagram';
import { createId } from '../utils/id';

type ParametricValuesNoteData = {
  classNodeId: string;
  startEditingValueId?: string;
  values: ParametricValue[];
  onValueEditingStarted?: (nodeId: string) => void;
  onUpdateValues?: (nodeId: string, values: ParametricValue[]) => void;
};

type ValueDraft = {
  id: string;
  value: string;
  original: string | null;
  isNew: boolean;
};

const stopFlowEvent = (event: MouseEvent<HTMLElement>): void => {
  event.stopPropagation();
};

const noteHandlePositions = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
] as const;

export function ParametricValuesNote({ data }: NodeProps<ParametricValuesNoteData>) {
  const [editingValueId, setEditingValueId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ValueDraft | null>(null);
  const draftRef = useRef<ValueDraft | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const skipBlurRef = useRef(false);

  const displayedValues = useMemo(() => {
    if (draft === null || data.values.some((value) => value.id === draft.id)) {
      return data.values;
    }

    return [...data.values, { id: draft.id, value: draft.value }];
  }, [data.values, draft]);

  const visibleValues = useMemo(
    () => displayedValues.filter((value) => value.value.trim().length > 0 || value.id === editingValueId),
    [displayedValues, editingValueId],
  );

  useEffect(() => {
    if (editingValueId !== null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingValueId]);

  useEffect(() => {
    if (data.startEditingValueId === undefined) {
      return;
    }

    const value = data.values.find((currentValue) => currentValue.id === data.startEditingValueId) ?? {
      id: data.startEditingValueId,
      value: '',
    };

    startEditing(value, undefined, value.value.trim().length === 0);
    data.onValueEditingStarted?.(data.classNodeId);
  }, [data]);

  const setCurrentDraft = (nextDraft: ValueDraft | null): void => {
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  };

  const updateValues = (nextValues: ParametricValue[]): void => {
    data.onUpdateValues?.(data.classNodeId, nextValues);
  };

  const getValuesWithDraft = (currentDraft: ValueDraft): ParametricValue[] => {
    if (data.values.some((value) => value.id === currentDraft.id)) {
      return data.values;
    }

    return [...data.values, { id: currentDraft.id, value: currentDraft.value }];
  };

  const startEditing = (value: ParametricValue, event?: MouseEvent<HTMLElement>, isNew = false): void => {
    event?.stopPropagation();
    setEditingValueId(value.id);
    setCurrentDraft({
      id: value.id,
      value: value.value,
      original: isNew ? null : value.value,
      isNew,
    });
  };

  const createValueAndEdit = (event?: MouseEvent<HTMLElement>): void => {
    event?.stopPropagation();
    const value = { id: createId(), value: '' };
    updateValues([...data.values, value]);
    startEditing(value, event, true);
  };

  const stopEditing = (): void => {
    setEditingValueId(null);
    setCurrentDraft(null);
  };

  const commitEditing = (createNext = false): void => {
    const currentDraft = draftRef.current;

    if (currentDraft === null) {
      return;
    }

    const trimmedValue = currentDraft.value.trim();
    const currentValues = getValuesWithDraft(currentDraft);
    let nextValues = currentValues;

    if (currentDraft.isNew && trimmedValue.length === 0) {
      nextValues = currentValues.filter((value) => value.id !== currentDraft.id);
    } else {
      nextValues = currentValues.map((value) =>
        value.id === currentDraft.id ? { ...value, value: currentDraft.value } : value,
      );
    }

    if (createNext && trimmedValue.length > 0) {
      const nextValue = { id: createId(), value: '' };
      updateValues([...nextValues, nextValue]);
      startEditing(nextValue, undefined, true);
      return;
    }

    updateValues(nextValues);
    stopEditing();
  };

  const cancelEditing = (): void => {
    const currentDraft = draftRef.current;
    skipBlurRef.current = true;

    if (currentDraft !== null) {
      if (currentDraft.isNew) {
        updateValues(getValuesWithDraft(currentDraft).filter((value) => value.id !== currentDraft.id));
      } else if (currentDraft.original !== null) {
        updateValues(
          getValuesWithDraft(currentDraft).map((value) =>
            value.id === currentDraft.id ? { ...value, value: currentDraft.original ?? '' } : value,
          ),
        );
      }
    }

    stopEditing();
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      return;
    }

    if (!event.currentTarget.contains(event.relatedTarget)) {
      commitEditing(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();

    if (event.key === 'Enter') {
      event.preventDefault();
      commitEditing(true);
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
    }
  };

  const handleNoteDoubleClick = (event: MouseEvent<HTMLElement>): void => {
    if (event.target === event.currentTarget) {
      createValueAndEdit(event);
    }
  };

  return (
    <section className="parametric-values-note" onContextMenu={stopFlowEvent} onDoubleClick={handleNoteDoubleClick}>
      {noteHandlePositions.map((handle) => (
        <Handle
          className="parametric-note-handle"
          id={handle.id}
          key={handle.id}
          position={handle.position}
          type="target"
        />
      ))}
      <div className="parametric-values-list" onDoubleClick={handleNoteDoubleClick}>
        {visibleValues.length === 0 ? (
          <span className="muted-attribute" onDoubleClick={createValueAndEdit}>
            Sin valores
          </span>
        ) : (
          visibleValues.map((value) =>
            editingValueId === value.id && draft !== null ? (
              <div
                className="parametric-value-editor"
                key={value.id}
                onBlur={handleBlur}
                onClick={stopFlowEvent}
                onContextMenu={stopFlowEvent}
                onDoubleClick={stopFlowEvent}
                onMouseDown={stopFlowEvent}
              >
                <input
                  ref={inputRef}
                  aria-label="Valor paramétrico"
                  value={draft.value}
                  onChange={(event) => {
                    const nextDraft = { ...draft, value: event.target.value };
                    setCurrentDraft(nextDraft);
                    const currentValues = getValuesWithDraft(nextDraft);
                    updateValues(
                      currentValues.map((currentValue) =>
                        currentValue.id === draft.id
                          ? { id: nextDraft.id, value: nextDraft.value }
                          : currentValue,
                      ),
                    );
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="valor"
                />
              </div>
            ) : (
              <div className="parametric-value-row" key={value.id} onDoubleClick={(event) => startEditing(value, event)}>
                {value.value}
              </div>
            ),
          )
        )}
      </div>
    </section>
  );
}

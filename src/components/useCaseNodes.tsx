import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent, type KeyboardEvent } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from 'reactflow';
import type { UseCaseNodeData } from '../types/diagram';

const sideHandles = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
] as const;

function EditableName({
  className,
  id,
  multiline = false,
  name,
  onRename,
}: {
  className: string;
  id: string;
  multiline?: boolean;
  name: string;
  onRename?: (nodeId: string, name: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(name.length === 0);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isEditing) return undefined;
    // React Flow keeps a new node hidden until it has measured it, and focus()
    // on a hidden field does nothing — so a new use case never took the name
    // being typed. Retry for a few frames until the field really has focus.
    let frame = 0;
    let attempts = 0;
    const focusField = (): void => {
      const field = inputRef.current;
      if (!field) return;
      field.focus();
      if (document.activeElement === field) {
        field.select();
        return;
      }
      if (attempts++ < 12) frame = requestAnimationFrame(focusField);
    };
    focusField();
    return () => cancelAnimationFrame(frame);
  }, [isEditing]);

  const commit = (): void => {
    const cleanName = draft.trim() || 'Sin nombre';
    onRename?.(id, cleanName);
    setDraft(cleanName);
    setIsEditing(false);
  };

  const cancel = (): void => {
    setDraft(name);
    setIsEditing(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    event.stopPropagation();

    if (event.key === 'Enter' && (!multiline || !event.shiftKey)) {
      event.preventDefault();
      commit();
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  };

  if (isEditing) {
    const commonProps = {
      className: `${className}-input nodrag`,
      onBlur: commit,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value),
      onClick: (event: MouseEvent<HTMLElement>) => event.stopPropagation(),
      onDoubleClick: (event: MouseEvent<HTMLElement>) => event.stopPropagation(),
      onKeyDown: handleKeyDown,
      onMouseDown: (event: MouseEvent<HTMLElement>) => event.stopPropagation(),
      ref: inputRef as never,
      value: draft,
    };

    return multiline ? <textarea rows={2} {...commonProps} /> : <input {...commonProps} />;
  }

  return (
    <div
      className={`${className} nodrag`}
      onDoubleClick={(event) => {
        event.stopPropagation();
        setDraft(name);
        setIsEditing(true);
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {name || 'Sin nombre'}
    </div>
  );
}

/**
 * How a node takes relations. The four side handles are kept only so edges
 * saved by the first version (and read by it) still resolve; lines are drawn
 * floating, from outline to outline. To connect, drag the round nub that shows
 * on hover and drop anywhere on the other node: the whole node is the target.
 */
function ConnectionHandles({ kind }: { kind: 'actor' | 'use-case' }) {
  return (
    <>
      {sideHandles.map((handle) => (
        <Handle className="use-case-handle-legacy" id={handle.id} isConnectable={false} key={handle.id} position={handle.position} type="source" />
      ))}
      {sideHandles.map((handle) => (
        <Handle className="use-case-handle-legacy" id={handle.id} isConnectable={false} key={`${handle.id}-target`} position={handle.position} type="target" />
      ))}
      <Handle className="use-case-drop-zone" id="body" position={Position.Top} type="target" />
      <Handle
        className={`use-case-connect-nub is-${kind}`}
        id="connect"
        position={Position.Right}
        title={kind === 'actor' ? 'Arrastrá hasta un caso de uso para asociarlo' : 'Arrastrá hasta otro caso de uso o un actor'}
        type="source"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M3 8h9M9 5l3 3-3 3" /></svg>
      </Handle>
    </>
  );
}

const connectClass = (state: UseCaseNodeData['connectState']): string =>
  state === undefined ? '' : `is-connect-${state}`;

export function UseCaseActorNode({ data, id }: NodeProps<UseCaseNodeData>) {
  return (
    <div
      className={`use-case-actor-node ${connectClass(data.connectState)}`}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        data.onOpenContextMenu?.(id, event);
      }}
    >
      <ConnectionHandles kind="actor" />
      <div className="actor-symbol-frame">
        <svg className="actor-symbol" viewBox="0 0 72 92" aria-hidden="true">
          <circle cx="36" cy="15" r="12" />
          <path d="M36 27v34M14 39h44M36 61 18 88M36 61l18 27" />
        </svg>
      </div>
      <EditableName className="use-case-actor-name" id={id} name={data.name} onRename={data.onRename} />
    </div>
  );
}

export function UseCaseOvalNode({ data, id }: NodeProps<UseCaseNodeData>) {
  return (
    <div
      className={`use-case-oval-node ${connectClass(data.connectState)}`}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        data.onOpenContextMenu?.(id, event);
      }}
    >
      <ConnectionHandles kind="use-case" />
      <EditableName className="use-case-oval-name" id={id} multiline name={data.name} onRename={data.onRename} />
    </div>
  );
}

export function SystemBoundaryNode({ data, id, selected }: NodeProps<UseCaseNodeData>) {
  return (
    <div
      className="system-boundary-node"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        data.onOpenContextMenu?.(id, event);
      }}
    >
      <NodeResizer color="var(--button-active-background, #22577a)" isVisible={selected} minHeight={180} minWidth={260} />
      <EditableName className="system-boundary-name" id={id} name={data.name} onRename={data.onRename} />
    </div>
  );
}

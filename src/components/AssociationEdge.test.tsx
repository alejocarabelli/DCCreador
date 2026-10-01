import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { Position, ReactFlowProvider } from 'reactflow';
import { describe, expect, it, vi } from 'vitest';
import { normalizeAssociationData } from '../utils/association';
import { AssociationEdge } from './AssociationEdge';

// Keep portal content visible during server rendering; the edge and its labels
// still use the real React Flow provider and components.
vi.mock('reactflow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('reactflow')>();
  return {
    ...actual,
    EdgeLabelRenderer: ({ children }: { children: ReactNode }) => children,
  };
});

describe('association endpoint roles', () => {
  it.each([Position.Left, Position.Right, Position.Top, Position.Bottom])(
    'keeps both role labels clear of reconnection anchors on the %s side',
    (position) => {
      const sourceY = 100;
      const targetY = 300;
      const html = renderToString(
        <ReactFlowProvider>
          <AssociationEdge
            id="association"
            source="source"
            target="target"
            selected
            sourceX={100}
            sourceY={sourceY}
            targetX={500}
            targetY={targetY}
            sourcePosition={position}
            targetPosition={position}
            data={normalizeAssociationData({ sourceRole: 'propietario', targetRole: 'clienteAsociado' })}
          />
        </ReactFlowProvider>,
      );
      const roleStyles = [...html.matchAll(/class="[^"]*association-role-label[^"]*"[^>]*style="([^"]*)"/g)]
        .map((match) => match[1]);

      expect(roleStyles).toHaveLength(2);
      expect(html).toContain('Editar rol de origen');
      expect(html).toContain('Editar rol de destino');

      // React Flow shifts each updater 12px outward. Allow a 40px-tall role
      // editor as well as the visible 8px updater radius.
      const anchorOffsetY = position === Position.Top ? -12 : position === Position.Bottom ? 12 : 0;
      roleStyles.forEach((style, index) => {
        const roleY = Number(style.match(/(?:^|;)top:([^;]+)px/)?.[1]);
        const anchorY = (index === 0 ? sourceY : targetY) + anchorOffsetY;

        expect(Math.abs(roleY - anchorY)).toBeGreaterThan(40 / 2 + 8);
      });
    },
  );
});

describe('association UML markers', () => {
  it.each(['source', 'target'] as const)('places the inheritance triangle at the configured %s endpoint', (triangleEnd) => {
    const html = renderToString(
      <ReactFlowProvider>
        <AssociationEdge
          id="inheritance" source="child" target="parent"
          sourceX={100} sourceY={100} targetX={500} targetY={100}
          sourcePosition={Position.Right} targetPosition={Position.Left}
          data={normalizeAssociationData({ relationType: 'generalization', triangleEnd })}
        />
      </ReactFlowProvider>,
    );
    const tip = html.match(/<polygon[^>]*points="([^ ]+)/)?.[1];

    expect(tip).toBe(triangleEnd === 'source' ? '100,100' : '500,100');
  });

  it('keeps saved inheritances without a triangle end pointing at the destination', () => {
    // Older diagrams stored the default diamondEnd "source" while the triangle was drawn at the target.
    const html = renderToString(
      <ReactFlowProvider>
        <AssociationEdge
          id="saved" source="child" target="parent"
          sourceX={100} sourceY={100} targetX={500} targetY={100}
          sourcePosition={Position.Right} targetPosition={Position.Left}
          data={normalizeAssociationData({ relationType: 'generalization', diamondEnd: 'source' })}
        />
      </ReactFlowProvider>,
    );

    expect(html.match(/<polygon[^>]*points="([^ ]+)/)?.[1]).toBe('500,100');
  });

  it('keeps a realization triangle at the destination regardless of the unused diamond setting', () => {
    const html = renderToString(
      <ReactFlowProvider>
        <AssociationEdge
          id="realization" source="implementation" target="interface"
          sourceX={100} sourceY={100} targetX={500} targetY={100}
          sourcePosition={Position.Right} targetPosition={Position.Left}
          data={normalizeAssociationData({ relationType: 'realization', diamondEnd: 'source' })}
        />
      </ReactFlowProvider>,
    );

    expect(html.match(/<polygon[^>]*points="([^ ]+)/)?.[1]).toBe('500,100');
  });
});

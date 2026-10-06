import type { ButtonHTMLAttributes, MouseEvent, ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AssociationLineStyleToolbar, AssociationMultiplicityChips } from './AssociationQuickControls';

type ButtonElement = ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>;

describe('association quick controls', () => {
  it.each(['source', 'target'] as const)('assigns and clears a %s multiplicity by clicking the same chip', (end) => {
    const onChange = vi.fn();
    const props = { end, value: '', style: {}, onChange };
    const chips = AssociationMultiplicityChips(props);
    const button = (chips.props.children as ButtonElement[]).find(chip => chip.props.children === '1..*')!;

    button.props.onClick?.({} as MouseEvent<HTMLButtonElement>);
    expect(onChange).toHaveBeenLastCalledWith('1..*');

    const updated = AssociationMultiplicityChips({ ...props, value: '1..*' });
    const activeButton = (updated.props.children as ButtonElement[]).find(chip => chip.props.children === '1..*')!;
    expect(activeButton.props['aria-pressed']).toBe(true);
    activeButton.props.onClick?.({} as MouseEvent<HTMLButtonElement>);
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('changes the line style through the association callback and clears waypoints', () => {
    const onUpdateAssociation = vi.fn();
    const toolbar = AssociationLineStyleToolbar({ edgeId: 'edge', lineStyle: 'orthogonal', style: {}, onUpdateAssociation });
    const buttons = toolbar.props.children as ButtonElement[];
    const straight = buttons.find(button => button.props['aria-label'] === 'Recto')!;
    const orthogonal = buttons.find(button => button.props['aria-label'] === 'Con codos')!;
    expect(straight.props['aria-pressed']).toBe(false);
    expect(orthogonal.props['aria-pressed']).toBe(true);
    straight.props.onClick?.({} as MouseEvent<HTMLButtonElement>);
    expect(onUpdateAssociation).toHaveBeenLastCalledWith('edge', { lineStyle: 'straight', waypoints: [] });
    orthogonal.props.onClick?.({} as MouseEvent<HTMLButtonElement>);
    expect(onUpdateAssociation).toHaveBeenLastCalledWith('edge', { lineStyle: 'orthogonal', waypoints: [] });
  });

  it('stops canvas mouse events in both control groups', () => {
    const groups = [
      AssociationLineStyleToolbar({ edgeId: 'edge', lineStyle: 'orthogonal', style: {} }),
      AssociationMultiplicityChips({ end: 'source', value: '', style: {}, onChange: vi.fn() }),
    ];
    for (const group of groups) {
      const event = { stopPropagation: vi.fn() };
      group.props.onMouseDown(event);
      group.props.onClick(event);
      group.props.onDoubleClick(event);
      expect(event.stopPropagation).toHaveBeenCalledTimes(3);
    }
  });

  it('provides all suggestions and accessible pressed states for a custom multiplicity', () => {
    const html = renderToString(<AssociationMultiplicityChips end="target" value="2..5" style={{}} onChange={vi.fn()} />);
    expect(html.match(/<button/g)).toHaveLength(5);
    expect(html).toContain('Multiplicidad de destino: 0..1');
    expect(html).toContain('Multiplicidad de destino: 0..*');
    expect(html).not.toContain('aria-pressed="true"');
  });
});

import { ChevronRight, PanelRightClose, PanelRightOpen, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

export type InspectorTone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'violet' | 'danger';

/**
 * The one inspector. Classes, use cases and sequences used to draw three
 * different right-hand panels (a floating toggle, no toggle at all, a toolbar
 * with a generic "Propiedades"); now every editor shows the same header —
 * plegar · qué es · cómo se llama · eliminar — in the same place, and folds
 * to the same slim rail.
 */
export function InspectorPanel({
  className = '',
  collapsed = false,
  onToggleCollapsed,
  kind,
  tone = 'neutral',
  title,
  actions,
  hidden,
  bodyId,
  bodyClassName = '',
  edge,
  children,
}: {
  className?: string;
  collapsed?: boolean;
  /** Without it the panel cannot fold. */
  onToggleCollapsed?: () => void;
  /** What is selected: "Clase", "Mensaje síncrono", "Fragmento alt"… */
  kind: string;
  tone?: InspectorTone;
  /** Its name, as it reads on the canvas. */
  title: string;
  actions?: ReactNode;
  hidden?: boolean;
  bodyId?: string;
  bodyClassName?: string;
  /** Rendered first, outside the header (the sequence panel's resize handle). */
  edge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label={`Propiedades: ${kind}`}
      className={`v2-inspector ${collapsed ? 'collapsed is-collapsed' : ''} ${className}`}
      hidden={hidden}
    >
      {collapsed ? null : edge}
      <header className="v2-inspector-header">
        {onToggleCollapsed ? (
          <button
            aria-controls={bodyId}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Mostrar propiedades' : 'Ocultar propiedades'}
            className="v2-tool v2-inspector-fold"
            title={collapsed ? 'Mostrar propiedades' : 'Ocultar propiedades'}
            type="button"
            onClick={onToggleCollapsed}
          >
            {collapsed ? <PanelRightOpen size={16} aria-hidden="true" /> : <PanelRightClose size={16} aria-hidden="true" />}
          </button>
        ) : null}
        {collapsed ? null : (
          <>
            <div className="v2-inspector-title">
              <span className="v2-inspector-kind" data-tone={tone}>{kind}</span>
              <h2 title={title}>{title}</h2>
            </div>
            {actions ? <div className="v2-inspector-actions">{actions}</div> : null}
          </>
        )}
      </header>
      {collapsed ? null : (
        <div className={`v2-inspector-body ${bodyClassName}`} id={bodyId}>
          {children}
        </div>
      )}
    </aside>
  );
}

/** The delete action every inspector header carries. */
export function InspectorDeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button aria-label={label} className="v2-tool is-danger" title={label} type="button" onClick={onClick}>
      <Trash2 size={15} aria-hidden="true" />
    </button>
  );
}

/**
 * A section of a panel. Plain sections always show; `collapsible` ones are a
 * native <details> with the same chevron everywhere, closed by default so the
 * rarely used options stay out of the way.
 */
export function PanelSection({
  title,
  collapsible = false,
  defaultOpen = false,
  actions,
  className = '',
  children,
}: {
  title: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  if (collapsible) {
    return (
      <details className={`v2-panel-section is-collapsible ${className}`} open={defaultOpen || undefined}>
        <summary>
          <ChevronRight className="v2-panel-section-chevron" size={14} aria-hidden="true" />
          <h3>{title}</h3>
        </summary>
        <div className="v2-panel-section-body">{children}</div>
      </details>
    );
  }
  return (
    <section className={`v2-panel-section ${className}`}>
      <header>
        <h3>{title}</h3>
        {actions}
      </header>
      <div className="v2-panel-section-body">{children}</div>
    </section>
  );
}

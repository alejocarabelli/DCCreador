import { Check, ChevronDown, ListChecks } from 'lucide-react';
import {
  useEffect,
  useRef,
  type ComponentType,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';

type IconComponent = ComponentType<{ size?: number | string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

/**
 * The one editor toolbar. Every editor fills the same three zones, so the hand
 * learns one layout: where am I and is it saved (start), what can I add
 * (center, the editor's own tools), and how do I check, look at and hand in
 * the work (end: Revisar · Vista · Exportar).
 */
export function EditorToolbar({
  toolbarRef,
  start,
  create,
  end,
  below,
}: {
  toolbarRef?: Ref<HTMLElement>;
  start: ReactNode;
  create?: ReactNode;
  end?: ReactNode;
  /** A contextual strip under the toolbar (multi-selection actions). */
  below?: ReactNode;
}) {
  return (
    <header className="v2-toolbar" ref={toolbarRef}>
      <div className="v2-toolbar-row">
        <div className="v2-toolbar-start">{start}</div>
        {create ? <div className="v2-toolbar-create" role="group" aria-label="Agregar">{create}</div> : null}
        {end ? <div className="v2-toolbar-end">{end}</div> : null}
      </div>
      {below}
    </header>
  );
}

export function ToolbarDivider() {
  return <span className="v2-toolbar-divider" aria-hidden="true" />;
}

type ToolButtonProps = {
  icon?: IconComponent;
  label: string;
  /** Shown next to the icon. Icon-only buttons still get the label as their name. */
  showLabel?: boolean;
  variant?: 'default' | 'primary';
  pressed?: boolean;
  shortcut?: string;
  disabled?: boolean;
  title?: string;
  className?: string;
  children?: ReactNode;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
};

export function ToolButton({
  icon: Icon,
  label,
  showLabel = false,
  variant = 'default',
  pressed,
  shortcut,
  disabled,
  title,
  className = '',
  children,
  onClick,
}: ToolButtonProps) {
  const tooltip = title ?? (shortcut ? `${label} (${shortcut})` : label);
  return (
    <button
      aria-label={showLabel ? undefined : label}
      aria-pressed={pressed}
      className={`v2-tool ${variant === 'primary' ? 'is-primary' : ''} ${showLabel ? 'has-label' : ''} ${pressed ? 'is-pressed' : ''} ${className}`}
      disabled={disabled}
      title={tooltip}
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {Icon ? <Icon size={16} aria-hidden="true" /> : null}
      {showLabel ? <span className="v2-tool-label">{label}</span> : null}
      {children}
    </button>
  );
}

/**
 * A toolbar menu. It is a native <details> so it opens with the keyboard and is
 * announced by VoiceOver without extra wiring; the component adds the rest a
 * menu needs: only one open at a time, closing on an outside click, on Escape
 * and after choosing an item.
 */
export function ToolMenu({
  icon: Icon,
  label,
  showLabel = true,
  align = 'end',
  className = '',
  panelClassName = '',
  disabled,
  title,
  badge,
  children,
}: {
  icon?: IconComponent;
  label: string;
  showLabel?: boolean;
  align?: 'start' | 'end';
  className?: string;
  panelClassName?: string;
  disabled?: boolean;
  title?: string;
  /** A small count after the label (e.g. linked sequences). */
  badge?: number;
  children: ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return undefined;
    const close = () => details.removeAttribute('open');
    const handleToggle = () => {
      if (!details.open) return;
      // Only one menu open in the whole window.
      document.querySelectorAll<HTMLDetailsElement>('details.v2-menu[open]').forEach((other) => {
        if (other !== details) other.removeAttribute('open');
      });
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (details.open && !details.contains(event.target as Node)) close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && details.open) {
        close();
        details.querySelector('summary')?.focus();
      }
    };
    details.addEventListener('toggle', handleToggle);
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      details.removeEventListener('toggle', handleToggle);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <details className={`toolbar-menu v2-menu ${className}`} ref={detailsRef}>
      <summary
        aria-disabled={disabled || undefined}
        aria-label={showLabel ? undefined : label}
        className={`v2-tool ${showLabel ? 'has-label' : ''}`}
        title={title ?? label}
        onClick={(event) => { if (disabled) event.preventDefault(); }}
      >
        {Icon ? <Icon size={16} aria-hidden="true" /> : null}
        {showLabel ? <span className="v2-tool-label">{label}</span> : null}
        {badge !== undefined ? <span className="v2-count">{badge}</span> : null}
        <ChevronDown className="v2-menu-chevron" size={13} aria-hidden="true" />
      </summary>
      <div
        className={`v2-menu-panel align-${align} ${panelClassName}`}
        role="menu"
        onClick={(event) => {
          const item = (event.target as HTMLElement).closest('[role^="menuitem"]');
          if (item && !item.hasAttribute('data-keep-open')) detailsRef.current?.removeAttribute('open');
        }}
      >
        {children}
      </div>
    </details>
  );
}

export function MenuItem({
  icon: Icon,
  children,
  shortcut,
  checked,
  disabled,
  danger,
  keepOpen,
  onSelect,
}: {
  icon?: IconComponent;
  children: ReactNode;
  shortcut?: string;
  /** When set the item is a toggle and shows a check mark. */
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  keepOpen?: boolean;
  onSelect: () => void;
}) {
  const isToggle = checked !== undefined;
  return (
    <button
      aria-checked={isToggle ? checked : undefined}
      className={`v2-menu-item ${danger ? 'is-danger' : ''}`}
      data-keep-open={keepOpen || undefined}
      disabled={disabled}
      role={isToggle ? 'menuitemcheckbox' : 'menuitem'}
      type="button"
      onClick={onSelect}
    >
      <span className="v2-menu-item-icon" aria-hidden="true">
        {isToggle ? (checked ? <Check size={14} /> : null) : Icon ? <Icon size={15} /> : null}
      </span>
      <span className="v2-menu-item-label">{children}</span>
      {shortcut ? <kbd className="v2-kbd">{shortcut}</kbd> : null}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="v2-menu-label" role="presentation">{children}</div>;
}

export function MenuSeparator() {
  return <hr className="v2-menu-separator" />;
}

/** A labelled control inside a menu (a select for numbering, a reference…). */
export function MenuField({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="v2-menu-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

/** Same button, same place, same counter in every editor that can check its work. */
export function ReviewButton({
  count,
  hasErrors = false,
  open,
  label = 'Revisar',
  onToggle,
}: {
  count: number;
  hasErrors?: boolean;
  open: boolean;
  label?: string;
  onToggle: () => void;
}) {
  return (
    <button
      aria-label={count > 0 ? `${label}: ${count} ${count === 1 ? 'observación' : 'observaciones'}` : label}
      aria-pressed={open}
      className={`v2-tool has-label v2-review ${open ? 'is-pressed' : ''} ${count > 0 ? (hasErrors ? 'has-errors' : 'has-warnings') : ''}`}
      title={`${label} el diagrama`}
      type="button"
      onClick={onToggle}
    >
      <ListChecks size={16} aria-hidden="true" />
      <span className="v2-tool-label">{label}</span>
      {count > 0 ? <span className="v2-count">{count}</span> : null}
    </button>
  );
}

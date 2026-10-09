import type { ReactNode } from 'react';

type CanvasStartCardProps = {
  title: string;
  children: ReactNode;
  /** A second line under the description, for what the card is about (e.g. the linked sequence). */
  note?: ReactNode;
  action?: ReactNode;
};

/**
 * The first thing a visitor sees in an empty editor. Only the sequence diagram
 * had one; the class, use-case and flow editors opened to a bare dot grid with
 * no indication of what to do. One card, one heading, one primary action.
 */
export function CanvasStartCard({ title, children, note, action }: CanvasStartCardProps) {
  return (
    <div className="canvas-start-card" role="note">
      <h3>{title}</h3>
      <p>{children}</p>
      {note ? <p className="canvas-start-card-note">{note}</p> : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}

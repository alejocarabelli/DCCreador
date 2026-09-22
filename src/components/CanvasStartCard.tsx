import type { ReactNode } from 'react';

type CanvasStartCardProps = {
  title: string;
  children: ReactNode;
  action: ReactNode;
};

/**
 * The first thing a visitor sees in an empty editor. Only the sequence diagram
 * had one; the class, use-case and flow editors opened to a bare dot grid with
 * no indication of what to do. One card, one heading, one primary action.
 */
export function CanvasStartCard({ title, children, action }: CanvasStartCardProps) {
  return (
    <div className="canvas-start-card" role="note">
      <h3>{title}</h3>
      <p>{children}</p>
      <div>{action}</div>
    </div>
  );
}

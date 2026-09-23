import { Monitor, Moon, Sun } from 'lucide-react';
import type { ThemePreference } from '../hooks/useTheme';

const NEXT_PREFERENCE: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const PREFERENCE_LABEL: Record<ThemePreference, string> = {
  system: 'Tema: automático (según el sistema)',
  light: 'Tema: claro',
  dark: 'Tema: oscuro',
};

type ThemeToggleProps = {
  preference: ThemePreference;
  onChange: (preference: ThemePreference) => void;
  className?: string;
  showLabel?: boolean;
};

/** Cycles automático → claro → oscuro; the icon shows the current choice. */
export function ThemeToggle({ preference, onChange, className = 'icon-button', showLabel = false }: ThemeToggleProps) {
  const Icon = preference === 'dark' ? Moon : preference === 'light' ? Sun : Monitor;
  const label = PREFERENCE_LABEL[preference];
  const next = NEXT_PREFERENCE[preference];

  return (
    <button
      aria-label={`${label}. Cambiar a ${PREFERENCE_LABEL[next].replace('Tema: ', '')}`}
      className={`${className} theme-toggle`}
      data-preference={preference}
      title={label}
      type="button"
      onClick={() => onChange(next)}
    >
      <Icon aria-hidden="true" size={showLabel ? 15 : 18} />
      {showLabel ? (preference === 'dark' ? 'Oscuro' : preference === 'light' ? 'Claro' : 'Automático') : null}
    </button>
  );
}

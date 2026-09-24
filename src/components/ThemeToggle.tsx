import { Monitor, Moon, Sun } from 'lucide-react';
import type { ThemePreference } from '../hooks/useTheme';
import { MenuItem, MenuLabel, ToolMenu } from './ui/Toolbar';

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'system', label: 'Automático', icon: Monitor },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
];

type ThemeToggleProps = {
  preference: ThemePreference;
  onChange: (preference: ThemePreference) => void;
  showLabel?: boolean;
};

/**
 * Apariencia: a menu like every other one, opening upwards from the sidebar
 * footer. It replaces a button that cycled automático → claro → oscuro on
 * each click, where the next state was a guess.
 */
export function ThemeToggle({ preference, onChange, showLabel = false }: ThemeToggleProps) {
  const current = OPTIONS.find((option) => option.value === preference) ?? OPTIONS[0];
  return (
    <ToolMenu
      align="start"
      className="theme-toggle"
      direction="up"
      icon={current.icon}
      label={showLabel ? current.label : `Apariencia: ${current.label}`}
      showLabel={showLabel}
      title={`Apariencia: ${current.label}`}
    >
      <MenuLabel>Apariencia</MenuLabel>
      {OPTIONS.map((option) => (
        <MenuItem key={option.value} checked={preference === option.value} onSelect={() => onChange(option.value)}>
          {option.label}
          {option.value === 'system' ? <span className="v2-menu-item-hint">según macOS</span> : null}
        </MenuItem>
      ))}
    </ToolMenu>
  );
}

/** Pure helpers of the sidebar's project sections (sorting, filtering, split sizing). */

/** The «Filtrar proyectos» field only shows when a list is longer than this. */
export const SIDEBAR_FILTER_THRESHOLD = 6;

/** Pane geometry shared with the stylesheet (`.v2-pane-header` and `.v2-sidebar-row`). */
export const SIDEBAR_HEADER_HEIGHT = 28;
export const SIDEBAR_ROW_HEIGHT = 30;
export const SIDEBAR_PANE_MIN_ROWS = 3;
export const SIDEBAR_PANE_MIN_HEIGHT = SIDEBAR_HEADER_HEIGHT + SIDEBAR_PANE_MIN_ROWS * SIDEBAR_ROW_HEIGHT;

type RecentProject = { id: string; updatedAt: string };
type NamedProject = { name: string };

const timeOf = (isoDate: string): number => {
  const time = Date.parse(isoDate);
  return Number.isFinite(time) ? time : 0;
};

/** Every project but `excludeId`, most recently updated first; ties keep their original order. */
export const sortProjectsByRecency = <T extends RecentProject>(projects: readonly T[], excludeId: string | null = null): T[] =>
  projects
    .filter((project) => project.id !== excludeId)
    .map((project, index) => ({ index, project, time: timeOf(project.updatedAt) }))
    .sort((a, b) => b.time - a.time || a.index - b.index)
    .map(({ project }) => project);

/** Lower-cases and strips accents so «licitacion» finds «Licitación». */
export const normalizeSearchText = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

export const filterProjectsByName = <T extends NamedProject>(projects: readonly T[], query: string): T[] => {
  const needle = normalizeSearchText(query);
  return needle === '' ? [...projects] : projects.filter((project) => normalizeSearchText(project.name).includes(needle));
};

export const shouldShowProjectFilter = (count: number): boolean => count > SIDEBAR_FILTER_THRESHOLD;

/** Bounds, as fractions of the shared height, that keep both panes at `minPane` px or more. */
export const splitBounds = (availablePx: number, minPane: number = SIDEBAR_PANE_MIN_HEIGHT): { max: number; min: number } => {
  if (!Number.isFinite(availablePx) || availablePx <= 0 || availablePx < minPane * 2) return { max: 0.5, min: 0.5 };
  const min = minPane / availablePx;
  return { max: 1 - min, min };
};

/** Clamps the top pane's share so neither pane drops under `minPane` px. */
export const clampSplitFraction = (fraction: number, availablePx: number, minPane: number = SIDEBAR_PANE_MIN_HEIGHT): number => {
  const { max, min } = splitBounds(availablePx, minPane);
  if (!Number.isFinite(fraction)) return Math.min(max, Math.max(min, 0.5));
  return Math.min(max, Math.max(min, fraction));
};

/** Short date for a project row: «hoy», «ayer», «7 oct», or «7 oct 2025» for another year. */
export const formatShortProjectDate = (isoDate: string, now: Date = new Date()): string => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  const startOfDay = (value: Date): number => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  const parts = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((candidate) => candidate.type === type)?.value.replace(/\./g, '') ?? '';
  const dayMonth = `${part('day')} ${part('month')}`;
  return date.getFullYear() === now.getFullYear() ? dayMonth : `${dayMonth} ${date.getFullYear()}`;
};

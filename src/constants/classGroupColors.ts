/** The swatch tints the class header; the box itself stays in ink. */
export const CLASS_GROUP_COLORS = [
  { id: 'blue', label: 'Azul', swatch: '#719bc7' },
  { id: 'teal', label: 'Turquesa', swatch: '#63a7a5' },
  { id: 'green', label: 'Verde', swatch: '#83a475' },
  { id: 'amber', label: 'Ámbar', swatch: '#c3a061' },
  { id: 'violet', label: 'Violeta', swatch: '#9c8bc4' },
  { id: 'rose', label: 'Rosa', swatch: '#c38a9f' },
] as const;

export type ClassGroupColor = (typeof CLASS_GROUP_COLORS)[number]['id'];

export const isClassGroupColor = (value: unknown): value is ClassGroupColor =>
  CLASS_GROUP_COLORS.some(color => color.id === value);

export const getClassGroupColor = (id: ClassGroupColor | undefined) =>
  CLASS_GROUP_COLORS.find(color => color.id === id);

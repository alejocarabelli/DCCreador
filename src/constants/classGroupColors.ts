export const CLASS_GROUP_COLORS = [
  { id: 'blue', label: 'Azul', swatch: '#719bc7', border: '#97b5d5', name: '#305f8e', darkBorder: '#496c94', darkName: '#adcef2' },
  { id: 'teal', label: 'Turquesa', swatch: '#63a7a5', border: '#92c1be', name: '#286b68', darkBorder: '#417d79', darkName: '#9cd6cc' },
  { id: 'green', label: 'Verde', swatch: '#83a475', border: '#aec4a1', name: '#4c6e3e', darkBorder: '#5e7950', darkName: '#bed9a8' },
  { id: 'amber', label: 'Ámbar', swatch: '#c3a061', border: '#d6bf96', name: '#856326', darkBorder: '#8a7044', darkName: '#e6cb96' },
  { id: 'violet', label: 'Violeta', swatch: '#9c8bc4', border: '#bdb0d9', name: '#6c5196', darkBorder: '#72618f', darkName: '#cfbcec' },
  { id: 'rose', label: 'Rosa', swatch: '#c38a9f', border: '#d8b0bf', name: '#944f69', darkBorder: '#8f5f73', darkName: '#e8b8cc' },
] as const;

export type ClassGroupColor = (typeof CLASS_GROUP_COLORS)[number]['id'];

export const isClassGroupColor = (value: unknown): value is ClassGroupColor =>
  CLASS_GROUP_COLORS.some(color => color.id === value);

export const getClassGroupColor = (id: ClassGroupColor | undefined) =>
  CLASS_GROUP_COLORS.find(color => color.id === id);

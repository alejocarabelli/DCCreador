export const formatSequenceMessageChange = (count: number, change: 'incorporado' | 'liberado'): string =>
  `${count} ${count === 1 ? `mensaje ${change}` : `mensajes ${change}s`}`;

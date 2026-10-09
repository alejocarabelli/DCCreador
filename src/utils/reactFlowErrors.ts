/**
 * React Flow's own warnings, minus one false alarm. In development, React's
 * StrictMode runs every memo twice, and React Flow reads that as "you created a
 * new nodeTypes or edgeTypes object" (code 002) even though ours are defined
 * once, outside the components. The built app never shows it.
 */
export const handleReactFlowError = (code: string, message: string): void => {
  if (code === '002') return;
  console.warn(`[React Flow]: ${message}`);
};

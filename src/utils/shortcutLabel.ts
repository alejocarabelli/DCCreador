export const isMacPlatform = (): boolean =>
  /Mac|iPhone|iPad/.test(typeof navigator === 'undefined' ? 'Mac' : navigator.platform);

const MODIFIER_ORDER: Array<[glyph: string, name: string]> = [['⌃', 'Ctrl'], ['⌘', 'Ctrl'], ['⌥', 'Alt'], ['⇧', 'Mayús']];

/**
 * Shortcut hints are written the Mac way (`⇧⌘Z`, `⌘ clic`). Elsewhere the same
 * handlers answer to Ctrl, so the text is rewritten in the Windows convention:
 * `Ctrl+Mayús+Z`, `Ctrl+clic`. Any surrounding text is left as is.
 */
export const shortcutLabel = (text: string, mac: boolean = isMacPlatform()): string => {
  if (mac) return text;
  return text
    .replaceAll('Cmd+Shift+', 'Ctrl+Mayús+')
    .replace(/[⌃⌘⌥⇧]+ ?/g, (run) => {
      const names = [...new Set(MODIFIER_ORDER.filter(([glyph]) => run.includes(glyph)).map(([, name]) => name))];
      return `${names.join('+')}+`;
    })
    .replaceAll('↵', 'Enter')
    .replaceAll('⌫', 'Retroceso');
};

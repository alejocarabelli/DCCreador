/**
 * The family an export SVG asks for. It must match the name the Plex faces are
 * registered under in jsPDF (`pdfFonts.ts`), which stays out of the main bundle.
 */
export const PDF_FONT_FAMILY = 'IBM Plex Sans';

/**
 * Rounds a CSS weight to an embedded face: 400, 500, 600 or 700 upright and
 * 400 or 600 italic. svg2pdf falls back to Times for any face jsPDF lacks.
 */
export const toEmbeddedFontWeight = (weight: string, italic: boolean): string => {
  const numeric = weight === 'bold' || weight === 'bolder' ? 700
    : weight === 'normal' || weight === 'lighter' || weight === '' ? 400
      : Number(weight);
  if (!Number.isFinite(numeric) || numeric < 450) return 'normal';
  if (italic) return numeric < 550 ? 'normal' : '600';
  if (numeric < 550) return '500';
  if (numeric < 675) return '600';
  return 'bold';
};

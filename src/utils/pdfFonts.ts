import type { jsPDF } from 'jspdf';
import { PDF_FONT_FAMILY } from './pdfFontFamily';
import plex400 from '../assets/pdf-fonts/ibm-plex-sans-400-normal.ttf?inline';
import plex400Italic from '../assets/pdf-fonts/ibm-plex-sans-400-italic.ttf?inline';
import plex500 from '../assets/pdf-fonts/ibm-plex-sans-500-normal.ttf?inline';
import plex600 from '../assets/pdf-fonts/ibm-plex-sans-600-normal.ttf?inline';
import plex600Italic from '../assets/pdf-fonts/ibm-plex-sans-600-italic.ttf?inline';
import plex700 from '../assets/pdf-fonts/ibm-plex-sans-700-normal.ttf?inline';

/**
 * Plex faces embedded in PDFs, keyed the way svg2pdf asks jsPDF for a style:
 * 400 is "normal"/"italic", 700 is "bold", anything else is weight + style.
 * The files are the TTF versions of the @fontsource ones the app uses, so a
 * PDF shows the same letters as the canvas instead of falling back to Times.
 */
const faces: Array<{ style: string; data: string; file: string }> = [
  { style: 'normal', data: plex400, file: 'IBMPlexSans-Regular.ttf' },
  { style: 'italic', data: plex400Italic, file: 'IBMPlexSans-Italic.ttf' },
  { style: '500normal', data: plex500, file: 'IBMPlexSans-Medium.ttf' },
  { style: '600normal', data: plex600, file: 'IBMPlexSans-SemiBold.ttf' },
  { style: '600italic', data: plex600Italic, file: 'IBMPlexSans-SemiBoldItalic.ttf' },
  { style: 'bold', data: plex700, file: 'IBMPlexSans-Bold.ttf' },
];

const base64Of = (dataUrl: string): string => dataUrl.slice(dataUrl.indexOf(',') + 1);

export const registerPdfFonts = (document: jsPDF): void => {
  faces.forEach(({ style, data, file }) => {
    document.addFileToVFS(file, base64Of(data));
    document.addFont(file, PDF_FONT_FAMILY, style);
  });
};

/** The same faces as @font-face rules, for an SVG drawn as an image (PNG export). */
export const pdfFontFaceCss = (): string => faces.map(({ style, data }) => {
  const italic = style.endsWith('italic');
  const weight = style === 'bold' ? 700 : style === 'normal' || style === 'italic' ? 400 : Number.parseInt(style, 10);
  return `@font-face{font-family:'${PDF_FONT_FAMILY}';font-style:${italic ? 'italic' : 'normal'};font-weight:${weight};src:url(data:font/ttf;base64,${base64Of(data)}) format('truetype');}`;
}).join('');

import { saveBlob, saveDataUrl, type SaveOutcome } from './saveFile';
const textEncoder = new TextEncoder();

const encodeAscii = (value: string): Uint8Array => textEncoder.encode(value);

const dataUrlToBytes = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const concatBytes = (parts: Uint8Array[]): Uint8Array => {
  const totalLength = parts.reduce((length, part) => length + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });

  return result;
};

export const downloadDataUrl = (filename: string, dataUrl: string): Promise<SaveOutcome> => saveDataUrl(dataUrl, filename);

export const downloadBlob = (filename: string, blob: Blob): Promise<SaveOutcome> => saveBlob(blob, filename);

/**
 * A one-page PDF holding a JPEG. The page is `pageWidth` × `pageHeight` points
 * and the image may carry more pixels than that, which is what keeps it sharp.
 */
export const createPdfFromJpegDataUrl = (
  jpegDataUrl: string,
  imageWidth: number,
  imageHeight: number,
  pageWidth = imageWidth,
  pageHeight = imageHeight,
): Blob => {
  const imageBytes = dataUrlToBytes(jpegDataUrl);
  const width = pageWidth;
  const height = pageHeight;
  const contentStream = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`;
  const objects: Uint8Array[] = [
    encodeAscii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'),
    encodeAscii('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'),
    encodeAscii(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    ),
    concatBytes([
      encodeAscii(
        `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
      ),
      imageBytes,
      encodeAscii('\nendstream\nendobj\n'),
    ]),
    encodeAscii(`5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`),
  ];
  const header = encodeAscii('%PDF-1.4\n');
  const offsets: number[] = [];
  let currentOffset = header.length;

  objects.forEach((object) => {
    offsets.push(currentOffset);
    currentOffset += object.length;
  });

  const xrefOffset = currentOffset;
  const xref = encodeAscii(
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
      .map((offset) => `${String(offset).padStart(10, '0')} 00000 n `)
      .join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  const pdfBytes = concatBytes([header, ...objects, xref]);
  const pdfArrayBuffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(pdfArrayBuffer).set(pdfBytes);
  return new Blob([pdfArrayBuffer], { type: 'application/pdf' });
};

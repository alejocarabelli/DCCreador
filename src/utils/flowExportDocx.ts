import {
  splitRowByRefs,
  type FlowDocLine,
  type FlowDocTable,
  type FlowDocument,
  type FlowDocSegment,
} from './flowDocument';
import { createZip } from './zipStore';

/*
 * Word export: the same two-column specification table and Actor / Sistema /
 * Ref. tables the course documents use, in Arial 10 on A4 landscape.
 */

const PAGE_WIDTH = 16838;
const PAGE_HEIGHT = 11906;
const MARGIN = 720;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LABEL_WIDTH = 1900;
const REF_WIDTH = 1300;
const ACTOR_WIDTH = 3700;
const SYSTEM_WIDTH = CONTENT_WIDTH - REF_WIDTH - ACTOR_WIDTH;
const DEPTH_INDENT = 380;
const BULLETS = ['●', '○', '■'];

const escapeXml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const run = (segment: FlowDocSegment, forceBold = false): string => {
  const properties = [
    forceBold || segment.bold ? '<w:b/>' : '',
    segment.italic ? '<w:i/>' : '',
    segment.underline ? '<w:u w:val="single"/>' : '',
  ].join('');
  return `<w:r>${properties.length > 0 ? `<w:rPr>${properties}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(segment.text)}</w:t></w:r>`;
};

const paragraph = (inner: string, options: { align?: 'center'; hanging?: number; left?: number } = {}): string => {
  const properties = [
    options.align === 'center' ? '<w:jc w:val="center"/>' : '',
    options.left !== undefined ? `<w:ind w:left="${options.left}" w:hanging="${options.hanging ?? 0}"/>` : '',
  ].join('');
  return `<w:p>${properties.length > 0 ? `<w:pPr>${properties}</w:pPr>` : ''}${inner}</w:p>`;
};

const markerWidth = (marker: string): number => Math.max(300, marker.length * 105 + 140);

const lineParagraph = (line: FlowDocLine): string => {
  const marker = line.number ?? (line.bullet !== undefined ? BULLETS[line.bullet] : undefined);
  const text = line.segments.map((segment) => run(segment, line.bold)).join('');

  if (marker === undefined) {
    return paragraph(text, { left: line.depth * DEPTH_INDENT, hanging: 0 });
  }

  const hanging = markerWidth(marker);
  return paragraph(`${run({ text: marker }, line.bold)}<w:r><w:tab/></w:r>${text}`, {
    left: line.depth * DEPTH_INDENT + hanging,
    hanging,
  });
};

const cellParagraphs = (lines: FlowDocLine[]): string =>
  lines.length === 0 ? paragraph('') : lines.map(lineParagraph).join('');

const cell = (
  width: number,
  inner: string,
  options: { fill?: string; mergeContinue?: boolean; mergeStart?: boolean; noBottom?: boolean; noTop?: boolean; span?: number } = {},
): string => {
  const borders = [
    options.noTop ? '<w:top w:val="nil"/>' : '',
    options.noBottom ? '<w:bottom w:val="nil"/>' : '',
  ].join('');
  const properties = [
    `<w:tcW w:w="${width}" w:type="dxa"/>`,
    options.span !== undefined ? `<w:gridSpan w:val="${options.span}"/>` : '',
    options.mergeStart ? '<w:vMerge w:val="restart"/>' : options.mergeContinue ? '<w:vMerge/>' : '',
    borders.length > 0 ? `<w:tcBorders>${borders}</w:tcBorders>` : '',
    options.fill !== undefined ? `<w:shd w:val="clear" w:color="auto" w:fill="${options.fill}"/>` : '',
  ].join('');
  return `<w:tc><w:tcPr>${properties}</w:tcPr>${options.mergeContinue ? paragraph('') : inner}</w:tc>`;
};

const table = (widths: number[], rows: string[]): string => `
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="${widths.reduce((total, width) => total + width, 0)}" w:type="dxa"/>
    <w:tblLayout w:type="fixed"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="6" w:color="000000"/><w:left w:val="single" w:sz="6" w:color="000000"/>
      <w:bottom w:val="single" w:sz="6" w:color="000000"/><w:right w:val="single" w:sz="6" w:color="000000"/>
      <w:insideH w:val="single" w:sz="6" w:color="000000"/><w:insideV w:val="single" w:sz="6" w:color="000000"/>
    </w:tblBorders>
    <w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar>
  </w:tblPr>
  <w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>
  ${rows.join('\n')}
</w:tbl>`;

const tableRow = (cells: string[], header = false): string =>
  `<w:tr>${header ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' : ''}${cells.join('')}</w:tr>`;

const descriptionTable = (document: FlowDocument): string =>
  table(
    [LABEL_WIDTH, CONTENT_WIDTH - LABEL_WIDTH],
    document.fields.map((field) =>
      tableRow([
        cell(LABEL_WIDTH, paragraph(run({ text: field.label }))),
        cell(CONTENT_WIDTH - LABEL_WIDTH, cellParagraphs(field.lines)),
      ]),
    ),
  );

const flowTable = (flowTable: FlowDocTable): string => {
  const widths = [ACTOR_WIDTH, SYSTEM_WIDTH, REF_WIDTH];
  const rows = [
    tableRow([cell(CONTENT_WIDTH, paragraph(run({ text: flowTable.title, bold: true }), { align: 'center' }), { span: 3, fill: 'F2F2F2' })], true),
    tableRow([
      cell(ACTOR_WIDTH, paragraph(run({ text: 'ACTOR', bold: true }), { align: 'center' })),
      cell(SYSTEM_WIDTH, paragraph(run({ text: 'SISTEMA', bold: true }), { align: 'center' })),
      cell(REF_WIDTH, paragraph(run({ text: 'REF.', bold: true }))),
    ], true),
  ];

  flowTable.rows.forEach((row) => {
    const parts = splitRowByRefs(row);
    parts.forEach((part, index) => {
      const first = index === 0;
      const last = index === parts.length - 1;
      const merged = parts.length > 1;
      rows.push(tableRow([
        cell(ACTOR_WIDTH, cellParagraphs(part.actor), { mergeStart: merged && first, mergeContinue: merged && !first }),
        cell(SYSTEM_WIDTH, cellParagraphs(part.system), { noTop: !first, noBottom: !last }),
        cell(REF_WIDTH, paragraph(part.ref.length > 0 ? run({ text: part.ref }) : ''), { noTop: !first, noBottom: !last }),
      ]));
    });
  });

  return table(widths, rows);
};

const spacer = paragraph('');

const buildDocumentXml = (document: FlowDocument): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
${descriptionTable(document)}
${spacer}
${flowTable(document.basic)}
${document.alternatives.map((alternative) => `${spacer}${flowTable(alternative)}`).join('\n')}
${spacer}
<w:sectPr>
  <w:pgSz w:w="${PAGE_WIDTH}" w:h="${PAGE_HEIGHT}" w:orient="landscape"/>
  <w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}" w:header="360" w:footer="360" w:gutter="0"/>
</w:sectPr>
</w:body>
</w:document>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="es-AR"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

export const createFlowDocx = (document: FlowDocument): Blob => {
  const bytes = createZip([
    { name: '[Content_Types].xml', data: contentTypesXml },
    { name: '_rels/.rels', data: rootRelsXml },
    { name: 'word/document.xml', data: buildDocumentXml(document) },
    { name: 'word/styles.xml', data: stylesXml },
    { name: 'word/_rels/document.xml.rels', data: documentRelsXml },
  ]);
  return new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
};

export const buildFlowDocumentXml = buildDocumentXml;

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { FormPayloadSchema, receivingLineTotal, type FormKind, type FormPayload } from './receiving-forms';

const escape = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function setCell(xml: string, address: string, value: string | number) {
  const pattern = new RegExp(`<c\\b([^>]*\\br="${address}"[^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  const original = xml.match(pattern);
  const attrs = (original?.[1] || ` r="${address}"`).replace(/\s+t="[^"]*"/g, '');
  const cell = typeof value === 'number' ? `<c${attrs}><v>${value}</v></c>` : `<c${attrs} t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;
  if (original) return xml.replace(pattern, () => cell);
  const row = address.match(/\d+/)![0];
  return xml.replace(new RegExp(`(<row\\b[^>]*\\br="${row}"[^>]*>)([\\s\\S]*?)(</row>)`), (_, open, body, close) => open + body + cell + close);
}
function chunks(value: string, width: number): string[] {
  const lines: string[] = [];
  for (const line of value.split(/\r?\n/)) {
    const chars = Array.from(line);
    do {
      let length = Math.min(width, chars.length);
      if (chars.length > width) { const space = chars.slice(0, width+1).lastIndexOf(' '); if (space >= width/2) length = space; }
      lines.push(chars.splice(0, length).join('').trimEnd());
      while (chars[0] === ' ') chars.shift();
    } while (chars.length);
  }
  return lines;
}
function rows(payload: FormPayload, kind: FormKind) {
  return payload.items.map(item => {
    const descriptions = chunks(item.description, kind === 'RR' ? 30 : 40);
    const remarks = chunks(item.remarks, 18);
    return Array.from({ length: Math.max(descriptions.length, kind === 'MR' ? remarks.length : 1) }, (_, i) => ({ ...item, description: descriptions[i] || '', remarks: remarks[i] || '', continuation: i > 0 }));
  });
}

/** Fill a trusted, bundled DMC template; untrusted strings are always inline text. */
export async function exportReceivingForm(kind: FormKind, raw: FormPayload, context: { id: string; version: number; copies?: 2 | 3 }): Promise<Uint8Array> {
  const payload = FormPayloadSchema.parse(raw);
  const files = unzipSync(await readFile(path.join(process.cwd(), 'src', 'templates', 'receiving', `${kind}.xlsx`)));
  const template = strFromU8(files['xl/worksheets/sheet1.xml']);
  const capacity = kind === 'RR' ? 14 : 9;
  const pages: ReturnType<typeof rows> = [];
  let current: ReturnType<typeof rows>[number] = [];
  for (const group of rows(payload, kind)) {
    if (current.length && current.length + group.length > capacity) { pages.push(current); current = []; }
    while (group.length > capacity) pages.push(group.splice(0, capacity));
    current.push(...group);
  }
  if (current.length) pages.push(current);
  const count = pages.length;
  const printSheets = context.copies === 3
    ? [...pages.map(items => ({ items, thirdCopy: false })), ...pages.map(items => ({ items, thirdCopy: true }))]
    : pages.map(items => ({ items, thirdCopy: false }));
  const styles = strFromU8(files['xl/styles.xml']);
  const baseStyles = styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)![1].match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)!;
  const fittedStyles: string[] = [], fittedIds = new Map<number, number>();
  function fit(xml: string, address: string): string {
    return xml.replace(new RegExp(`(<c\\b[^>]*\\br="${address}")([^>]*)(>)`), (_, open, attrs, close) => {
      const base = Number(attrs.match(/\bs="(\d+)"/)?.[1] || 0);
      if (!fittedIds.has(base)) {
        const match = baseStyles[base].match(/<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/)!;
        const attributes = match[1].replace(/\s+applyAlignment="[^"]*"/, '');
        const children = match[2] || '';
        const alignment = children.match(/<alignment\b[^>]*\/>/);
        const replacement = alignment ? alignment[0].replace(/\s+(?:wrapText|shrinkToFit)="[^"]*"/g, '').replace('/>', ' shrinkToFit="1"/>') : '<alignment shrinkToFit="1"/>';
        fittedIds.set(base, baseStyles.length + fittedStyles.length);
        fittedStyles.push(`<xf${attributes} applyAlignment="1">${alignment ? children.replace(alignment[0], replacement) : children + replacement}</xf>`);
      }
      return open + attrs.replace(/\s+s="\d+"/, '') + ` s="${fittedIds.get(base)}"` + close;
    });
  }
  let sheets = '', relations = '', printAreas = '';
  let types = strFromU8(files['[Content_Types].xml']).replace(/<Override PartName="\/xl\/worksheets\/sheet1.xml"[^>]*\/>/, '');
  for (const [page, { items: selected, thirdCopy }] of printSheets.entries()) {
    let xml = template;
    const put = (address: string, value: string | number, fitted = false) => { xml = setCell(xml, address, value); if (fitted) xml = fit(xml, address); };
    for (let copy = 0; copy < (thirdCopy ? 1 : 2); copy++) {
      if (kind === 'RR') {
        const o = copy * 34;
        for (const [address, value] of Object.entries({ [`C${7+o}`]: payload.supplier, [`C${8+o}`]: payload.employee, [`C${9+o}`]: payload.department, [`F${7+o}`]: payload.number, [`F${8+o}`]: payload.date, [`F${9+o}`]: payload.poReference, [`G${9+o}`]: payload.rivReference, [`A${31+o}`]: payload.preparedBy, [`C${31+o}`]: payload.receivedBy, [`D${31+o}`]: payload.centralOfficer })) put(address, value);
      } else {
        const o = copy * 35, s = copy * 34;
        for (const [address, value] of Object.entries({ [`H${7+o}`]: payload.date, [`H${8+o}`]: payload.number, [`H${9+o}`]: payload.rivReference, [`H${10+o}`]: payload.poReference, [`A${13+o}`]: `I am responsible for this property, which will be used in the Office of ${payload.department}.`, [`B${30+s}`]: [payload.receivedBy, payload.designation].filter(Boolean).join(' / '), [`G${30+s}`]: payload.centralOfficer, [`B${33+s}`]: payload.issuedBy, [`G${33+s}`]: payload.administrator })) put(address, value);
      }
      selected.forEach((item, index) => {
        const r = (kind === 'RR' ? 14 + copy * 34 : 16 + copy * 35) + index;
        put(`C${r}`, (index === 0 && item.continuation ? '(continued) ' : '') + item.description, true);
        if (kind === 'MR') put(`H${r}`, item.remarks, true);
        if (item.continuation) return;
        put(`A${r}`, item.quantity === '' ? '' : Number(item.quantity)); put(`B${r}`, item.unit);
        if (kind === 'RR') { put(`D${r}`, item.invoiceQuantity === '' ? '' : Number(item.invoiceQuantity)); put(`E${r}`, item.receivedQuantity === '' ? '' : Number(item.receivedQuantity)); }
        put(`F${r}`, item.unitCost === '' ? '' : Number(item.unitCost));
        const quantity = kind === 'RR' ? item.receivedQuantity : item.quantity;
        const total = receivingLineTotal(quantity, item.unitCost);
        put(`G${r}`, total === '' ? '' : Number(total));
      });
    }
    // New values may introduce previously absent cells; Excel expects column order.
    xml = xml.replace(/(<row\b[^>]*(?<!\/)>)([\s\S]*?)(<\/row>)/g, (_, open, body, close) => {
      const cells: string[] = body.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || [];
      const column = (cell: string) => Array.from(cell.match(/\br="([A-Z]+)/)![1]).reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0);
      return open + cells.sort((a,b) => column(a) - column(b)).join('') + close;
    });
    if (context.copies === 3) {
      xml = xml.replace(/<pageSetup\b[^>]*\/>/, tag => tag.replace(/\s+copies="\d+"/, '').replace('/>', ' copies="1"/>'));
    }
    xml = xml.replace(/<headerFooter\b[^>]*>[\s\S]*?<\/headerFooter>/, '');
    const copyNote = context.copies === 3 ? thirdCopy ? ' / copy 3' : ' / copies 1 and 2' : '';
    const footer = `<headerFooter><oddFooter>${escape(`CPATS ${context.id} / revision ${context.version} / page ${page % count + 1} of ${count}${copyNote} / unsigned export`)}</oddFooter></headerFooter>`;
    xml = xml.includes('<rowBreaks') ? xml.replace('<rowBreaks', footer + '<rowBreaks') : xml.replace('</worksheet>', footer + '</worksheet>');
    files[`xl/worksheets/sheet${page+1}.xml`] = strToU8(xml);
    const name = thirdCopy ? `${kind}-copy-3-${page % count + 1}` : `${kind}-${page+1}`;
    sheets += `<sheet name="${name}" sheetId="${page+1}" r:id="sheet${page+1}"/>`;
    relations += `<Relationship Id="sheet${page+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${page+1}.xml"/>`;
    const printArea = kind === 'RR' ? (thirdCopy ? '$A$1:$G$32' : '$A$1:$G$66') : (thirdCopy ? '$A$1:$I$34' : '$A$1:$I$68');
    printAreas += `<definedName name="_xlnm.Print_Area" localSheetId="${page}">'${name}'!${printArea}</definedName>`;
    types = types.replace('</Types>', `<Override PartName="/xl/worksheets/sheet${page+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
  }
  files['[Content_Types].xml'] = strToU8(types);
  // Only item cells are fitted; static instructions/signature captions retain their original size.
  files['xl/styles.xml'] = strToU8(styles.replace(/(<cellXfs\b[^>]*>)([\s\S]*?)(<\/cellXfs>)/, (_, open, body, close) => open.replace(/count="\d+"/, `count="${baseStyles.length + fittedStyles.length}"`) + body + fittedStyles.join('') + close));
  files['xl/workbook.xml'] = strToU8(strFromU8(files['xl/workbook.xml']).replace(/<sheets>[\s\S]*?<\/sheets>/, `<sheets>${sheets}</sheets>`).replace(/<definedNames>[\s\S]*?<\/definedNames>/, `<definedNames>${printAreas}</definedNames>`));
  files['xl/_rels/workbook.xml.rels'] = strToU8(strFromU8(files['xl/_rels/workbook.xml.rels']).replace(/<Relationship\b[^>]*Type="[^"]*\/worksheet"[^>]*\/>/g, '').replace('</Relationships>', relations + '</Relationships>'));
  return zipSync(files, { level: 6 });
}

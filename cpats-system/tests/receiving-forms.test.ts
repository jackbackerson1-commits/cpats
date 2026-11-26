import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FormPayloadSchema, prefillReceivingForm, receivingLineTotal } from '../src/shared/receiving-forms';
import { exportReceivingForm } from '../src/shared/receiving-form-excel';
import { unzipSync, strFromU8 } from 'fflate';

test('prefill preserves descriptions but never invents receipt, MR assignment, signatures or credit prices', () => {
  const source = { poNumber: 'PO-123', paymentType: 'CREDIT_TERMS', purchaseRequest: { department: { name: 'Science' }, itemsPayload: [{ itemName: 'Monitor', specifications: '24 inch', quantity: 3, unitPrice: 0 }] } };
  const rr = prefillReceivingForm('RR', source);
  assert.equal(rr.poReference, 'PO-123'); assert.equal(rr.department, 'Science');
  assert.equal(rr.items[0].quantity, '3'); assert.equal(rr.items[0].receivedQuantity, '');
  assert.equal(rr.items[0].unitCost, ''); assert.equal(rr.receivedBy, '');
  assert.equal(prefillReceivingForm('MR', source).items[0].quantity, '');
  assert.equal(FormPayloadSchema.safeParse(rr).success, true);
  assert.equal(FormPayloadSchema.safeParse({ ...rr, approved: true }).success, false);
  assert.equal(FormPayloadSchema.safeParse({ ...rr, items: [{ ...rr.items[0], quantity: '-1' }] }).success, false);
});

test('the three-copy print set repeats each continuation page once with a single-form print area', async () => {
  for (const kind of ['RR', 'MR'] as const) {
    const payload = prefillReceivingForm(kind, { poNumber: 'PO-123', paymentType: 'CREDIT_TERMS', purchaseRequest: { department: { name: 'Science' }, itemsPayload: [] } });
    payload.items = Array.from({ length: 18 }, (_, i) => ({ ...payload.items[0], description: `Delivery line ${i + 1}: paper` }));
    const context = { id: 'doc', version: 2 };
    const regular = unzipSync(await exportReceivingForm(kind, payload, context));
    const expanded = unzipSync(await exportReceivingForm(kind, payload, { ...context, copies: 3 }));
    const sheetNames = Object.keys(regular).filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
    assert.ok(sheetNames.length > 1);
    const workbook = strFromU8(expanded['xl/workbook.xml']);
    for (let page = 0; page < sheetNames.length; page++) {
      const main = strFromU8(expanded[`xl/worksheets/sheet${page + 1}.xml`]);
      const extra = strFromU8(expanded[`xl/worksheets/sheet${sheetNames.length + page + 1}.xml`]);
      const mainItems = [...main.matchAll(/Delivery line (\d+): paper/g)].map(match => match[1]);
      const extraItems = [...extra.matchAll(/Delivery line (\d+): paper/g)].map(match => match[1]);
      assert.deepEqual(mainItems, [...extraItems, ...extraItems]);
      assert.match(main, /<pageSetup\b[^>]*copies="1"/);
      assert.match(extra, /<pageSetup\b[^>]*copies="1"/);
      assert.ok(extra.includes(`page ${page + 1} of ${sheetNames.length} / copy 3`));
      assert.ok(workbook.includes(`'${kind}-copy-3-${page + 1}'!${kind === 'RR' ? '$A$1:$G$32' : '$A$1:$I$34'}`));
    }
  }
});

test('line totals use exact decimal rounding and retain unresolved values', () => {
  assert.equal(receivingLineTotal('1.15', '0.10'), '0.12');
  assert.equal(receivingLineTotal('2', '1250.50'), '2501.00');
  assert.equal(receivingLineTotal('', '100'), ''); assert.equal(receivingLineTotal('2', ''), '');
});

test('exports preserve original form layout, both copies, blanks and safe text while removing sample transactions', async () => {
  for (const kind of ['RR', 'MR'] as const) {
    const payload = prefillReceivingForm(kind, { poNumber: 'PO-123', paymentType: 'CREDIT_TERMS', purchaseRequest: { department: { name: 'Science' }, itemsPayload: [] } });
    payload.supplier = '=HYPERLINK("bad") & <supplier>';
    payload.department = payload.supplier;
    payload.items = Array.from({ length: 20 }, (_, i) => ({ quantity: '1', unit: 'PC', description: `Unique item ${i + 1} ` + 'long description '.repeat(5), invoiceQuantity: '', receivedQuantity: '', unitCost: '', remarks: '' }));
    const files = unzipSync(await exportReceivingForm(kind, payload, { id: 'doc', version: 2 }));
    const template = unzipSync(readFileSync(`src/templates/receiving/${kind}.xlsx`));
    const originalStyles = strFromU8(template['xl/styles.xml']).match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)![1];
    assert.equal(strFromU8(files['xl/styles.xml']).match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)![1].startsWith(originalStyles), true, 'original static instructions and caption styles must remain intact');
    for (const [name, bytes] of Object.entries(files).filter(([name]) => name.endsWith('.xml') || name.endsWith('.rels'))) {
      const stack: string[] = [];
      for (const match of strFromU8(bytes).matchAll(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/?([A-Za-z_][\w:.-]*)\b[^>]*>/g)) {
        const tag = match[0];
        if (!match[1] || tag.endsWith('/>')) continue;
        if (tag.startsWith('</')) assert.equal(stack.pop(), match[1], `XML nesting in ${name}`);
        else stack.push(match[1]);
      }
      assert.equal(stack.length, 0, `Unclosed XML tags in ${name}`);
    }
    const sheets = Object.entries(files).filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).map(([, bytes]) => strFromU8(bytes));
    assert.ok(sheets.length > 1, 'overflow must use continuation sheets');
    const xml = Object.values(files).map(bytes => strFromU8(bytes)).join('');
    assert.doesNotMatch(xml, /JOSHUA|YINLICAI|JAUCULAN|42000|2026-1332|D\.FRASCO|FELIPE SARIGAN/);
    assert.doesNotMatch(xml, /<f[ >]/);
    assert.match(xml, /revision 2/); assert.match(xml, /&amp; &lt;supplier&gt;/);
    for (let i = 1; i <= 20; i++) assert.match(sheets.join(''), new RegExp(`Unique item ${i} `));
    assert.match(sheets[0], /mergeCells/); assert.match(sheets[0], /pageMargins/);
    assert.equal((sheets[0].match(/Unique item 1 /g) || []).length, 2);
  }
});

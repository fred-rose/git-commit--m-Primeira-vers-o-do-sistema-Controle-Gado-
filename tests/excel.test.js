import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from '../js/vendor/xlsx.js';
import { buildWorkbook } from '../js/excel.js';
import { createSeed } from '../js/seed.js';
import { createRepository } from '../js/storage.js';
import { today } from '../js/utils.js';

function roundtrip(workbook) {
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true });
  assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  return XLSX.read(bytes, { cellNF: true });
}
const rows = sheet => XLSX.utils.sheet_to_json(sheet, { header: 1, range: 4, defval: '' });

test('XLSX real contém cinco abas, números, datas e moeda formatados', () => {
  const workbook = roundtrip(buildWorkbook(createSeed()));
  assert.deepEqual(workbook.SheetNames, ['Resumo', 'Rebanho', 'Movimentações', 'Pastos', 'Financeiro']);
  const finance = workbook.Sheets.Financeiro;
  assert.equal(rows(finance).length, 44);
  assert.equal(finance.A5.t, 'n');
  assert.equal(finance.A5.z, 'dd/mm/yyyy');
  assert.equal(finance.A5.w, '03/09/2026');
  assert.equal(finance.G5.t, 'n');
  assert.match(finance.G5.z, /R\$/);
  assert.ok(finance['!autofilter']);
  const summary = rows(workbook.Sheets.Resumo);
  assert.equal(summary.find(r => r[1] === 'Total de cabeças')[2], 169);
  assert.equal(summary.find(r => r[1] === 'Saldo')[2], 58485.81);
  assert.equal(summary.find(r => r[1] === 'Compra')[2], 0);
  assert.equal(summary.find(r => r[1] === 'Compras de gado — lançamentos')[2], 2);
  assert.equal(summary.find(r => r[1] === 'Vendas de gado — lançamentos')[2], 2);
  assert.ok(!JSON.stringify(rows(finance)).includes('migration-'));
  assert.ok(!JSON.stringify(rows(workbook.Sheets.Rebanho)).includes('owner-'));
});

test('cada módulo exporta somente sua aba e respeita filtros', () => {
  const data = createSeed();
  for (const [kind, name] of [['herd', 'Rebanho'], ['movements', 'Movimentações'], ['pastures', 'Pastos'], ['finance', 'Financeiro']]) assert.deepEqual(roundtrip(buildWorkbook(data, kind)).SheetNames, [name]);
  const finance = roundtrip(buildWorkbook(data, 'finance', { source: 'migration', type: 'Despesa', category: 'Alimentação' }));
  assert.equal(rows(finance.Sheets.Financeiro).length, 2);
  const herd = roundtrip(buildWorkbook(data, 'herd', { category: 'Vacas', ownerId: 'owner-1', pastureId: 'pasture-2' }));
  assert.deepEqual(rows(herd.Sheets.Rebanho)[0], ['Vacas', 30, 'Bruno', 'Barragem']);
  assert.equal(rows(roundtrip(buildWorkbook(data, 'general', { type: 'Entrada', ownerId: 'missing' })).Sheets.Financeiro).length, 44);
});

test('exportação reflete criação, edição e exclusão; texto de usuário nunca vira fórmula', () => {
  let raw = null;
  const r = createRepository({ getItem: () => raw, setItem: (_, value) => raw = value });
  r.getData();
  r.addMovement({ type: 'Venda', date: today(), category: 'Vacas', quantity: 10, valueCents: 4000000, ownerId: 'owner-1', pastureId: 'pasture-2', note: '=HYPERLINK("x")' });
  const m = r.getData().movements[0];
  let workbook = roundtrip(buildWorkbook(r.getData()));
  assert.equal(workbook.Sheets.Movimentações.I5.t, 's');
  assert.equal(workbook.Sheets.Movimentações.I5.f, undefined);
  assert.equal(rows(workbook.Sheets.Financeiro).length, 45);
  assert.equal(rows(workbook.Sheets.Resumo).find(row => row[1] === 'Total de cabeças')[2], 159);
  r.updateMovement(m.id, { ...m, quantity: 5, valueCents: 2000000 });
  workbook = roundtrip(buildWorkbook(r.getData()));
  assert.equal(rows(workbook.Sheets.Resumo).find(row => row[1] === 'Total de cabeças')[2], 164);
  r.deleteMovement(m.id);
  assert.equal(rows(roundtrip(buildWorkbook(r.getData())).Sheets.Financeiro).length, 44);
});

test('exportação vazia mantém títulos e cabeçalhos válidos', () => {
  const workbook = roundtrip(buildWorkbook(createSeed(false), 'finance'));
  assert.equal(workbook.Sheets.Financeiro.A4.v, 'Data');
  assert.equal(rows(workbook.Sheets.Financeiro).length, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRepository } from '../js/storage.js';
import { createSeed } from './fixtures/legacy.js';
import { FINANCIAL_SEED } from '../js/data/financial-seed.js';
import { upgradeData } from '../js/finance.js';
import { financialTotals, getFinances, validateData, summarize } from '../js/domain.js';
import { filterFinances } from '../js/queries.js';
import { extractFinancialMigration } from '../scripts/lib/finance-migration.js';
import { today } from '../js/utils.js';

function repository(initial) {
  let raw = initial ? JSON.stringify(initial) : null;
  let writes = 0;
  const adapter = { getItem: () => raw, setItem: (_, value) => { raw = value; writes++; } };
  return { r: createRepository(adapter, createSeed), adapter, raw: () => raw, writes: () => writes };
}
function legacy() {
  const data = { ...createSeed(), version: 1, finances: [{ id: 'manual-before', type: 'Despesa', category: 'Outros', date: today(), description: 'Despesa anterior', valueCents: 500 }] };
  delete data.seedVersion; delete data.appliedSeeds;
  return data;
}

test('migração contém 44 registros reais e concilia os dois livros de caixa', () => {
  const data = validateData(createSeed());
  assert.equal(data.finances.length, 44);
  assert.deepEqual(financialTotals(data.finances), { income: 17657002, expense: 11808421, balance: 5848581 });
  assert.equal(data.finances.filter(f => f.provenance.sheet.endsWith('Varia')).length, 11);
  assert.equal(data.finances.filter(f => f.provenance.sheet.endsWith('Apênd')).length, 33);
  assert.equal(new Set(data.finances.map(f => f.id)).size, 44);
  assert.ok(data.finances.every(f => f.source === 'migration' && f.ownerId === '' && f.owner === '' && f.property === '' && f.movementId === null));
  const commission = data.finances.find(f => f.description === 'Comissão Danilo');
  assert.equal(commission.valueCents, 84866);
  assert.equal(commission.provenance.originalAmount, '848.6568');
  assert.equal(data.finances.find(f => f.description === 'Saldo anterior').category, 'Saldo inicial');
});

test('extração reproduz os lançamentos da planilha original', { skip: !process.env.MIGRATION_WORKBOOK }, async () => {
  const result = extractFinancialMigration(await readFile(process.env.MIGRATION_WORKBOOK), FINANCIAL_SEED.manifest.createdAt);
  assert.deepEqual(result.records, FINANCIAL_SEED.records);
  assert.deepEqual(result.manifest, FINANCIAL_SEED.manifest);
  assert.ok(result.audit.sheets.every(s => s.balanceChecks.every(check => check.matches)));
  assert.equal(result.audit.duplicates.length, 0);
  assert.equal(result.audit.precision.length, 1);
  assert.equal(result.audit.historicalReview.filter(r => typeof r.amount === 'number' && r.amount > 0).length, 15);
  assert.equal(result.audit.historicalReview.filter(r => !r.amount && typeof r.observation === 'number').length, 4);
});

test('primeiro acesso aplica seed uma vez; reabrir preserva dados e não escreve novamente', () => {
  const fixture = repository();
  assert.equal(fixture.r.getData().finances.length, 44);
  assert.equal(fixture.writes(), 1);
  fixture.r.saveFinance(undefined, { date: today(), type: 'Entrada', category: 'Outras receitas', description: 'Receita pessoal', valueCents: 1200 });
  const before = fixture.raw(), writes = fixture.writes();
  const reopened = createRepository(fixture.adapter);
  assert.equal(reopened.getData().finances.length, 45);
  assert.equal(fixture.raw(), before);
  assert.equal(fixture.writes(), writes);
});

test('banco V1 recebe estrutura compatível sem seed financeiro automático nem sobrescrita', () => {
  const old = legacy(), fixture = repository(old), raw = fixture.raw();
  const current = fixture.r.getData();
  assert.equal(current.version, 2);
  assert.equal(current.finances.length, 1);
  assert.equal(current.finances[0].valueCents, 500);
  assert.equal(current.finances[0].source, 'manual');
  assert.equal(fixture.raw(), raw);
  assert.equal(fixture.writes(), 0);
  assert.deepEqual(current.openingStock, old.openingStock);
  fixture.r.importFinancialSeed();
  assert.equal(fixture.r.getData().finances.length, 45);
  assert.equal(fixture.r.getData().finances[0].id, 'manual-before');
  fixture.r.importFinancialSeed();
  assert.equal(fixture.r.getData().finances.length, 45);
  assert.equal(fixture.r.getData().appliedSeeds.length, 1);
});

test('importação manual do seed reconhece registro já existente e não duplica', () => {
  const data = { ...createSeed(), seedVersion: 0, appliedSeeds: [] };
  data.finances = [{ ...data.finances[0], id: 'already-entered', source: 'manual', provenance: undefined }];
  const { r } = repository(data);
  assert.equal(r.financialSeedPlan().skipped, 1);
  r.importFinancialSeed();
  assert.equal(r.getData().finances.length, 44);
  assert.equal(r.getData().finances[0].id, 'already-entered');
});

test('falha ao importar preserva dados anteriores e não marca seed aplicado', () => {
  const fixture = repository(legacy());
  fixture.r.getData();
  const before = fixture.r.exportData();
  fixture.adapter.setItem = () => { throw new Error('quota'); };
  assert.throws(() => fixture.r.importFinancialSeed(), /Nenhuma alteração/);
  assert.equal(fixture.r.exportData(), before);
  assert.equal(fixture.r.getData().appliedSeeds.length, 0);
});

test('manuais preservam proprietário, propriedade, notas e categoria própria; migrados são consultáveis', () => {
  const { r } = repository();
  r.getData();
  r.saveFinance(undefined, { date: today(), type: 'Despesa', category: 'Serviço próprio', description: 'Trabalho', valueCents: 5000, ownerId: 'owner-1', property: 'Fazenda Santa Maria', notes: 'Pagamento conferido' });
  const f = r.getData().finances.at(-1);
  assert.equal(f.ownerId, 'owner-1');
  assert.equal(f.property, 'Fazenda Santa Maria');
  assert.equal(f.source, 'manual');
  assert.equal(filterFinances(r.getData(), { ownerId: 'owner-1', category: 'Serviço próprio', source: 'manual', q: 'conferido' }).length, 1);
  assert.equal(filterFinances(r.getData(), { ownerId: 'unassigned', source: 'migration' }).length, 44);
  assert.equal(filterFinances(r.getData(), { sheet: 'Movimentação Financeira - Varia', from: '2026-06-08', to: '2026-08-17' }).length, 11);
  assert.throws(() => r.deleteFinance(r.getData().finances[0].id), /manuais/);
  r.deleteFinance(f.id);
  assert.equal(r.getData().finances.length, 44);
});

test('compras/vendas seguem vinculadas e não alteram registros da migração', () => {
  const { r } = repository();
  const original = r.getData().finances;
  r.addMovement({ date: today(), type: 'Venda', category: 'Vacas', quantity: 2, valueCents: 1000000, pastureId: 'pasture-2', ownerId: 'owner-1', note: 'Venda nova' });
  const m = r.getData().movements[0];
  assert.equal(getFinances(r.getData()).find(f => f.movementId === m.id).source, 'cattle_sale');
  r.updateMovement(m.id, { ...m, quantity: 1, valueCents: 500000 });
  assert.equal(getFinances(r.getData()).length, 45);
  assert.equal(summarize(r.getData()).financial.income, 18157002);
  r.deleteMovement(m.id);
  assert.deepEqual(r.getData().finances, original);
  assert.equal(getFinances(r.getData()).length, 44);
});

test('começar inventário real mantém histórico financeiro; backup V1 continua compatível', () => {
  const { r } = repository();
  const before = r.getData().finances;
  r.startEmpty(today());
  assert.deepEqual(r.getData().finances, before);
  assert.equal(summarize(r.getData()).total, 0);
  r.importData(JSON.stringify(legacy()));
  assert.deepEqual(r.getData().finances, upgradeData(legacy()).finances);
});

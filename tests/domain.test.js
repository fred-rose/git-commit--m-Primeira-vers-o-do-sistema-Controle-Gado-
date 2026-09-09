import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepository } from '../js/storage.js';
import { createSeed } from '../js/seed.js';
import { getStock, summarize, getFinances, validateData } from '../js/domain.js';
import { STORAGE_KEY } from '../js/constants.js';
import { today, toCents, csv } from '../js/utils.js';
import { filterMovements, filterStock, filterFinances } from '../js/queries.js';
import { reportData } from '../js/pages/relatorios.js';

function setup(demo = true) {
  const memory = new Map();
  const adapter = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  const seed = empty => ({ ...createSeed(empty === false ? false : demo), openingDate: '2026-01-01', finances: [], seedVersion: 0, appliedSeeds: [] });
  const repository = createRepository(adapter, seed);
  repository.getData();
  return { repository, adapter, memory };
}
const movement = (overrides = {}) => ({ type: 'Entrada', category: 'Vacas', quantity: 1, ownerId: 'owner-1', pastureId: 'pasture-2', destinationId: '', date: today(), valueCents: 0, note: '', ...overrides });
const stockQuantity = (data, category, ownerId, pastureId) => getStock(data).filter(l => (!category || l.category === category) && (!ownerId || l.ownerId === ownerId) && (!pastureId || l.pastureId === pastureId)).reduce((sum, l) => sum + l.quantity, 0);
const snapshot = r => r.exportData();

test('seed consistente: categorias, proprietários e pastos somam 169', () => {
  const data = validateData(createSeed());
  const s = summarize(data);
  assert.equal(s.total, 169);
  assert.deepEqual(s.categories.map(c => c.quantity), [108, 3, 2, 36, 20]);
  assert.equal(s.pastures.reduce((sum, p) => sum + p.quantity, 0), s.total);
  assert.equal(s.owners.reduce((sum, o) => sum + o.quantity, 0), s.total);
  assert.equal(s.financial.balance, 5848581);
});

test('A: nascimento de 5 bezerros atualiza categoria, total, pasto e histórico', () => {
  const { repository: r } = setup();
  const before = stockQuantity(r.getData(), null, null, 'pasture-2');
  r.addMovement(movement({ type: 'Nascimento', category: 'Bezerros', quantity: 5 }));
  assert.equal(summarize(r.getData()).total, 174);
  assert.equal(stockQuantity(r.getData(), 'Bezerros'), 25);
  assert.equal(stockQuantity(r.getData(), null, null, 'pasture-2'), before + 5);
  assert.equal(r.getData().movements.length, 1);
  assert.equal(getFinances(r.getData()).length, 0);
});

test('B: venda de 10 vacas gera R$ 40.000 e reduz o saldo exato de Bruno/Barragem', () => {
  const { repository: r } = setup();
  r.addMovement(movement({ type: 'Venda', quantity: 10, valueCents: 4000000 }));
  assert.equal(summarize(r.getData()).total, 159);
  assert.equal(stockQuantity(r.getData(), 'Vacas'), 98);
  assert.equal(stockQuantity(r.getData(), 'Vacas', 'owner-1', 'pasture-2'), 20);
  assert.equal(summarize(r.getData()).financial.income, 4000000);
  assert.equal(getFinances(r.getData())[0].movementId, r.getData().movements[0].id);
});

test('C: transferência de 20 vacas conserva total, categoria e proprietário', () => {
  const { repository: r } = setup();
  const before = summarize(r.getData());
  r.addMovement(movement({ type: 'Transferência de pasto', quantity: 20, destinationId: 'pasture-3' }));
  const after = summarize(r.getData());
  assert.equal(after.total, before.total);
  assert.deepEqual(after.categories, before.categories);
  assert.deepEqual(after.owners, before.owners);
  assert.equal(stockQuantity(r.getData(), 'Vacas', 'owner-1', 'pasture-2'), 10);
  assert.equal(stockQuantity(r.getData(), 'Vacas', 'owner-1', 'pasture-3'), 20);
  assert.equal(getFinances(r.getData()).length, 0);
});

test('D: venda de 500 vacas é bloqueada e nenhum dado é alterado', () => {
  const { repository: r, memory } = setup();
  const before = snapshot(r), stored = memory.get(STORAGE_KEY);
  assert.throws(() => r.addMovement(movement({ type: 'Venda', quantity: 500, valueCents: 100 })), /Saldo insuficiente/);
  assert.equal(snapshot(r), before);
  assert.equal(memory.get(STORAGE_KEY), stored);
});

test('edição e exclusão revertem estoque e financeiro sem duplicar lançamentos', () => {
  const { repository: r } = setup();
  r.addMovement(movement({ type: 'Venda', quantity: 10, valueCents: 4000000 }));
  const id = r.getData().movements[0].id;
  r.updateMovement(id, movement({ type: 'Venda', quantity: 5, valueCents: 2000000 }));
  assert.equal(summarize(r.getData()).total, 164);
  assert.equal(getFinances(r.getData()).length, 1);
  assert.equal(summarize(r.getData()).financial.income, 2000000);
  r.updateMovement(id, movement({ type: 'Compra', quantity: 5, valueCents: 500000 }));
  assert.equal(summarize(r.getData()).total, 174);
  assert.deepEqual(summarize(r.getData()).financial, { income: 0, expense: 500000, balance: -500000 });
  r.deleteMovement(id);
  assert.equal(summarize(r.getData()).total, 169);
  assert.equal(getFinances(r.getData()).length, 0);
});

test('replay cronológico bloqueia excluir/editar uma entrada consumida posteriormente', () => {
  const { repository: r } = setup(false);
  r.addMovement(movement({ quantity: 10, date: '2026-01-02' }));
  const entry = r.getData().movements[0];
  r.addMovement(movement({ type: 'Saída', quantity: 8, date: '2026-01-03' }));
  const before = snapshot(r);
  assert.throws(() => r.deleteMovement(entry.id), /Saldo insuficiente/);
  assert.throws(() => r.updateMovement(entry.id, { ...entry, quantity: 7 }), /Saldo insuficiente/);
  assert.throws(() => r.updateMovement(entry.id, { ...entry, date: '2026-01-04' }), /Saldo insuficiente/);
  assert.equal(snapshot(r), before);
});

test('movimentação retroativa usa saldo da data e não o saldo atual', () => {
  const { repository: r } = setup(false);
  r.addMovement(movement({ quantity: 10, date: '2026-01-03' }));
  assert.throws(() => r.addMovement(movement({ type: 'Saída', quantity: 1, date: '2026-01-02' })), /Saldo insuficiente/);
  r.addMovement(movement({ type: 'Saída', quantity: 1, date: '2026-01-03' }));
  assert.equal(summarize(r.getData()).total, 9);
});

test('operações inválidas são atômicas e saldo de outro proprietário não pode ser usado', () => {
  const { repository: r } = setup();
  const before = snapshot(r);
  const invalid = [
    { quantity: 0 }, { quantity: -2 }, { quantity: 1.5 }, { quantity: Number.MAX_SAFE_INTEGER },
    { ownerId: '' }, { ownerId: 'missing' }, { pastureId: '' }, { category: 'Invalid' }, { type: 'Invalid' },
    { type: 'Transferência de pasto', destinationId: 'pasture-2' }, { type: 'Transferência de pasto', destinationId: '' },
    { valueCents: -1 }, { type: 'Venda', valueCents: 0 }, { type: 'Compra', valueCents: 1.5 },
    { date: '2026-02-30' }, { date: '2099-01-01' }, { date: '2025-12-31' },
    { type: 'Saída', quantity: 1, ownerId: 'owner-3' }, { type: 'Nascimento', category: 'Vacas' },
  ];
  invalid.forEach(input => assert.throws(() => r.addMovement(movement(input)), undefined, JSON.stringify(input)));
  assert.equal(snapshot(r), before);
});

test('pasto ocupado bloqueado; vazio pode ser excluído preservando referências históricas', () => {
  const { repository: r } = setup(false);
  r.addMovement(movement({ quantity: 3 }));
  assert.throws(() => r.deletePasture('pasture-2'), /ainda possui animais/);
  r.addMovement(movement({ type: 'Transferência de pasto', quantity: 3, destinationId: 'pasture-3' }));
  r.deletePasture('pasture-2');
  assert.equal(r.getData().pastures.find(p => p.id === 'pasture-2').archived, true);
  assert.equal(filterMovements(r.getData(), { pastureId: 'pasture-2' }).length, 2);
  assert.throws(() => r.addMovement(movement()), /pasto ativo/);
  assert.throws(() => r.deleteMovement(r.getData().movements[1].id), /excluído/);
  r.savePasture(undefined, 'Novo pasto');
  const pasture = r.getData().pastures.at(-1);
  r.savePasture(pasture.id, 'Pasto novo');
  assert.equal(r.getData().pastures.at(-1).name, 'Pasto novo');
  assert.throws(() => r.savePasture(undefined, '  PASTO NOVO '), /Já existe/);
});

test('lançamento manual soma com automático, edita e exclui sem afetar rebanho', () => {
  const { repository: r } = setup();
  r.addMovement(movement({ type: 'Compra', quantity: 2, valueCents: 100001 }));
  r.saveFinance(undefined, { type: 'Despesa', category: 'Alimentação', date: today(), valueCents: 12345, description: 'Ração' });
  const id = r.getData().finances[0].id;
  assert.equal(summarize(r.getData()).financial.expense, 112346);
  r.saveFinance(id, { type: 'Entrada', category: 'Outros', date: today(), valueCents: 50000, description: 'Reembolso' });
  assert.deepEqual(summarize(r.getData()).financial, { income: 50000, expense: 100001, balance: -50001 });
  r.deleteFinance(id);
  assert.equal(getFinances(r.getData()).length, 1);
  assert.equal(summarize(r.getData()).total, 171);
});

test('quota cheia não aplica alteração nem notifica sucesso', () => {
  const { repository: r, adapter } = setup();
  const before = snapshot(r);
  let notifications = 0;
  r.subscribe(() => notifications++);
  adapter.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => r.addMovement(movement()), /Nenhuma alteração/);
  assert.equal(snapshot(r), before);
  assert.equal(notifications, 0);
});

test('duas abas: gravação obsoleta bloqueada, recarga recupera estado atualizado', () => {
  const { repository: first, adapter } = setup();
  const second = createRepository(adapter);
  second.getData();
  first.addMovement(movement());
  assert.throws(() => second.addMovement(movement()), /outra aba/);
  second.reload();
  second.addMovement(movement());
  assert.equal(summarize(second.getData()).total, 171);
});

test('backup restaura vínculos, fotos e financeiro; importação inválida preserva dados', () => {
  const { repository: r } = setup();
  r.addMovement(movement({ type: 'Venda', valueCents: 12345 }));
  r.savePhoto(undefined, { title: 'Registro', description: 'Pasto', date: today(), pastureId: 'pasture-2', ownerId: 'owner-1', image: 'data:image/png;base64,aGVsbG8=' });
  const backup = r.exportData();
  r.startEmpty('2026-01-01');
  assert.equal(summarize(r.getData()).total, 0);
  r.importData(backup);
  assert.equal(summarize(r.getData()).total, 168);
  assert.equal(r.getData().photos.length, 1);
  assert.equal(summarize(r.getData()).financial.income, 12345);
  const before = snapshot(r);
  for (const change of [d => d.version = 999, d => d.movements[0].quantity = 500, d => d.photos[0].image = 'javascript:alert(1)', d => d.owners = [], d => d.movements.push(d.movements[0])]) {
    const invalid = JSON.parse(backup); change(invalid);
    assert.throws(() => r.importData(JSON.stringify(invalid)));
    assert.equal(snapshot(r), before);
  }
});

test('dados corrompidos nunca são substituídos pelo seed', () => {
  const { adapter, memory } = setup();
  adapter.setItem(STORAGE_KEY, '{corrompido');
  const r = createRepository(adapter);
  assert.throws(() => r.getData(), /preservados/);
  assert.equal(memory.get(STORAGE_KEY), '{corrompido');
});

test('filtros e relatórios refletem origem/destino e períodos inclusivos', () => {
  const { repository: r } = setup();
  r.addMovement(movement({ type: 'Transferência de pasto', destinationId: 'pasture-3', quantity: 2, date: '2026-01-02', note: 'Mudança' }));
  r.addMovement(movement({ type: 'Venda', valueCents: 10000, date: '2026-01-03' }));
  assert.equal(filterMovements(r.getData(), { pastureId: 'pasture-3', q: 'mudanca' }).length, 1);
  assert.equal(filterMovements(r.getData(), { from: '2026-01-03', to: '2026-01-03' }).length, 1);
  assert.equal(filterStock(r.getData(), { category: 'Vacas', ownerId: 'owner-1', pastureId: 'pasture-2' })[0].quantity, 27);
  assert.equal(filterFinances(r.getData(), { type: 'Entrada', from: '2026-01-03', to: '2026-01-03' }).length, 1);
  assert.equal(reportData(r.getData(), { report: 'trades' }).rows.length, 1);
  assert.equal(reportData(r.getData(), { report: 'births' }).rows.length, 0);
});

test('dinheiro usa centavos inteiros e CSV neutraliza fórmulas', () => {
  assert.equal(toCents('40000,01'), 4000001);
  assert.equal(toCents('40.000,01'), 4000001);
  assert.equal(toCents('40.000'), 4000000);
  assert.equal(toCents('0.10') + toCents('0.20'), 30);
  assert.throws(() => toCents('-1'));
  assert.throws(() => toCents('1,234'));
  assert.match(csv([['=HYPERLINK("bad")', 'a;b']]), /'=HYPERLINK/);
  assert.match(csv([['a;b']]), /"a;b"/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepository } from '../js/storage.js';
import { createSeed } from '../js/seed.js';
import { STORAGE_KEY } from '../js/constants.js';
import { summarize, getFinances } from '../js/domain.js';
import { createBackup, inspectBackup, backupFilename } from '../js/storage/backup.js';
import { MAX_BACKUP_BYTES } from '../js/storage/schema.js';
import { buildContext, CONTEXT_LIMITS } from '../js/ai/contextBuilder.js';
import { AiAssistant } from '../js/ai/aiAssistant.js';
import { RemoteProvider } from '../js/ai/remoteProvider.js';
import { today, money } from '../js/utils.js';

function setup() {
  const memory = new Map([['outro-sistema', 'preservar']]);
  let writes = 0;
  const adapter = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => { writes++; memory.set(key, value); } };
  const repository = createRepository(adapter);
  return { memory, adapter, repository, writes: () => writes };
}
const movement = overrides => ({ type: 'Venda', category: 'Vacas', quantity: 10, ownerId: 'owner-1', pastureId: 'pasture-2', destinationId: '', date: today(), valueCents: 4000000, note: 'Nota privada que não deve ir ao contexto', ...overrides });

test('backup controlado restaura estoque, fotos, proveniência e vínculos após LIMPAR', () => {
  const { repository: r, adapter, memory } = setup();
  r.addMovement(movement());
  r.addMovement(movement({ type: 'Compra', category: 'Bois', quantity: 5, valueCents: 2000000 }));
  r.savePhoto(null, { title: 'Foto', description: 'Privada', date: today(), image: 'data:image/png;base64,YQ==', pastureId: 'pasture-2', ownerId: 'owner-1' });
  const original = r.getData(), text = r.exportBackup(), envelope = JSON.parse(text);
  assert.equal(envelope._meta.system, 'controle-gado');
  assert.equal(envelope._meta.schemaVersion, 2);
  assert.equal(envelope._meta.appVersion, '1.2.0');
  assert.match(backupFilename(), /^controle-gado-backup-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(envelope.finances, undefined);
  assert.equal(text.includes('outro-sistema'), false);
  assert.equal(inspectBackup(text).summary.totalCattle, 164);
  assert.equal(inspectBackup(text).summary.financialRecords, 46);
  r.clearData('LIMPAR');
  const cleared = createRepository(adapter).getData();
  assert.equal(summarize(cleared).total, 0);
  assert.equal(cleared.finances.length, 0);
  assert.equal(cleared.pastures.length, 0);
  assert.equal(cleared.photos.length, 0);
  assert.equal(memory.get('outro-sistema'), 'preservar');
  r.importData(text);
  assert.deepEqual({ ...r.getData(), revision: original.revision }, original);
  assert.equal(getFinances(r.getData()).filter(f => f.movementId).length, 2);
  assert.equal(summarize(r.getData()).financial.balance, 7848581);
  assert.equal(createRepository(adapter).getData().finances.length, 44);
});

test('arquivos inválidos nunca gravam, nem mesmo antes da primeira inicialização', () => {
  const { repository: r, writes, memory } = setup();
  const valid = createBackup(createSeed());
  const changed = change => { const b = structuredClone(valid); change(b); return JSON.stringify(b); };
  const invalid = ['{', '[]', '{}', 'null', '{"arbitrario":42}',
    changed(b => { b._meta.system = 'outro'; }),
    changed(b => { b._meta.schemaVersion = 99; }),
    changed(b => { b._meta.exportedAt = '2026-02-30T12:00:00Z'; }),
    changed(b => { delete b.data.photos; }),
    changed(b => { b.data.movements = {}; }),
    changed(b => { b.data.owners[0] = []; }),
    changed(b => { b.data.openingStock[0].quantity = -1; }),
    changed(b => { b.data.openingStock[0].quantity = '10'; }),
    changed(b => { b.data.openingStock[0].ownerId = 'inexistente'; }),
    changed(b => { b.data.finances[0].valueCents = 1.5; }),
    changed(b => { b.data.finances[0].date = '2026-02-30'; }),
    changed(b => { b.data.finances[0].createdAt = 'ontem'; }),
    changed(b => { b.data.pastures[0].name = 'x'.repeat(101); }),
    changed(b => { b.data.finances[0].provenance = []; }),
    changed(b => { b.data.finances[0].ownerId = {}; }),
    changed(b => { b.data.owners.push(b.data.owners[0]); }),
    changed(b => { b.data.extra = 'NONFINITE'; }).replace('"NONFINITE"', '1e400'),
    '{"__proto__":{"polluted":true}}', ' '.repeat(MAX_BACKUP_BYTES + 1)];
  for (const text of invalid) { assert.throws(() => r.importData(text)); assert.equal(writes(), 0); assert.equal(memory.has(STORAGE_KEY), false); }
  r.getData();
  const before = memory.get(STORAGE_KEY), count = writes();
  for (const text of invalid) { assert.throws(() => r.importData(text)); assert.equal(writes(), count); assert.equal(memory.get(STORAGE_KEY), before); }
  assert.equal({}.polluted, undefined);
});

test('compatibilidade com backup legado V1 e V1.1 não reaplica seed', () => {
  const { repository: r } = setup();
  const old = createSeed(false);
  old.finances = []; old.version = 1; delete old.seedVersion; delete old.appliedSeeds;
  r.importData(JSON.stringify(old));
  assert.equal(r.getData().version, 2);
  assert.equal(r.getData().finances.length, 0);
  assert.equal(r.getData().seedVersion, 0);
  const v11 = createSeed();
  assert.equal(inspectBackup(JSON.stringify(v11)).legacy, true);
  assert.deepEqual(inspectBackup(JSON.stringify(v11)).data, v11);
  v11.unrelated = 'não exportar';
  assert.equal(createBackup(v11).data.unrelated, undefined);
});

test('limpeza exige confirmação exata e falha de quota preserva restauração e estado', () => {
  const { repository: r, adapter } = setup();
  const before = r.exportData();
  for (const value of ['', undefined, 'limpar', ' LIMPAR', 'SIM']) assert.throws(() => r.clearData(value));
  const backup = r.exportBackup();
  adapter.setItem = () => { throw new Error('QuotaExceeded'); };
  assert.throws(() => r.importData(backup), /Nenhuma alteração/);
  assert.throws(() => r.clearData('LIMPAR'), /Nenhuma alteração/);
  assert.equal(r.exportData(), before);
});

test('assistente responde perguntas de aceite com dados atuais e não escreve', async () => {
  const { repository: r, writes } = setup();
  const assistant = new AiAssistant({ getContext: q => buildContext(r.getData(), q) });
  const answer = async q => (await assistant.ask(q)).text;
  assert.match(await answer('Quantas vacas temos?'), /108 vacas/);
  assert.match(await answer('Quantos animais existem?'), /169 animais/);
  assert.match(await answer('Quantos animais estão no pasto Barragem?'), /46 animais/);
  assert.match(await answer('Quantos animais são do Bruno?'), /89 animais/);
  const before = r.exportData(), writeCount = writes();
  assert.match(await answer('Venda 5 vacas'), /não realizo alterações/);
  assert.match(await answer('Limpe os dados'), /não realizo alterações/);
  assert.match(await answer('Como faço uma venda?'), /Movimentações/);
  assert.match(await answer('Como registro uma morte?'), /Morte/);
  assert.match(await answer('Como transfiro animais de pasto?'), /Transferência de pasto/);
  assert.equal(r.exportData(), before); assert.equal(writes(), writeCount);
  r.addMovement(movement());
  assert.match(await answer('Quantas vacas temos?'), /98 vacas/);
  assert.ok((await answer('Qual o saldo?')).includes(money(9848581)));
  const month = buildContext(r.getData()).financial;
  assert.ok((await answer('Quanto entrou este mês?')).includes(money(month.monthlyIncomeCents)));
  assert.ok((await answer('Quanto foi gasto este mês?')).includes(money(month.monthlyExpenseCents)));
  r.addMovement(movement({ type: 'Compra', category: 'Bois', quantity: 5, valueCents: 2000000 }));
  assert.match(await answer('Quantos bois temos?'), /8 bois/);
  const sale = r.getData().movements[0];
  r.updateMovement(sale.id, movement({ valueCents: 5000000 }));
  assert.ok((await answer('Qual o saldo?')).includes(money(8848581)));
  r.deleteMovement(sale.id);
  assert.match(await answer('Quantas vacas temos?'), /108 vacas/);
  assert.ok((await answer('Qual o saldo?')).includes(money(3848581)));
  assert.match(await answer('Quantos cavalos temos?'), /Não tenho uma contagem/);
  assert.match(await answer('Quantas vacas vendemos?'), /somar movimentações/);
  assert.match(await answer('Qual o saldo do Bruno?'), /totais financeiros gerais/);
  assert.match(await answer('Quantos animais no pasto Inexistente?'), /Não identifiquei/);
  assert.match(await answer('Quanto entrou em janeiro?'), /outros períodos/);
  assert.equal(assistant.history().length, 20);
  const current = r.exportData();
  assistant.clear(); assert.equal(assistant.history().length, 0); assert.equal(r.exportData(), current);
});

test('DTO limitado exclui fotos, notas, IDs e listas brutas; recorte recente é relevante', () => {
  const { repository: r } = setup();
  for (let i = 0; i < 8; i++) r.addMovement(movement({ type: 'Compra', category: 'Bois', quantity: 1, valueCents: 100 }));
  r.addMovement(movement());
  const data = r.getData();
  data.photos = [{ description: 'foto secreta', image: 'foto secreta' }];
  for (let i = 0; i < 50; i++) data.pastures.push({ id: 'extra-' + i, name: 'Pasto extra ' + i, archived: false });
  const context = buildContext(data, 'Quais as últimas compras?');
  assert.equal(context.summary.byPasture.items.length, CONTEXT_LIMITS.groups);
  assert.ok(context.summary.byPasture.omitted > 0);
  assert.equal(context.recentMovements.length, 5);
  assert.ok(context.recentMovements.every(m => m.type === 'Compra'));
  const serialized = JSON.stringify(context);
  for (const forbidden of ['foto secreta', 'Nota privada', 'owner-1', 'pasture-2', 'Comissão Danilo', 'provenance', 'openingStock', 'movementId']) assert.equal(serialized.includes(forbidden), false);
  assert.ok(new TextEncoder().encode(serialized).byteLength < CONTEXT_LIMITS.maxBytes);
  assert.equal(buildContext(data, 'Qual o saldo?').recentMovements.length, 0);
});

test('provider remoto desativado por padrão, sem histórico; resposta não executa ações', async () => {
  assert.equal(new RemoteProvider().available, false);
  assert.throws(() => new RemoteProvider({ endpoint: 'https://external.example' }));
  const data = createSeed();
  let calls = 0, sent;
  const remote = new RemoteProvider({ endpoint: '/api/assistant', transport: async payload => { calls++; sent = payload; return { text: '<script>apagar()</script>', action: 'clearData' }; } });
  const assistant = new AiAssistant({ getContext: q => buildContext(data, q), remoteProvider: remote });
  await assistant.ask('Venda 5 vacas'); await assistant.ask('Quantas vacas temos?');
  assert.equal(calls, 0);
  const answer = await assistant.ask('Explique uma pergunta não suportada');
  assert.equal(calls, 1); assert.equal(answer.text, '<script>apagar()</script>'); assert.equal(answer.action, undefined);
  assert.deepEqual(Object.keys(sent.payload).sort(), ['context', 'question']);
  assert.equal(summarize(data).total, 169);
  remote.transport = async () => { throw new Error('offline'); };
  assert.match((await assistant.ask('Outra pergunta aberta')).text, /remoto está indisponível/);
});

test('limpar conversa durante resposta pendente descarta resposta antiga', async () => {
  let complete;
  const remote = new RemoteProvider({ endpoint: '/api/assistant', transport: () => new Promise(resolve => { complete = resolve; }) });
  const assistant = new AiAssistant({ getContext: q => buildContext(createSeed(), q), remoteProvider: remote });
  const pending = assistant.ask('Pergunta aberta');
  assistant.clear(); complete({ text: 'Resposta antiga' });
  await pending;
  assert.deepEqual(assistant.history(), []);
  assert.equal(assistant.busy, false);
});

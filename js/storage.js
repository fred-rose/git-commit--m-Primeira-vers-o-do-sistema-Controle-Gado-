import { STORAGE_KEY } from './constants.js';
import { createSeed } from './seed.js';
import { validateData, getStock } from './domain.js';
import { normalize, uid } from './utils.js';
import { applyFinancialSeed, planFinancialSeed } from './finance.js';
import { upgradeData } from './storage/migrations.js';
import { inspectBackup, serializeBackup } from './storage/backup.js';

// Único ponto de acesso à persistência. O domínio pode ser reutilizado por um futuro repositório remoto.
export function createRepository(adapter, makeSeed = createSeed) {
  let state;
  let lastSaved;
  const listeners = new Set();
  function read() {
    let raw;
    try { raw = adapter.getItem(STORAGE_KEY); }
    catch { throw new Error('Não foi possível acessar o armazenamento. Libere os dados locais deste site no navegador.'); }
    if (raw === null) {
      const initial = validateData(makeSeed());
      const serialized = JSON.stringify(initial);
      try { adapter.setItem(STORAGE_KEY, serialized); }
      catch { throw new Error('O navegador não permitiu salvar dados locais. Nada foi iniciado.'); }
      state = initial; lastSaved = serialized;
    } else {
      try { state = validateData(upgradeData(JSON.parse(raw))); lastSaved = raw; }
      catch (error) { throw new Error(`Os dados salvos não puderam ser abertos. Eles foram preservados. ${error.message}`); }
    }
    return structuredClone(state);
  }
  function saveData(next) {
    validateData(next);
    if (adapter.getItem(STORAGE_KEY) !== lastSaved) throw new Error('Os dados mudaram em outra aba. Recarregue a página antes de salvar.');
    const candidate = { ...next, revision: state.revision + 1 };
    const serialized = JSON.stringify(candidate);
    try { adapter.setItem(STORAGE_KEY, serialized); }
    catch { throw new Error('Não foi possível salvar. O espaço local pode estar cheio; exporte uma cópia e remova fotos antigas. Nenhuma alteração foi aplicada.'); }
    state = structuredClone(candidate); lastSaved = serialized;
    for (const listener of listeners) listener();
    return structuredClone(state);
  }
  function transaction(change) {
    if (!state) read();
    const next = structuredClone(state);
    change(next);
    return saveData(next);
  }
  function activePasture(data, id) {
    if (!data.pastures.some(p => p.id === id && !p.archived)) throw new Error('Selecione um pasto ativo.');
  }
  function find(data, collection, id) {
    const item = data[collection].find(x => x.id === id);
    if (!item) throw new Error('Registro não encontrado. Atualize a página.');
    return item;
  }
  function movementValues(input) {
    return { type: input.type, category: input.category, quantity: Number(input.quantity), ownerId: input.ownerId, pastureId: input.pastureId, destinationId: input.type === 'Transferência de pasto' ? input.destinationId : '', date: input.date, valueCents: input.valueCents, note: String(input.note || '').trim() };
  }
  return {
    getData: () => state ? structuredClone(state) : read(),
    reload: read,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    addMovement: input => transaction(data => {
      activePasture(data, input.pastureId);
      if (input.type === 'Transferência de pasto') activePasture(data, input.destinationId);
      const sequence = data.movements.reduce((max, m) => Math.max(max, m.sequence), 0) + 1;
      data.movements.push({ ...movementValues(input), id: uid(), sequence, createdAt: new Date().toISOString() });
    }),
    updateMovement: (id, input) => transaction(data => {
      const current = find(data, 'movements', id);
      if (input.pastureId !== current.pastureId) activePasture(data, input.pastureId);
      if (input.type === 'Transferência de pasto' && input.destinationId !== current.destinationId) activePasture(data, input.destinationId);
      Object.assign(current, movementValues(input));
    }),
    deleteMovement: id => transaction(data => { find(data, 'movements', id); data.movements = data.movements.filter(m => m.id !== id); }),
    savePasture: (id, name) => transaction(data => {
      name = String(name).trim();
      if (data.pastures.some(p => !p.archived && p.id !== id && normalize(p.name) === normalize(name))) throw new Error('Já existe um pasto com esse nome.');
      if (id) find(data, 'pastures', id).name = name;
      else data.pastures.push({ id: uid(), name, archived: false });
    }),
    deletePasture: id => transaction(data => {
      const pasture = find(data, 'pastures', id);
      if (getStock(data).some(l => l.pastureId === id)) throw new Error('Este pasto ainda possui animais. Transfira ou registre a saída antes de excluir.');
      // Exclusão lógica conserva os nomes e vínculos do histórico, inclusive das fotos.
      pasture.archived = true;
    }),
    saveFinance: (id, input) => transaction(data => {
      const values = { type: input.type, category: input.category, date: input.date, valueCents: input.valueCents, description: String(input.description || '').trim(), ownerId: input.ownerId || '', owner: '', property: String(input.property || '').trim(), notes: String(input.notes || '').trim() };
      if (id) {
        const current = find(data, 'finances', id);
        if (current.source !== 'manual') throw new Error('Este registro preserva a planilha original. Consulte os detalhes da importação.');
        Object.assign(current, values);
      } else data.finances.push({ ...values, id: uid(), source: 'manual', movementId: null, createdAt: new Date().toISOString() });
    }),
    deleteFinance: id => transaction(data => {
      if (find(data, 'finances', id).source !== 'manual') throw new Error('A exclusão direta está disponível apenas para lançamentos manuais.');
      data.finances = data.finances.filter(f => f.id !== id);
    }),
    financialSeedPlan: () => planFinancialSeed(state || read()),
    importFinancialSeed: () => transaction(data => applyFinancialSeed(data)),
    savePhoto: (id, input) => transaction(data => {
      const values = { title: String(input.title || '').trim(), description: String(input.description || '').trim(), date: input.date, image: input.image, pastureId: input.pastureId || '', ownerId: input.ownerId || '' };
      if (id) Object.assign(find(data, 'photos', id), values);
      else data.photos.push({ ...values, id: uid() });
    }),
    deletePhoto: id => transaction(data => { find(data, 'photos', id); data.photos = data.photos.filter(p => p.id !== id); }),
    exportData: () => JSON.stringify(state || read(), null, 2),
    exportBackup: () => serializeBackup(state || read()),
    inspectBackup,
    validateBackup: content => inspectBackup(content).data,
    importData: content => {
      const next = inspectBackup(content).data;
      if (!state) read();
      return saveData(next);
    },
    clearData: confirmation => {
      if (confirmation !== 'LIMPAR') throw new Error('Digite LIMPAR para confirmar a exclusão dos registros.');
      if (!state) read();
      return saveData({ ...makeSeed(false), pastures: [], openingStock: [], movements: [], finances: [], photos: [], demo: false, seedVersion: 0, appliedSeeds: [] });
    },
    startEmpty: openingDate => { if (!state) read(); return saveData({ ...makeSeed(false), finances: structuredClone(state.finances), photos: structuredClone(state.photos), pastures: structuredClone(state.pastures), owners: structuredClone(state.owners), seedVersion: state.seedVersion, appliedSeeds: [...state.appliedSeeds], ...(openingDate ? { openingDate } : {}) }); },
    exportRaw: () => adapter.getItem(STORAGE_KEY) || '',
  };
}
let instance;
export function getRepository() { return instance ||= createRepository(window.localStorage); }

import { CATEGORIES, MOVEMENT_TYPES, IN_TYPES, OUT_TYPES, SCHEMA_VERSION } from './constants.js';
import { nameOf, today, formatDate } from './utils.js';
import { validateStructure, validTimestamp } from './storage/schema.js';

function requireThat(condition, message) { if (!condition) throw new Error(message); }
function text(value, label, max = 2000) {
  requireThat(typeof value === 'string' && value.length <= max, `${label} inválido ou muito longo.`);
}
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
function validateDate(value) {
  requireThat(validDate(value) && value <= today(), 'Informe uma data válida, até hoje.');
}
function validateMoney(value) { requireThat(Number.isSafeInteger(value) && value >= 0, 'O valor financeiro deve ser positivo e ter até duas casas decimais.'); }
function validateLot(data, lot) {
  requireThat(CATEGORIES.includes(lot.category), 'Selecione uma categoria válida.');
  requireThat(Number.isSafeInteger(lot.quantity) && lot.quantity > 0, 'A quantidade deve ser um número inteiro maior que zero.');
  requireThat(data.owners.some(o => o.id === lot.ownerId), 'Selecione o proprietário.');
  requireThat(data.pastures.some(p => p.id === lot.pastureId), 'Selecione um pasto válido.');
}
function validateMovement(data, m) {
  validateLot(data, m);
  requireThat(MOVEMENT_TYPES.includes(m.type), 'Selecione o tipo de movimentação.');
  validateDate(m.date);
  requireThat(m.date >= data.openingDate, `A data deve ser igual ou posterior ao início do controle (${formatDate(data.openingDate)}).`);
  requireThat(Number.isSafeInteger(m.sequence) && m.sequence > 0, 'Ordem da movimentação inválida.');
  validateMoney(m.valueCents);
  text(m.note, 'Observação');
  if (m.type === 'Transferência de pasto') {
    requireThat(data.pastures.some(p => p.id === m.destinationId), 'Selecione o pasto de destino.');
    requireThat(m.pastureId !== m.destinationId, 'O pasto de destino deve ser diferente da origem.');
  } else requireThat(!m.destinationId, 'Somente transferências têm pasto de destino.');
  if (!['Compra', 'Venda'].includes(m.type)) requireThat(m.valueCents === 0, 'Este tipo não gera valor financeiro. Use um lançamento manual.');
  if (m.type === 'Venda') requireThat(m.valueCents > 0, 'Informe o valor total da venda.');
  if (m.type === 'Nascimento') requireThat(['Bezerros', 'Bezerras'].includes(m.category), 'Para nascimento, escolha Bezerros ou Bezerras.');
}

const lotKey = (category, ownerId, pastureId) => JSON.stringify([category, ownerId, pastureId]);
export function orderedMovements(data) {
  return [...data.movements].sort((a, b) => a.date.localeCompare(b.date) || a.sequence - b.sequence);
}

// O saldo é uma projeção do estoque inicial e do histórico. Nenhum módulo mantém totais próprios.
export function getStock(data) {
  const stock = new Map();
  function apply(lot, delta, pastureId = lot.pastureId) {
    const key = lotKey(lot.category, lot.ownerId, pastureId);
    const current = stock.get(key) || { category: lot.category, ownerId: lot.ownerId, pastureId, quantity: 0 };
    const quantity = current.quantity + delta;
    requireThat(Number.isSafeInteger(quantity), 'Quantidade acima do limite suportado.');
    requireThat(quantity >= 0, `Saldo insuficiente em ${nameOf(data.pastures, pastureId)}: ${current.quantity} ${lot.category.toLowerCase()} de ${nameOf(data.owners, lot.ownerId)} disponíveis em ${formatDate(lot.date)}. Revise esta movimentação e as posteriores.`);
    stock.set(key, { ...current, quantity });
  }
  data.openingStock.forEach(lot => apply(lot, lot.quantity));
  for (const m of orderedMovements(data)) {
    if (IN_TYPES.includes(m.type)) apply(m, m.quantity);
    if (OUT_TYPES.includes(m.type)) apply(m, -m.quantity);
    if (m.type === 'Transferência de pasto') { apply(m, -m.quantity); apply(m, m.quantity, m.destinationId); }
  }
  const result = [...stock.values()].filter(lot => lot.quantity > 0);
  requireThat(Number.isSafeInteger(result.reduce((sum, lot) => sum + lot.quantity, 0)), 'O total do rebanho excede o limite suportado.');
  return result;
}

export function getFinances(data) {
  const automatic = data.movements.filter(m => ['Compra', 'Venda'].includes(m.type) && m.valueCents > 0).map(m => ({
    id: `movement-${m.id}`, movementId: m.id, type: m.type === 'Venda' ? 'Entrada' : 'Despesa', category: m.type === 'Venda' ? 'Venda de gado' : 'Compra de gado',
    date: m.date, valueCents: m.valueCents, description: `${m.type}: ${m.quantity} ${m.category.toLowerCase()} · ${nameOf(data.owners, m.ownerId)}`, ownerId: m.ownerId, owner: nameOf(data.owners, m.ownerId), pastureId: m.pastureId,
    source: m.type === 'Venda' ? 'cattle_sale' : 'cattle_purchase', property: '', notes: m.note, createdAt: m.createdAt || null,
  }));
  return [...automatic, ...data.finances].sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.id.localeCompare(b.id));
}
export function financialTotals(rows) {
  const income = rows.filter(r => r.type === 'Entrada').reduce((sum, r) => sum + r.valueCents, 0);
  const expense = rows.filter(r => r.type === 'Despesa').reduce((sum, r) => sum + r.valueCents, 0);
  requireThat(Number.isSafeInteger(income) && Number.isSafeInteger(expense), 'O total financeiro excede o limite suportado.');
  return { income, expense, balance: income - expense };
}
export function summarize(data) {
  const stock = getStock(data);
  const sum = predicate => stock.filter(predicate).reduce((total, lot) => total + lot.quantity, 0);
  return {
    stock, total: sum(() => true), categories: CATEGORIES.map(name => ({ name, quantity: sum(l => l.category === name) })),
    pastures: data.pastures.filter(p => !p.archived).map(p => ({ ...p, quantity: sum(l => l.pastureId === p.id) })),
    owners: data.owners.map(o => ({ ...o, quantity: sum(l => l.ownerId === o.id) })),
    financial: financialTotals(getFinances(data)),
  };
}

export function validateData(data) {
  validateStructure(data);
  requireThat(data && data.version === SCHEMA_VERSION, 'Arquivo incompatível com esta versão do sistema.');
  requireThat(typeof data.demo === 'boolean' && Number.isSafeInteger(data.revision) && data.revision >= 0, 'Configuração dos dados inválida.');
  requireThat(Number.isSafeInteger(data.seedVersion) && data.seedVersion >= 0 && Array.isArray(data.appliedSeeds) && data.appliedSeeds.every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id)) && new Set(data.appliedSeeds).size === data.appliedSeeds.length, 'Versão da carga inicial inválida.');
  validateDate(data.openingDate);
  for (const key of ['owners', 'pastures', 'openingStock', 'movements', 'finances', 'photos']) {
    requireThat(Array.isArray(data[key]), `Dados inválidos: ${key}.`);
    const ids = new Set();
    for (const item of data[key]) {
      requireThat(item && typeof item.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(item.id) && !ids.has(item.id), `Identificador inválido ou repetido em ${key}.`);
      ids.add(item.id);
    }
  }
  requireThat(data.owners.length > 0, 'Cadastre ao menos um proprietário.');
  for (const item of [...data.owners, ...data.pastures]) { text(item.name, 'Nome', 100); requireThat(item.name.trim().length > 0, 'O nome é obrigatório.'); }
  for (const p of data.pastures) requireThat(typeof p.archived === 'boolean', 'Situação do pasto inválida.');
  data.openingStock.forEach(lot => validateLot(data, lot));
  const sequences = new Set();
  for (const m of data.movements) { validateMovement(data, m); requireThat(!sequences.has(m.sequence), 'Ordem de movimentação repetida.'); sequences.add(m.sequence); }
  for (const f of data.finances) {
    requireThat(['Entrada', 'Despesa'].includes(f.type), 'Selecione entrada ou despesa.');
    requireThat(['manual', 'migration'].includes(f.source), 'Origem financeira inválida. Lançamentos automáticos devem vir de uma movimentação.');
    text(f.category, 'Categoria financeira', 100);
    if (f.source === 'manual') requireThat(f.category.trim(), 'Informe a categoria financeira.');
    if (f.date || f.source === 'manual') validateDate(f.date);
    else requireThat(f.date === null || f.date === '', 'Data financeira inválida.');
    validateMoney(f.valueCents);
    requireThat(f.valueCents > 0, 'O valor do lançamento deve ser maior que zero.');
    text(f.description, 'Descrição', 500); requireThat(f.description.trim(), 'Informe a descrição do lançamento.');
    requireThat(!f.movementId && !f.pastureId, 'Lançamentos independentes não podem simular vínculos automáticos.');
    requireThat(!f.ownerId || data.owners.some(o => o.id === f.ownerId), 'Proprietário financeiro inválido.');
    text(f.owner, 'Proprietário', 100); text(f.property, 'Propriedade', 150); text(f.notes, 'Observação');
    requireThat(f.createdAt === null || validTimestamp(f.createdAt), 'Data de cadastro inválida.');
    if (f.source === 'migration') {
      const p = f.provenance;
      requireThat(p && typeof p === 'object' && Number.isSafeInteger(p.row) && p.row > 1, 'Referência da migração inválida.');
      for (const key of ['migrationId', 'workbook', 'workbookHash', 'sheet', 'originalDate', 'originalOperation', 'originalAmount', 'originalDescription']) text(p[key], 'Referência da planilha');
      if (p.originalBalance !== null) text(p.originalBalance, 'Saldo histórico');
    }
  }
  for (const p of data.photos) {
    text(p.title, 'Título', 100); requireThat(p.title.trim(), 'Informe o título da foto.');
    text(p.description, 'Descrição'); validateDate(p.date);
    requireThat(!p.pastureId || data.pastures.some(x => x.id === p.pastureId), 'Pasto da foto inválido.');
    requireThat(!p.ownerId || data.owners.some(x => x.id === p.ownerId), 'Proprietário da foto inválido.');
    requireThat(typeof p.image === 'string' && p.image.length <= 600000 && /^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/]+=*$/.test(p.image), 'Imagem inválida ou muito grande.');
  }
  const stock = getStock(data);
  requireThat(!stock.some(l => data.pastures.find(p => p.id === l.pastureId).archived), 'Um pasto excluído não pode conter animais.');
  financialTotals(getFinances(data));
  return data;
}

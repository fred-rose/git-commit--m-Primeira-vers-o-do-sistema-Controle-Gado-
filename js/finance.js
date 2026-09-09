import { FINANCIAL_SEED } from './data/financial-seed.js';
import { normalize, nameOf } from './utils.js';

export const FINANCE_SOURCES = [
  { id: 'manual', name: 'Manual' }, { id: 'cattle_sale', name: 'Venda de gado' },
  { id: 'cattle_purchase', name: 'Compra de gado' }, { id: 'migration', name: 'Planilha original' },
];
export const FINANCE_CATEGORIES = ['Venda de gado', 'Outras receitas', 'Compra de gado', 'Mão de obra', 'Medicamentos', 'Alimentação', 'Combustível', 'Transporte', 'Manutenção', 'Outros'];
export const financeSourceLabel = source => FINANCE_SOURCES.find(s => s.id === source)?.name || 'Manual';
export const financeOwnerName = (data, row) => row.ownerId ? nameOf(data.owners, row.ownerId) : row.owner || '';
export const financeCategories = data => [...new Set([...FINANCE_CATEGORIES, ...data.finances.map(f => f.category).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
export function financeOwnerOptions(data) {
  return [...data.owners, ...[...new Set(data.finances.filter(f => !f.ownerId && f.owner).map(f => f.owner))].map(owner => ({ id: `name:${owner}`, name: owner })), { id: 'unassigned', name: 'Não informado' }];
}

export { upgradeData } from './storage/migrations.js';

function fingerprint(row) {
  return JSON.stringify([row.date, row.type, row.valueCents, normalize(row.description).trim().replace(/\s+/g, ' ')]);
}
export function planFinancialSeed(data) {
  const manifest = FINANCIAL_SEED.manifest;
  if (data.appliedSeeds.includes(manifest.id)) return { manifest, records: [], skipped: manifest.recordCount, applied: true };
  const ids = new Set(data.finances.map(f => f.id));
  const signatures = new Set(data.finances.map(fingerprint));
  // Uma operação já cadastrada pode corresponder ao lançamento da planilha.
  for (const m of data.movements.filter(m => ['Venda', 'Compra'].includes(m.type) && m.valueCents > 0)) {
    signatures.add(fingerprint({ date: m.date, type: m.type === 'Venda' ? 'Entrada' : 'Despesa', valueCents: m.valueCents, description: m.note || `${m.type}: ${m.quantity} ${m.category.toLowerCase()}` }));
  }
  const records = FINANCIAL_SEED.records.filter(f => !ids.has(f.id) && !signatures.has(fingerprint(f)));
  return { manifest, records: structuredClone(records), skipped: manifest.recordCount - records.length, applied: false };
}
export function applyFinancialSeed(data) {
  const plan = planFinancialSeed(data);
  if (plan.applied) return plan;
  data.finances.push(...plan.records);
  data.appliedSeeds.push(plan.manifest.id);
  data.seedVersion = Math.max(data.seedVersion, plan.manifest.seedVersion);
  return plan;
}

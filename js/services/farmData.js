import { SCHEMA_VERSION } from '../constants.js';
import { today } from '../utils.js';
export const ALL_FARMS = 'ALL_FARMS';
const camel = key => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
export const mapRow = row => Object.fromEntries(Object.entries(row).map(([key,value]) => [key === 'destination_pasture_id' ? 'destinationId' : camel(key), value]));
export function snapshotData(raw, { userId, selected = ALL_FARMS, readOnly = false } = {}) {
  const farms = (raw.farms || []).map(mapRow);
  if (selected !== ALL_FARMS && !farms.some(f => f.id === selected)) throw new Error('Fazenda não encontrada ou sem acesso.');
  const allowed = new Set(farms.filter(f => selected === ALL_FARMS || f.id === selected).map(f => f.id));
  const rows = key => (raw[key] || []).filter(r => allowed.has(r.farm_id)).map(mapRow);
  const farm = selected === ALL_FARMS ? null : farms.find(f => f.id === selected);
  return {
    cloud: true, version: SCHEMA_VERSION, revision: farm?.revision || 0, demo: false, seedVersion: 0, appliedSeeds: [],
    openingDate: farms.filter(f => allowed.has(f.id)).map(f => f.openingDate).sort()[0] || today(),
    userId, scope: farm ? 'SINGLE_FARM' : ALL_FARMS, farm, farms: farms.filter(f => allowed.has(f.id)), readOnly,
    owners: rows('owners'), pastures: rows('pastures'), openingStock: rows('opening_stock'), stock: rows('herd_stock'),
    movements: rows('movements').map(m => ({ ...m, valueCents: m.valueCents || 0, ownerId: m.ownerId || '', pastureId: m.pastureId || '', destinationId: m.destinationId || '' })),
    finances: rows('finances').filter(f => !f.movementId), photos: rows('photos'), capacityRules: rows('capacity_rules'),
    alerts: rows('alerts'), modeChanges: rows('mode_changes'), imports: rows('imports'), pendingSync: [],
  };
}
export function projectPending(data, queue) {
  const next = structuredClone(data), ids = new Set(next.movements.map(m => m.clientMutationId));
  next.pendingSync = queue.filter(r => r.userId === next.userId && next.farms.some(f => f.id === r.farmId) && !['synced','superseded'].includes(r.status));
  for (const row of next.pendingSync) {
    if (ids.has(row.clientMutationId) || row.status === 'failed') continue;
    const m = { ...row.payload, id: row.payload.id || row.clientMutationId, farmId: row.farmId, clientMutationId: row.clientMutationId, sequence: Number.MAX_SAFE_INTEGER - 100000 + row.order, pending: true, createdAt: row.createdAt };
    const delta = m.quantity * (['Venda','Saída','Morte','Transferência de pasto'].includes(m.type) ? -1 : m.type === 'Ajuste de contagem' ? m.direction : 1);
    const update = (pastureId, q) => {
      let stock = next.stock.find(l => l.farmId === m.farmId && l.category === m.category && (l.ownerId || '') === (m.ownerId || '') && (l.pastureId || '') === (pastureId || ''));
      if (!stock) { stock = { farmId: m.farmId, category: m.category, ownerId: m.ownerId || '', pastureId: pastureId || '', quantity: 0 }; next.stock.push(stock); }
      if (stock.quantity + q < 0) return false;
      stock.quantity += q; return true;
    };
    if (!update(m.pastureId, delta)) { row.projectionConflict = true; continue; }
    if (m.type === 'Transferência de pasto') update(m.destinationId, m.quantity);
    next.movements.push(m);
  }
  next.stock = next.stock.filter(l => l.quantity>0);
  return next;
}

import { orderedMovements, getFinances, getStock } from './domain.js';
import { matches, inPeriod, nameOf } from './utils.js';
import { financeOwnerName } from './finance.js';
export function filterMovements(data, f = {}) {
  return orderedMovements(data).reverse().filter(m => (!f.type || m.type === f.type) && (!f.category || m.category === f.category) && (!f.ownerId || m.ownerId === f.ownerId) && (!f.pastureId || m.pastureId === f.pastureId || m.destinationId === f.pastureId) && inPeriod(m.date, f) && matches(f.q, [m.type, m.category, m.note, nameOf(data.owners, m.ownerId), nameOf(data.pastures, m.pastureId), nameOf(data.pastures, m.destinationId)]));
}
export function filterStock(data, f = {}) {
  return getStock(data).filter(l => (!f.category || l.category === f.category) && (!f.ownerId || l.ownerId === f.ownerId) && (!f.pastureId || l.pastureId === f.pastureId) && matches(f.q, [l.category, nameOf(data.owners, l.ownerId), nameOf(data.pastures, l.pastureId)]));
}
export function filterFinances(data, f = {}) {
  return getFinances(data).filter(r => {
    const owner = financeOwnerName(data, r);
    const ownerMatch = !f.ownerId || (f.ownerId === 'unassigned' ? !owner : f.ownerId.startsWith('name:') ? owner === f.ownerId.slice(5) : r.ownerId === f.ownerId);
    return (!f.type || r.type === f.type) && (!f.category || r.category === f.category) && (!f.source || r.source === f.source) && (!f.sheet || r.provenance?.sheet === f.sheet) && ownerMatch && ((!r.date && !f.from && !f.to) || (r.date && inPeriod(r.date, f))) && matches(f.q, [r.type, r.category, r.description, owner, r.property, r.notes, r.provenance?.sheet || '']);
  });
}

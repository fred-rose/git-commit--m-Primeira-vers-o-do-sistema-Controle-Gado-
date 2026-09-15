import { summarize, getFinances, financialTotals, orderedMovements } from '../domain.js';
import { normalize, today } from '../utils.js';
import { capacitySummary } from '../capacity/capacityService.js';
import { activeAlerts } from '../capacity/alertsService.js';
import { evolution,periodRange } from '../services/evolution.js';

export const CONTEXT_LIMITS = Object.freeze({ groups: 20, recentMovements: 5, selectedNames: 4, nameLength: 100, maxBytes: 12000 });
export const normalizeQuestion = value => normalize(value).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const aliases = { Vacas: ['vaca', 'vacas'], Bois: ['boi', 'bois'], Novilhas: ['novilha', 'novilhas'], Bezerras: ['bezerra', 'bezerras'], Bezerros: ['bezerro', 'bezerros'] };

function namedMatches(question, entities) {
  const hits = entities.map(item => ({ ...item, normalized: normalizeQuestion(item.name) })).filter(item => item.normalized && ` ${question} `.includes(` ${item.normalized} `));
  return hits.filter(item => !hits.some(other => other.normalized !== item.normalized && other.normalized.includes(item.normalized))).slice(0, CONTEXT_LIMITS.selectedNames);
}
function groups(items) {
  const sorted = [...items].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
  return { items: sorted.slice(0, CONTEXT_LIMITS.groups).map(x => ({ name: x.name.slice(0, CONTEXT_LIMITS.nameLength), quantity: x.quantity })), omitted: Math.max(0, sorted.length - CONTEXT_LIMITS.groups) };
}

// Só este construtor lê a base. Providers recebem exclusivamente agregações limitadas.
export function buildContext(data, question = '', asOf = today()) {
  const q = normalizeQuestion(question), summary = summarize(data), finances = getFinances(data);
  const categories = Object.entries(aliases).filter(([, names]) => names.some(name => ` ${q} `.includes(` ${name} `))).map(([name]) => name);
  const pastures = namedMatches(q, data.pastures.filter(p => !p.archived)), owners = namedMatches(q, data.owners);
  const selectedStock = summary.stock.filter(l => (!categories.length || categories.includes(l.category)) && (!pastures.length || pastures.some(p => p.id === l.pastureId)) && (!owners.length || owners.some(o => o.id === l.ownerId)));
  const month = asOf.slice(0, 7), monthly = financialTotals(finances.filter(f => f.date?.slice(0, 7) === month));
  const context = {
    asOf, demoHerd: data.demo,
    summary: { totalCattle: summary.total, byCategory: summary.categories.map(c => ({ name: c.name, quantity: c.quantity })), byPasture: groups(summary.pastures), byOwner: groups(summary.owners) },
    financial: { balanceCents: summary.financial.balance, totalIncomeCents: summary.financial.income, totalExpenseCents: summary.financial.expense, month, monthlyIncomeCents: monthly.income, monthlyExpenseCents: monthly.expense, monthlyBalanceCents: monthly.balance },
    selected: { categories, pastures: pastures.map(p => p.name), owners: owners.map(o => o.name), quantity: selectedStock.reduce((sum, l) => sum + l.quantity, 0) },
    recentMovements: [],
  };
  const recentType = /\bvendas?\b/.test(q) ? 'Venda' : /\bcompras?\b/.test(q) ? 'Compra' : null;
  if (/\b(ultim[ao]s?|recentes?|historico)\b/.test(q)) context.recentMovements = orderedMovements(data).reverse().filter(m => (!recentType || m.type === recentType) && (!categories.length || categories.includes(m.category)) && (!owners.length || owners.some(o => o.id === m.ownerId)) && (!pastures.length || pastures.some(p => [m.pastureId, m.destinationId].includes(p.id)))).slice(0, CONTEXT_LIMITS.recentMovements).map(m => ({ date: m.date, type: m.type, category: m.category, quantity: m.quantity }));
  if(data.cloud){
    context.scope=data.scope;context.farm=data.farm?{name:data.farm.name,controlMode:data.farm.controlMode}:null;
    context.capacity=capacitySummary(data).slice(0,10).map(c=>({name:c.name,heads:c.heads,maxHeads:c.maxHeads,state:c.state,percentage:Math.round(c.percentage)}));
    context.alerts={pending:activeAlerts(data).length};context.pendingSync=data.pendingSync?.length||0;
    context.growth=evolution(data,periodRange('30',asOf)).farms.sort((a,b)=>b.change-a.change).slice(0,5).map(f=>({name:f.name,change:f.change,percentage:f.percentage}));
  }
  if (new TextEncoder().encode(JSON.stringify(context)).byteLength > CONTEXT_LIMITS.maxBytes) throw new Error('Não foi possível preparar um contexto resumido dentro do limite.');
  return context;
}

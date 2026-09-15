import * as XLSX from './vendor/xlsx.js';
import { summarize, getFinances, getStock } from './domain.js';
import { filterStock, filterMovements, filterFinances } from './queries.js';
import { CATEGORIES } from './constants.js';
import { nameOf, today, formatDate, download } from './utils.js';
import { financeOwnerName, financeSourceLabel } from './finance.js';

const currencyFormat = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const cell = value => value === null || value === undefined || value === '' ? { t: 's', v: '' } : typeof value === 'number' ? { t: 'n', v: value } : { t: 's', v: String(value) };
const amount = cents => ({ t: 'n', v: cents / 100, z: currencyFormat });
const date = iso => iso ? { t: 'n', v: (Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000, z: 'dd/mm/yyyy' } : cell('');
const tableContext = filters => [filters.from ? `De ${formatDate(filters.from)}` : '', filters.to ? `até ${formatDate(filters.to)}` : '', filters.q ? `Pesquisa: ${filters.q}` : ''].filter(Boolean).join(' · ');

function sheet(title, headers, rows, context = '', widths = []) {
  const values = [[cell(title)], [cell(`Emitido em ${formatDate(today())}${context ? ' · ' + context : ''}`)], [], headers.map(cell), ...rows.map(row => row.map(value => value?.t ? value : cell(value)))];
  const result = XLSX.utils.aoa_to_sheet(values);
  result['!cols'] = headers.map((header, i) => ({ wch: widths[i] || Math.min(45, Math.max(18, header.length + 4)) }));
  result['!merges'] = [0, 1].map(r => ({ s: { r, c: 0 }, e: { r, c: headers.length - 1 } }));
  result['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: Math.max(3, values.length - 1), c: headers.length - 1 } }) };
  return result;
}

function herdSheet(data, filters) {
  return sheet('Rebanho atual', ['Categoria', 'Quantidade', 'Proprietário', 'Pasto'], filterStock(data, filters).map(l => [l.category, l.quantity, nameOf(data.owners, l.ownerId), nameOf(data.pastures, l.pastureId)]), 'Saldo atual · ' + filterContext(data, filters), [18, 15, 24, 28]);
}
function movementSheet(data, filters) {
  const rows = filterMovements(data, filters).filter(m => filters.report === 'trades' ? ['Compra', 'Venda'].includes(m.type) : filters.report === 'births' ? ['Nascimento', 'Morte'].includes(m.type) : true);
  return sheet('Movimentações do rebanho', ['Data', 'Tipo', 'Categoria', 'Quantidade', 'Proprietário', 'Pasto / origem', 'Pasto de destino', 'Valor total', 'Observação'], rows.map(m => [date(m.date), m.type, m.category, m.quantity, nameOf(data.owners, m.ownerId), nameOf(data.pastures, m.pastureId), m.destinationId ? nameOf(data.pastures, m.destinationId) : '', amount(m.valueCents), m.note]), filterContext(data, filters), [14, 28, 18, 14, 22, 28, 28, 20, 55]);
}
function pastureSheet(data) {
  const stock = getStock(data), total = stock.reduce((sum, l) => sum + l.quantity, 0);
  return sheet('Pastos da fazenda', ['Pasto', 'Situação', 'Quantidade', 'Participação no rebanho', ...CATEGORIES, 'Proprietários'], data.pastures.map(p => {
    const lots = stock.filter(l => l.pastureId === p.id), quantity = lots.reduce((sum, l) => sum + l.quantity, 0);
    return [p.name, p.archived ? 'Excluído (histórico)' : 'Ativo', quantity, { t: 'n', v: total ? quantity / total : 0, z: '0.00%' }, ...CATEGORIES.map(c => lots.filter(l => l.category === c).reduce((sum, l) => sum + l.quantity, 0)), [...new Set(lots.map(l => nameOf(data.owners, l.ownerId)))].join(', ')];
  }));
}
function filterContext(data, filters) {
  return [tableContext(filters), filters.ownerId ? `Proprietário: ${filters.ownerId === 'unassigned' ? 'Não informado' : filters.ownerId.startsWith('name:') ? filters.ownerId.slice(5) : nameOf(data.owners, filters.ownerId)}` : '', filters.pastureId ? `Pasto: ${nameOf(data.pastures, filters.pastureId)}` : '', filters.category ? `Categoria: ${filters.category}` : '', filters.type ? `Tipo: ${filters.type}` : '', filters.source ? `Origem: ${financeSourceLabel(filters.source)}` : '', filters.sheet ? `Aba: ${filters.sheet}` : ''].filter(Boolean).join(' · ');
}
function financeSheet(data, filters) {
  return sheet('Lançamentos financeiros', ['Data', 'Tipo', 'Categoria', 'Descrição', 'Proprietário', 'Propriedade', 'Valor', 'Origem', 'Vínculo', 'Observação', 'Aba de origem', 'Linha na planilha', 'Valor original na planilha', 'Saldo histórico (conferência)'], filterFinances(data, filters).map(f => [date(f.date), f.type, f.category, f.description, financeOwnerName(data, f), f.property, amount(f.valueCents), financeSourceLabel(f.source), f.movementId ? 'Vinculado à movimentação de ' + (f.source === 'cattle_sale' ? 'venda' : 'compra') : '', f.notes, f.provenance?.sheet || '', f.provenance?.row || '', f.provenance?.originalAmount || '', f.provenance?.originalBalance || '']), filterContext(data, filters), [14, 14, 24, 55, 22, 26, 22, 22, 35, 45, 38, 20, 28, 34]);
}
function summarySheet(data) {
  const summary = summarize(data), finances = getFinances(data);
  const rows = [
    ['Rebanho', 'Total de cabeças', summary.total, 'Saldo atual'],
    ...summary.categories.map(c => ['Categoria', c.name, c.quantity, 'Cabeças']),
    ...summary.owners.map(o => ['Proprietário', o.name, o.quantity, 'Cabeças']),
    ...summary.pastures.map(p => ['Pasto', p.name, p.quantity, 'Cabeças']),
    ['Financeiro', 'Entradas', amount(summary.financial.income), 'Todos os lançamentos'],
    ['Financeiro', 'Despesas', amount(summary.financial.expense), 'Todos os lançamentos'],
    ['Financeiro', 'Saldo', amount(summary.financial.balance), 'Entradas menos despesas'],
    ['Financeiro', 'Compras de gado — lançamentos', finances.filter(f => f.type === 'Despesa' && f.category === 'Compra de gado').length, 'Inclui compras identificadas na migração'],
    ['Financeiro', 'Vendas de gado — lançamentos', finances.filter(f => f.type === 'Entrada' && f.category === 'Venda de gado').length, 'Inclui vendas identificadas na migração'],
    ...['Compra', 'Venda', 'Nascimento', 'Morte'].flatMap(type => {
      const movements = data.movements.filter(m => m.type === type);
      return [['Movimentações', type, movements.length, 'Operações registradas no rebanho'], ['Movimentações', `${type} — animais`, movements.reduce((sum, m) => sum + m.quantity, 0), 'Cabeças movimentadas']];
    }),
    ['Origem financeira', 'Planilha original', finances.filter(f => f.source === 'migration').length, 'Lançamentos; não geram movimentações retroativas de animais'],
    ['Inventário', 'Natureza do rebanho', data.demo ? 'Demonstrativo' : 'Controle da fazenda', 'O financeiro importado contém dados reais'],
  ];
  return sheet('Relatório geral da fazenda', ['Grupo', 'Indicador', 'Valor / quantidade', 'Referência'], rows, 'Todos os dados atuais; sem filtros', [25, 34, 25, 70]);
}

export function buildWorkbook(data, kind = 'general', filters = {}) {
  const workbook = XLSX.utils.book_new();
  workbook.Props = { Title: kind === 'general' ? 'Relatório geral — Controle Gado' : 'Controle Gado', Author: 'Controle Gado', CreatedDate: new Date() };
  const definitions = [
    ['Resumo', 'summary', () => summarySheet(data)], ['Rebanho', 'herd', () => herdSheet(data, filters)],
    ['Movimentações', 'movements', () => movementSheet(data, filters)], ['Pastos', 'pastures', () => pastureSheet(data)],
    ['Financeiro', 'finance', () => financeSheet(data, filters)],
  ];
  if (!['general', 'herd', 'movements', 'pastures', 'finance'].includes(kind)) throw new Error('Selecione um relatório válido para exportar.');
  // O geral sempre representa o banco completo, independentemente do filtro da tela.
  if (kind === 'general') filters = {};
  for (const [name, target, create] of definitions) if (kind === 'general' || kind === target) {
    const result=create();
    if(data.cloud){
      const entities=target==='herd'?filterStock(data,filters):target==='finance'?filterFinances(data,filters):target==='pastures'?data.pastures:target==='movements'?filterMovements(data,filters).filter(m=>filters.report==='trades'?['Compra','Venda'].includes(m.type):filters.report==='births'?['Nascimento','Morte'].includes(m.type):true):[];
      const range=XLSX.utils.decode_range(result['!ref']),column=range.e.c+1;
      result[XLSX.utils.encode_cell({r:3,c:column})]=cell('Fazenda');
      for(let r=4;r<=range.e.r;r++)result[XLSX.utils.encode_cell({r,c:column})]=cell(data.farm?.name||data.farms.find(f=>f.id===entities[r-4]?.farmId)?.name||'Todas as fazendas');
      range.e.c=column;result['!ref']=XLSX.utils.encode_range(range);result['!cols'].push({wch:30});result['!autofilter'].ref=XLSX.utils.encode_range({s:{r:3,c:0},e:range.e});
    }
    XLSX.utils.book_append_sheet(workbook,result,name);
  }
  return workbook;
}
export function exportExcel(data, kind, filters = {}) {
  const workbook = buildWorkbook(data, kind, filters);
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
  const names = { general: 'relatorio-geral', herd: 'rebanho', movements: 'movimentacoes', pastures: 'pastos', finance: 'financeiro' };
  download(`controle-gado-${names[kind]}-${today()}.xlsx`, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

import { financialTotals } from '../domain.js';
import { filterStock, filterMovements, filterFinances } from '../queries.js';
import { escapeHtml as h, nameOf, formatDate, today, number } from '../utils.js';
import { pageHeading, filtersForm, table, movementTable, financeCards, financeTable, button } from '../components/ui.js';
import { financeOwnerName, financeSourceLabel } from '../finance.js';

export function reportData(data, filters) {
  const kind = ['herd', 'movements', 'finance', 'trades', 'births'].includes(filters.report) ? filters.report : 'herd';
  const titles = { herd: 'Resumo atual do rebanho', movements: 'Movimentações do rebanho', finance: 'Financeiro por período', trades: 'Compras e vendas', births: 'Nascimentos e mortes' };
  let rows;
  let csvRows;
  if (kind === 'herd') {
    rows = filterStock(data, filters);
    csvRows = [['Categoria', 'Quantidade', 'Proprietário', 'Pasto'], ...rows.map(l => [l.category, l.quantity, nameOf(data.owners, l.ownerId), nameOf(data.pastures, l.pastureId)])];
  } else if (kind === 'finance') {
    rows = filterFinances(data, filters);
    csvRows = [['Data', 'Tipo', 'Categoria', 'Descrição', 'Proprietário', 'Propriedade', 'Valor (R$)', 'Origem', 'Observação', 'Aba de origem'], ...rows.map(f => [formatDate(f.date), f.type, f.category, f.description, financeOwnerName(data, f), f.property, (f.valueCents / 100).toFixed(2).replace('.', ','), financeSourceLabel(f.source), f.notes, f.provenance?.sheet || ''])];
  } else {
    rows = filterMovements(data, filters).filter(m => kind === 'trades' ? ['Compra', 'Venda'].includes(m.type) : kind === 'births' ? ['Nascimento', 'Morte'].includes(m.type) : true);
    csvRows = [['Data', 'Tipo', 'Categoria', 'Quantidade', 'Proprietário', 'Pasto de origem / pasto', 'Pasto de destino', 'Valor (R$)', 'Observação'], ...rows.map(m => [formatDate(m.date), m.type, m.category, m.quantity, nameOf(data.owners, m.ownerId), nameOf(data.pastures, m.pastureId), m.destinationId ? nameOf(data.pastures, m.destinationId) : '', (m.valueCents / 100).toFixed(2).replace('.', ','), m.note])];
  }
  const context = [kind === 'herd' ? 'Saldo atual; não representa posição histórica.' : `Período: ${filters.from ? formatDate(filters.from) : 'início'} a ${filters.to ? formatDate(filters.to) : 'hoje'}.`];
  if (filters.ownerId) context.push(`Proprietário: ${filters.ownerId === 'unassigned' ? 'Não informado' : filters.ownerId.startsWith('name:') ? filters.ownerId.slice(5) : nameOf(data.owners, filters.ownerId)}.`);
  if (kind !== 'finance') {
    if (filters.pastureId) context.push(`Pasto: ${nameOf(data.pastures, filters.pastureId)}.`);
  }
  if (kind === 'finance') {
    if (filters.category) context.push(`Categoria: ${filters.category}.`);
    if (filters.type) context.push(`Tipo: ${filters.type}.`);
    if (filters.source) context.push(`Origem: ${financeSourceLabel(filters.source)}.`);
    if (filters.sheet) context.push(`Aba: ${filters.sheet}.`);
  }
  return { kind, title: titles[kind], rows, csvRows, context: context.join(' ') };
}
export function render(data, filters) {
  const report = reportData(data, filters);
  let body;
  if (report.kind === 'herd') body = `<p class="report-total">${number(report.rows.reduce((sum, l) => sum + l.quantity, 0))} cabeças</p>${table(report.csvRows[0], report.csvRows.slice(1).map(row => row.map(h)))}`;
  else if (report.kind === 'finance') body = financeCards(financialTotals(report.rows)) + financeTable(data, report.rows, false);
  else body = `<p class="report-total">${number(report.rows.length)} movimentações · ${number(report.rows.reduce((sum, m) => sum + m.quantity, 0))} cabeças movimentadas</p>${movementTable(data, report.rows, false)}<p class="page-footnote">Cabeças movimentadas soma os registros; um mesmo animal pode participar de mais de uma operação.</p>`;
  const excelKind = report.kind === 'herd' ? 'herd' : report.kind === 'finance' ? 'finance' : 'movements';
  return `${pageHeading('Relatórios', 'Exporte o recorte selecionado ou gere o relatório geral com todos os dados.', `<div class="row-actions no-print">${button('Relatório geral (Excel)', 'export-excel', 'general', 'primary-button')}${button('Exportar Excel', 'export-excel', excelKind)}${button('Exportar CSV', 'export-csv')}${button('Imprimir', 'print')}</div>`)}${filtersForm(data, { ...filters, report: report.kind }, { reports: true, period: report.kind !== 'herd', herd: report.kind !== 'finance', finance: report.kind === 'finance', type: report.kind === 'finance', search: false })}<section class="panel report"><div class="report-heading"><p class="eyebrow">Controle Gado · ${data.demo && report.kind !== 'finance' ? 'Rebanho demonstrativo' : 'Gestão da Fazenda'}</p><h3>${report.title}</h3><p>${h(report.context)}</p><p>Emitido em ${formatDate(today())}</p></div>${body}</section>`;
}

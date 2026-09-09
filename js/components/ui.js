import { CATEGORIES, MOVEMENT_TYPES } from '../constants.js';
import { escapeHtml as h, money, formatDate, nameOf, number, today } from '../utils.js';
import { icon } from './icons.js';
import { financeSourceLabel, financeOwnerName, financeCategories, financeOwnerOptions, FINANCE_SOURCES } from '../finance.js';

export function options(items, selected = '', placeholder) {
  return (placeholder !== undefined ? `<option value="">${h(placeholder)}</option>` : '') + items.map(item => {
    const value = typeof item === 'string' ? item : item.id;
    const label = typeof item === 'string' ? item : item.name + (item.archived ? ' (excluído)' : '');
    return `<option value="${h(value)}" ${value === selected ? 'selected' : ''}>${h(label)}</option>`;
  }).join('');
}
export function selectField(name, label, items, value = '', placeholder, required = true) {
  return `<label class="form-group"><span>${h(label)}</span><select name="${h(name)}" ${required ? 'required' : ''}>${options(items, value, placeholder)}</select></label>`;
}
export function inputField(name, label, value = '', type = 'text', extra = '') {
  return `<label class="form-group"><span>${h(label)}</span><input name="${h(name)}" type="${type}" value="${h(value)}" ${extra}></label>`;
}
export const dateField = (value = today(), min = '') => inputField('date', 'Data', value, 'date', `required max="${today()}" ${min ? `min="${min}"` : ''}`);
export const textareaField = (name, label, value = '', max = 2000) => `<label class="form-group full-width"><span>${h(label)}</span><textarea name="${name}" rows="3" maxlength="${max}">${h(value)}</textarea></label>`;
export const emptyState = (title = 'Nenhum registro encontrado.', description = 'Altere os filtros ou adicione um novo registro.') => `<div class="empty-state">${icon('herd')}<strong>${h(title)}</strong><p>${h(description)}</p></div>`;
export const pageHeading = (title, subtitle, action = '') => `<div class="section-heading"><div><h3>${h(title)}</h3><p>${h(subtitle)}</p></div>${action}</div>`;
export const button = (label, action, id = '', style = 'secondary-button') => `<button class="${style}" data-action="${action}" ${id ? `data-id="${h(id)}"` : ''}>${h(label)}</button>`;
export function table(headers, rows, emptyDescription) {
  if (!rows.length) return emptyState(undefined, emptyDescription);
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="Tabela de registros; deslize para ver todas as colunas"><table><thead><tr>${headers.map(x => `<th scope="col">${h(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export function movementTable(data, rows, editable = true) {
  const headers = ['Data', 'Tipo', 'Categoria', 'Qtd.', 'Proprietário', 'Pasto', 'Valor total', 'Observação'];
  if (editable) headers.push('Ações');
  return table(headers, rows.map(m => {
    const cells = [h(formatDate(m.date)), `<span class="badge ${['Venda', 'Morte', 'Saída'].includes(m.type) ? 'sale' : 'birth'}">${h(m.type)}</span>`, h(m.category), `<strong>${number(m.quantity)}</strong>`, h(nameOf(data.owners, m.ownerId)), h(nameOf(data.pastures, m.pastureId)) + (m.destinationId ? ` → ${h(nameOf(data.pastures, m.destinationId))}` : ''), m.valueCents ? money(m.valueCents) : '—', `<span class="note-cell">${h(m.note || '—')}</span>`];
    if (editable) cells.push(`<div class="row-actions">${button('Editar', 'edit-movement', m.id, 'text-button')}${button('Excluir', 'delete-movement', m.id, 'text-button red')}</div>`);
    return cells;
  }), 'As movimentações registradas aparecerão aqui.');
}
export function financeCards(totals) {
  return `<div class="finance-cards">${[['Entradas', totals.income, 'green'], ['Despesas', totals.expense, 'red'], ['Saldo', totals.balance, totals.balance < 0 ? 'red' : '']].map(([label, value, cls]) => `<div class="panel metric"><span>${label}</span><strong class="${cls}">${money(value)}</strong></div>`).join('')}</div>`;
}
export function financeTable(data, rows, editable = true) {
  return table(['Data', 'Tipo', 'Categoria', 'Descrição', 'Proprietário', 'Valor', 'Origem', ...(editable ? ['Ações'] : [])], rows.map(f => [
    h(formatDate(f.date)), `<span class="badge ${f.type === 'Entrada' ? 'birth' : 'sale'}">${h(f.type)}</span>`, h(f.category || 'Não informada'), `<span class="note-cell">${h(f.description)}</span>`, h(financeOwnerName(data, f) || 'Não informado'), money(f.valueCents), `<span class="badge ${f.movementId ? 'purchase' : 'birth'}">${h(financeSourceLabel(f.source))}</span>${f.movementId ? '<small class="source-detail">Vinculado ao rebanho</small>' : f.provenance ? `<small class="source-detail">${h(f.provenance.sheet)}</small>` : ''}`,
    ...(editable ? [`<div class="row-actions">${f.movementId ? button('Ver movimentação', 'edit-movement', f.movementId, 'text-button') : f.source === 'migration' ? button('Ver detalhes', 'view-finance', f.id, 'text-button') : button('Editar', 'edit-finance', f.id, 'text-button') + button('Excluir', 'delete-finance', f.id, 'text-button red')}</div>`] : []),
  ]));
}
export function filtersForm(data, f = {}, { period = false, type = false, herd = true, search = true, category = false, finance = false, reports = false } = {}) {
  const active = Object.entries(f).filter(([key, value]) => key !== 'report' && value).length;
  return `<details class="filter-disclosure no-print" open><summary>${reports ? 'Selecionar relatório e filtros' : 'Filtrar registros'}${active ? `<span>${active} aplicado${active > 1 ? 's' : ''}</span>` : ''}</summary><form class="filters no-print" id="filters-form">
    ${search ? inputField('q', 'Pesquisar', f.q || '', 'search', 'placeholder="Busque nos registros"') : ''}
    ${reports ? selectField('report', 'Relatório', [ {id:'herd',name:'Resumo do rebanho'}, {id:'movements',name:'Movimentações'}, {id:'finance',name:'Financeiro por período'}, {id:'trades',name:'Compras e vendas'}, {id:'births',name:'Nascimentos e mortes'} ], f.report || 'herd', undefined, false) : ''}
    ${type ? selectField('type', 'Tipo', finance ? ['Entrada', 'Despesa'] : MOVEMENT_TYPES, f.type, 'Todos os tipos', false) : ''}
    ${finance ? selectField('category', 'Categoria', financeCategories(data), f.category, 'Todas as categorias', false) + selectField('ownerId', 'Proprietário', financeOwnerOptions(data), f.ownerId, 'Todos os proprietários', false) + selectField('source', 'Origem', FINANCE_SOURCES, f.source, 'Todas as origens', false) + selectField('sheet', 'Aba de origem', [...new Set(data.finances.map(row => row.provenance?.sheet).filter(Boolean))], f.sheet, 'Todas as abas', false) : ''}
    ${herd ? selectField('ownerId', 'Proprietário', data.owners, f.ownerId, 'Todos os proprietários', false) + selectField('pastureId', 'Pasto', data.pastures.filter(p => !p.archived || f.pastureId === p.id || period), f.pastureId, 'Todos os pastos', false) : ''}
    ${category ? selectField('category', 'Categoria', CATEGORIES, f.category, 'Todas as categorias', false) : ''}
    ${period ? inputField('from', 'De', f.from || '', 'date', `max="${today()}"`) + inputField('to', 'Até', f.to || '', 'date', `max="${today()}"`) : ''}
    <div class="filter-actions"><button class="primary-button" type="submit">Filtrar</button><button class="text-button" type="button" data-action="clear-filters">Limpar</button></div></form></details>`;
}

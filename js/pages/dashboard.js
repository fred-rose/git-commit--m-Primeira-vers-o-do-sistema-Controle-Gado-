import { summarize } from '../domain.js';
import { filterMovements } from '../queries.js';
import { escapeHtml as h, number, money, formatDate } from '../utils.js';
import { movementTable, button } from '../components/ui.js';
import { icon } from '../components/icons.js';

function distribution(items, total) {
  return `<div class="pasture-list">${items.map(item => `<div class="pasture-item"><div class="pasture-info"><div class="pasture-name">${h(item.name)}</div><div class="progress"><div class="progress-bar" style="width:${total ? item.quantity / total * 100 : 0}%"></div></div></div><strong>${number(item.quantity)}</strong></div>`).join('')}</div>`;
}
export function render(data) {
  const summary = summarize(data);
  const openingTotal = data.openingStock.reduce((sum, lot) => sum + lot.quantity, 0);
  return `${data.demo ? `<div class="notice"><div><strong>Rebanho demonstrativo</strong><p>O estoque inicial soma ${number(openingTotal)} cabeças e tem distribuição ilustrativa. ${data.finances.some(f => f.source === 'migration') ? 'O financeiro contém lançamentos reais da planilha original.' : 'Confira o inventário antes de iniciar o controle real.'}</p></div>${button('Iniciar inventário real', 'start-empty')}</div>` : ''}
    <section class="summary"><div class="main-total-card"><div class="total-header"><div><span>Total do rebanho</span><strong id="totalRebanho">${number(summary.total)}</strong><p>cabeças atualmente</p></div><div class="cow-icon">${icon('herd')}</div></div><div class="total-footer"><span>Controle por quantidade</span><span>Desde ${formatDate(data.openingDate)}</span></div></div>
    ${summary.categories.map(c => `<div class="animal-card"><div class="animal-icon">${icon('herd')}</div><div><span>${c.name}</span><strong>${number(c.quantity)}</strong></div></div>`).join('')}</section>
    <section class="dashboard-grid"><div class="panel"><div class="panel-header"><div><h3>Distribuição por pasto</h3><p>Localização atual do rebanho</p></div><a class="text-button" href="#pastos">Ver pastos</a></div>${distribution(summary.pastures, summary.total)}</div>
    <div class="panel financial-panel"><div class="panel-header"><div><h3>Financeiro</h3><p>Todo o período registrado</p></div>${icon('finance')}</div><div class="financial-item"><span>Entradas</span><strong class="green">${money(summary.financial.income)}</strong></div><div class="financial-item"><span>Despesas</span><strong class="red">${money(summary.financial.expense)}</strong></div><div class="financial-separator"></div><div class="financial-item balance"><span>Saldo</span><strong class="${summary.financial.balance < 0 ? 'red' : ''}">${money(summary.financial.balance)}</strong></div><a href="#financeiro" class="text-button">Ver financeiro →</a></div></section>
    <section class="panel owners-panel"><div class="panel-header"><div><h3>Rebanho por proprietário</h3><p>Todos os pastos</p></div></div><div class="owner-grid">${summary.owners.map(o => `<a class="owner-item" href="#rebanho?ownerId=${encodeURIComponent(o.id)}"><span class="user-avatar">${h(o.name.slice(0, 2).toUpperCase())}</span><div><span>${h(o.name)}</span><strong>${number(o.quantity)} <small>cabeças</small></strong></div></a>`).join('')}</div></section>
    <section class="panel movements-panel"><div class="panel-header"><div><h3>Últimas movimentações</h3><p>Os 5 registros mais recentes</p></div><a class="text-button" href="#movimentacoes">Ver todas</a></div>${movementTable(data, filterMovements(data).slice(0, 5), false)}</section>
    <section class="backup-bar no-print"><div><strong>Seus dados, neste navegador</strong><p>Exporte uma cópia regularmente. Computador e celular não sincronizam nesta V1.</p></div><div class="row-actions">${button('Exportar cópia', 'export-backup')}${button('Restaurar cópia', 'import-backup')}</div></section>`;
}

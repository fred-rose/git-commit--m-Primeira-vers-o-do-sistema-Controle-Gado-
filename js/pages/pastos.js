import { summarize } from '../domain.js';
import { CATEGORIES } from '../constants.js';
import { escapeHtml as h, number, nameOf } from '../utils.js';
import { pageHeading, button, emptyState } from '../components/ui.js';
import { icon } from '../components/icons.js';
export function render(data) {
  const summary = summarize(data);
  return `${pageHeading('Pastos da fazenda', 'Veja onde estão os animais e acompanhe a ocupação.', `<div class="row-actions">${button('Exportar Excel', 'export-excel', 'pastures')}${button('Cadastrar pasto', 'new-pasture', '', 'primary-button')}</div>`)}
    <div class="pasture-grid">${summary.pastures.map(p => {
      const stock = summary.stock.filter(l => l.pastureId === p.id);
      const owners = [...new Set(stock.map(l => nameOf(data.owners, l.ownerId)))];
      return `<article class="panel pasture-card"><div class="panel-header"><div class="pasture-title">${icon('pastures')}<h3>${h(p.name)}</h3></div><span class="badge birth">${number(summary.total ? Math.round(p.quantity / summary.total * 100) : 0)}% do rebanho</span></div><strong class="pasture-total">${number(p.quantity)} <small>cabeças</small></strong><dl class="category-list">${CATEGORIES.map(c => `<div><dt>${c}</dt><dd>${number(stock.filter(l => l.category === c).reduce((sum, l) => sum + l.quantity, 0))}</dd></div>`).join('')}</dl><p class="pasture-owners"><span>Proprietários</span>${h(owners.join(', ') || 'Nenhum animal neste pasto')}</p><div class="card-footer"><a class="text-button" href="#movimentacoes?pastureId=${encodeURIComponent(p.id)}">Ver histórico</a><div class="row-actions">${button('Editar', 'edit-pasture', p.id, 'text-button')}${button('Excluir', 'delete-pasture', p.id, 'text-button red')}</div></div></article>`;
    }).join('') || emptyState('Nenhum pasto cadastrado.', 'Cadastre um pasto para começar a registrar animais.')}</div>`;
}

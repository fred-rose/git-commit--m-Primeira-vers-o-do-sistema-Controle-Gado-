import { CATEGORIES } from '../constants.js';
import { filterStock } from '../queries.js';
import { escapeHtml as h, number, nameOf, formatDate } from '../utils.js';
import { pageHeading, filtersForm, table, button } from '../components/ui.js';
export function render(data, filters) {
  const lots = filterStock(data, filters);
  const total = lots.reduce((sum, l) => sum + l.quantity, 0);
  return `${pageHeading('O rebanho, de perto', 'Consulte quantidades por categoria, proprietário e pasto.', button('Exportar Excel', 'export-excel', 'herd'))}${filtersForm(data, filters, { category: true })}
    <div class="category-strip"><div><span>Total filtrado</span><strong>${number(total)}</strong></div>${CATEGORIES.map(c => `<div><span>${c}</span><strong>${number(lots.filter(l => l.category === c).reduce((sum, l) => sum + l.quantity, 0))}</strong></div>`).join('')}</div>
    <section class="panel">${table(['Categoria', 'Quantidade', 'Proprietário', 'Pasto', 'Histórico'], lots.map(l => [h(l.category), `<strong>${number(l.quantity)}</strong>`, h(nameOf(data.owners, l.ownerId)), h(nameOf(data.pastures, l.pastureId)), `<a class="text-button" href="#movimentacoes?${h(new URLSearchParams({ category: l.category, ownerId: l.ownerId, pastureId: l.pastureId }).toString())}">Ver histórico</a>`]))}</section>
    <p class="page-footnote">O estoque inicial de ${formatDate(data.openingDate)} e as movimentações compõem o saldo atual. Registre entradas para incluir animais; não há controle por brinco nesta versão.</p>`;
}

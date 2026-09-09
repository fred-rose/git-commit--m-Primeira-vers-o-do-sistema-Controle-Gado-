import { filterMovements } from '../queries.js';
import { pageHeading, filtersForm, movementTable, button } from '../components/ui.js';
import { number } from '../utils.js';
export function render(data, filters) {
  const rows = filterMovements(data, filters);
  return `${pageHeading('Histórico do rebanho', 'Cada registro atualiza as quantidades e, quando aplicável, o financeiro.', button('Exportar Excel', 'export-excel', 'movements'))}${filtersForm(data, filters, { period: true, type: true, category: true })}<section class="panel"><div class="panel-header"><h3>${number(rows.length)} movimentações</h3></div>${movementTable(data, rows)}</section><p class="page-footnote">O histórico segue a data informada. No mesmo dia, vale a ordem de cadastro. Alterações são bloqueadas se deixarem saldo negativo em qualquer ponto do histórico.</p>`;
}

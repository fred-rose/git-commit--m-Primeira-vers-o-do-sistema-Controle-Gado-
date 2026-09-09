import { financialTotals } from '../domain.js';
import { filterFinances } from '../queries.js';
import { pageHeading, filtersForm, financeCards, financeTable, button } from '../components/ui.js';
import { planFinancialSeed } from '../finance.js';
import { number } from '../utils.js';
export function render(data, filters) {
  const rows = filterFinances(data, filters);
  const plan = planFinancialSeed(data);
  const migration = plan.applied ? `<div class="migration-note"><strong>Base financeira da planilha original</strong><p>Abas de caixa de 2026: Varia e Apênd. Os registros antigos de 2021–2022 aguardam conferência dos valores e não compõem o saldo.</p></div>` : `<div class="notice"><div><strong>Histórico financeiro disponível</strong><p>${number(plan.records.length)} lançamentos das abas de caixa de 2026 podem ser adicionados aos seus dados atuais. ${plan.skipped ? `${number(plan.skipped)} registros já identificados serão ignorados.` : ''}</p></div>${button('Importar base financeira', 'import-financial-seed')}</div>`;
  return `${pageHeading('Contas da fazenda', 'Compras e vendas são integradas ao rebanho. Registre as demais contas aqui.', `<div class="row-actions">${button('Exportar Excel', 'export-excel', 'finance')}${button('Novo lançamento', 'new-finance', '', 'primary-button')}</div>`)}${migration}${filtersForm(data, filters, { period: true, type: true, herd: false, finance: true })}${financeCards(financialTotals(rows))}<section class="panel"><div class="panel-header"><h3>Histórico financeiro · ${number(rows.length)} registros</h3><p>Valores dos filtros selecionados</p></div>${financeTable(data, rows)}</section><p class="page-footnote">Para corrigir um lançamento automático, edite a movimentação de origem. O valor de compras e vendas é o total da operação. “Saldo inicial” preserva a entrada “Saldo anterior” da planilha.</p>`;
}

import { getRepository } from './storage.js';
import { STORAGE_KEY } from './constants.js';
import { routes, currentRoute, navigate } from './router.js';
import { renderSidebar } from './components/sidebar.js';
import { movementForm, pastureForm, financeForm, photoForm, viewPhoto, viewFinance } from './components/forms.js';
import { confirmAction, openModal } from './components/modal.js';
import { toast } from './components/toast.js';
import { icon } from './components/icons.js';
import { dateField } from './components/ui.js';
import { download, today, csv, escapeHtml as h, money } from './utils.js';
import { financialTotals } from './domain.js';
import { exportBackup, importBackup, clearLocalData } from './components/dataManagement.js';
import { initializeAssistant } from './components/assistant.js';
import { buildContext } from './ai/contextBuilder.js';
import * as configuracoes from './pages/configuracoes.js';
import * as dashboard from './pages/dashboard.js';
import * as rebanho from './pages/rebanho.js';
import * as movimentacoes from './pages/movimentacoes.js';
import * as pastos from './pages/pastos.js';
import * as financeiro from './pages/financeiro.js';
import * as fotos from './pages/fotos.js';
import * as relatorios from './pages/relatorios.js';

const pages = { dashboard, rebanho, movimentacoes, pastos, financeiro, fotos, relatorios, configuracoes };
const content = document.getElementById('page-content');
let repository;
let assistant;
let sidebarReturnFocus;
const mobileFilters = window.matchMedia('(max-width: 560px)');
mobileFilters.addEventListener('change', event => {
  const disclosure = content.querySelector('.filter-disclosure');
  if (disclosure) disclosure.open = !event.matches;
});

function closeMenu() {
  document.body.classList.remove('menu-open');
  document.getElementById('menu-toggle').setAttribute('aria-expanded', 'false');
  if (sidebarReturnFocus?.isConnected) sidebarReturnFocus.focus();
  sidebarReturnFocus = null;
}
function render() {
  const { page, filters } = currentRoute();
  const data = repository.getData();
  document.title = `${routes[page].title} · Controle Gado`;
  document.getElementById('page-title').textContent = routes[page].title;
  document.getElementById('data-mode').textContent = data.demo ? 'Rebanho demonstrativo · local' : 'Dados salvos neste navegador';
  renderSidebar(page);
  content.innerHTML = pages[page].render(data, filters);
  pages[page].setup?.(data);
  const form = content.querySelector('#filters-form');
  if (form) {
    form.closest('.filter-disclosure').open = !mobileFilters.matches;
    form.onsubmit = event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      if (values.from && values.to && values.from > values.to) return toast('A data inicial deve ser anterior ou igual à data final.', true);
      navigate(page, values);
    };
    if (form.elements.report) form.elements.report.onchange = () => navigate(page, { report: form.elements.report.value });
  }
}

const actions = {
  'new-movement': () => movementForm(repository),
  'edit-movement': id => movementForm(repository, id),
  'delete-movement': id => confirmAction('Excluir movimentação?', 'A quantidade e o financeiro serão recalculados. Se outra movimentação depender deste saldo, a exclusão será bloqueada.', () => repository.deleteMovement(id)),
  'new-pasture': () => pastureForm(repository),
  'edit-pasture': id => pastureForm(repository, id),
  'delete-pasture': id => confirmAction('Excluir pasto?', 'Só é possível excluir um pasto vazio. Seu nome será mantido nos registros históricos.', () => repository.deletePasture(id)),
  'new-finance': () => financeForm(repository),
  'edit-finance': id => financeForm(repository, id),
  'view-finance': id => viewFinance(repository, id),
  'import-financial-seed': () => {
    const plan = repository.financialSeedPlan();
    const totals = financialTotals(plan.records);
    openModal({ title: 'Importar histórico financeiro', content: `<p class="confirmation-text">Serão adicionados ${plan.records.length} lançamentos de ${h(plan.manifest.workbook)} (abas Varia e Apênd). Entradas: ${money(totals.income)}. Despesas: ${money(totals.expense)}. ${plan.skipped} registros já identificados serão ignorados. Seus registros atuais serão preservados. Uma cópia de segurança será preparada antes da importação.</p>`, submitLabel: 'Importar lançamentos', submit: () => {
      exportBackup(repository);
      repository.importFinancialSeed();
    } });
  },
  'delete-finance': id => confirmAction('Excluir lançamento?', 'Este lançamento manual será removido e o saldo financeiro será atualizado.', () => repository.deleteFinance(id)),
  'new-photo': () => photoForm(repository),
  'edit-photo': id => photoForm(repository, id),
  'view-photo': id => viewPhoto(repository, id),
  'delete-photo': id => confirmAction('Excluir foto?', 'A foto e sua descrição serão removidas deste navegador.', () => repository.deletePhoto(id)),
  'clear-filters': () => { const { page, filters } = currentRoute(); navigate(page, filters.report ? { report: filters.report } : {}); render(); },
  'export-backup': () => { exportBackup(repository); toast('Backup preparado para download.'); },
  'import-backup': () => document.getElementById('backup-file').click(),
  'clear-local-data': () => clearLocalData(repository, () => assistant?.clearConversation()),
  'start-empty': () => openModal({ title: 'Iniciar inventário real', content: `<p class="confirmation-text">O estoque demonstrativo e suas movimentações serão removidos, incluindo o financeiro automático associado a elas. Os lançamentos independentes (manuais e da planilha) e as fotos serão preservados. Uma cópia será preparada antes da mudança. Depois, registre o inventário conferido usando movimentações do tipo Entrada.</p>${dateField(today())}`, submitLabel: 'Iniciar inventário', danger: true, submit: values => {
    exportBackup(repository);
    repository.startEmpty(values.get('date'));
  } }),
  'export-csv': () => {
    const report = relatorios.reportData(repository.getData(), currentRoute().filters);
    download(`controle-gado-${report.kind}-${today()}.csv`, csv([[report.title], [report.context], [], ...report.csvRows]), 'text/csv;charset=utf-8');
  },
  'export-excel': async kind => {
    const { exportExcel } = await import('./excel.js');
    exportExcel(repository.getData(), kind, currentRoute().filters);
    toast('Arquivo Excel preparado para download.');
  },
  print: () => window.print(),
};

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  try { target.disabled = true; await actions[target.dataset.action]?.(target.dataset.id); }
  catch (error) { toast(error.message, true); }
  finally { target.disabled = false; }
});
document.getElementById('backup-file').onchange = async event => {
  try { await importBackup(event.target.files[0], repository, () => assistant?.clearConversation()); }
  catch (error) { toast(error.message, true); }
  finally { event.target.value = ''; }
};
document.getElementById('menu-toggle').onclick = () => {
  if (document.body.classList.contains('menu-open')) return closeMenu();
  sidebarReturnFocus = document.activeElement;
  document.body.classList.add('menu-open');
  document.getElementById('menu-toggle').setAttribute('aria-expanded', 'true');
  document.querySelector('.menu-item.active')?.focus();
};
document.getElementById('menu-backdrop').onclick = closeMenu;
document.getElementById('menu-close').onclick = closeMenu;
document.querySelector('.menu').addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', event => {
  if (!document.body.classList.contains('menu-open')) return;
  if (event.key === 'Escape') closeMenu();
  if (event.key === 'Tab') {
    const items = [...document.querySelectorAll('.sidebar button, .sidebar a')].filter(el => el.getClientRects().length);
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
window.addEventListener('hashchange', () => { closeMenu(); if (repository) { render(); document.getElementById('page-title').focus(); } });
window.addEventListener('storage', event => {
  // Uma edição aberta pode estar baseada no estado anterior; não recarregar silenciosamente.
  if (repository && (event.key === null || event.key === STORAGE_KEY)) document.getElementById('stale-notice').hidden = false;
});
document.getElementById('reload-data').onclick = () => location.reload();
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });

try {
  repository = getRepository();
  repository.getData();
  repository.subscribe(render);
  render();
  assistant = initializeAssistant(question => buildContext(repository.getData(), question));
} catch (error) {
  repository = null;
  document.getElementById('novaMovimentacaoBtn').disabled = true;
  content.innerHTML = `<section class="panel startup-error"><h3>Precisamos conferir os dados locais</h3><p>${h(error.message)}</p><button class="secondary-button" id="export-recovery">Baixar dados para recuperação</button></section>`;
  document.getElementById('export-recovery').onclick = () => {
    try { download(`controle-gado-recuperacao-${today()}.json`, JSON.stringify({ _meta: { system: 'controle-gado', kind: 'recovery', exportedAt: new Date().toISOString() }, recovery: { originalContent: getRepository().exportRaw() } }, null, 2)); }
    catch (e) { toast(e.message, true); }
  };
}

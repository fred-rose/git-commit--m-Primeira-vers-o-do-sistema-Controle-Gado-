import { getRepository } from './storage.js';
import { STORAGE_KEY } from './constants.js';
import { routes, currentRoute, navigate } from './router.js';
import { renderSidebar } from './components/sidebar.js';
import { movementForm, pastureForm, financeForm, photoForm, viewPhoto, viewFinance } from './components/forms.js';
import { confirmAction, openModal } from './components/modal.js';
import { toast } from './components/toast.js';
import { icon } from './components/icons.js';
import { dateField } from './components/ui.js';
import { download, today, csv, escapeHtml as h, money, toCents } from './utils.js';
import { financialTotals } from './domain.js';
import { exportBackup, importBackup, clearLocalData } from './components/dataManagement.js';
import { initializeAssistant } from './components/assistant.js';
import { buildContext } from './ai/contextBuilder.js';
import { capacityConfigurations,capacityPeriodLabel } from './capacity/capacityService.js';
import * as configuracoes from './pages/configuracoes.js';
import * as dashboard from './pages/dashboard.js';
import * as rebanho from './pages/rebanho.js';
import * as movimentacoes from './pages/movimentacoes.js';
import * as pastos from './pages/pastos.js';
import * as financeiro from './pages/financeiro.js';
import * as fotos from './pages/fotos.js';
import * as relatorios from './pages/relatorios.js';
import * as evolucao from './pages/evolucao.js';
import * as alertas from './pages/alertas.js';
import * as administracao from './pages/administracao.js';
import * as cloudSettings from './pages/cloudSettings.js';
import { authenticatedRepository, logout } from './auth/auth.js';
import { cloudConfigured } from './supabase/client.js';
import { renderCloudShell } from './components/cloudShell.js';
import { farmForm, quickForm, capacityForm, settingsForm } from './components/cloudForms.js';
import { inputField } from './components/ui.js';
import { bindActionButtons, runButtonAction } from './components/actionButton.js';
import { syncOutcome, showSyncingButtons } from './components/syncFeedback.js';

const pages = { dashboard, rebanho, movimentacoes, pastos, financeiro, fotos, relatorios, configuracoes, evolucao, alertas, administracao };
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
  if ((routes[page].adminOnly && repository.profile?.systemRole !== 'super_admin') || (routes[page].cloudOnly && !data.cloud) || (data.cloud && page === 'pastos' && data.farm?.controlMode !== 'pasture')) { navigate('dashboard'); return; }
  document.title = `${routes[page].title} · Controle Gado`;
  document.getElementById('page-title').textContent = routes[page].title;
  document.getElementById('data-mode').textContent = data.demo ? 'Rebanho demonstrativo · local' : 'Dados salvos neste navegador';
  renderSidebar(page, data, repository.profile);
  const module = data.cloud && page === 'configuracoes' ? cloudSettings : pages[page];
  content.innerHTML = module.render(data, filters);
  module.setup?.(data);
  if (data.cloud) renderCloudShell(repository, data, page, assistant);
  bindActionButtons(document,feedbackKey);
  if(data.cloud)showSyncingButtons(content,data);
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
  'new-farm': () => farmForm(repository),
  'quick-plus': id => quickForm(repository,id,1),
  'quick-minus': id => quickForm(repository,id,-1),
  'capacity-form': () => capacityForm(repository),
  'edit-capacity': id => capacityForm(repository,id),
  'delete-capacity': id => {const data=repository.getData(),capacity=capacityConfigurations(data.capacityRules).find(r=>r.id===id);if(!capacity)throw new Error('Capacidade não encontrada.');const start=`${String(capacity.month).padStart(2,'0')}/${capacity.year}`,location=capacity.pastureId?data.pastures.find(p=>p.id===capacity.pastureId)?.name||'Pasto':'Fazenda inteira';confirmAction('Excluir capacidade?',`Excluir capacidade de ${start}, período de ${capacityPeriodLabel(capacity.months)}, ${location}?`,()=>repository.deleteCapacity(id));},
  'farm-settings': () => settingsForm(repository),
  'new-owner': () => openModal({ title: 'Cadastrar proprietário', content: inputField('name','Nome','','text','required maxlength="100"'), submit: v => repository.saveOwner(v.get('name')) }),
  'change-mode': () => { const f=repository.getData().farm; if(!f)throw new Error('Selecione uma fazenda.'); const mode=f.controlMode==='farm'?'pasture':'farm'; confirmAction('Mudar modo de controle?', mode==='farm'?'Os animais distribuídos serão consolidados no estoque geral da fazenda. Os pastos e o histórico serão preservados.':'Os animais permanecerão no estoque geral até você criar pastos e distribuir usando Transferência de pasto.',()=>repository.changeMode(mode,true),'Confirmar mudança'); },
  'open-alerts': () => navigate('alertas'),
  'sync-now': () => repository.manager.run(),
  'retry-sync': async id => { await repository.outbox.retry(id); await repository.manager.run(); },
  'retry-command': farmId => repository.retryCommand(farmId),
  'review-sync': async id => { const row=(await repository.outbox.list()).find(r=>r.id===id&&r.status==='failed');if(!row)throw new Error('Pendência não encontrada.');openModal({title:'Revisar movimentação',content:`<p>${h(row.payload.type)} · ${h(row.payload.category)}. O servidor verificará se o registro anterior já foi confirmado antes de criar uma revisão.</p>${inputField('quantity','Quantidade conferida',row.payload.quantity,'number','required min="1" max="2147483647" step="1"')}${inputField('note','Descrição',row.payload.note,'text','maxlength="2000"')}`,submit:v=>repository.revisePending(id,v.get('quantity'),v.get('note'))}); },
  'select-farm': async id => { assistant?.clearConversation(); await repository.selectFarm(id); navigate('dashboard'); },
  'complete-value': async value => {
    const {farmId,id}=JSON.parse(value);await repository.selectFarm(farmId);assistant?.clearConversation();
    const movement=repository.getData().movements.find(m=>m.id===id);
    if(!movement||movement.pending)throw new Error('Sincronize a movimentação antes de informar o valor.');
    return openModal({title:'Informar valor',content:`<p>${h(movement.type)} · ${movement.quantity} ${h(movement.category.toLowerCase())}</p>${inputField('value','Valor total','','text','required inputmode="decimal"')}`,submit:values=>{
      const valueCents=toCents(values.get('value'));if(!Number.isSafeInteger(valueCents)||valueCents<=0)throw new Error('Informe um valor maior que zero.');
      if(repository.selected!==farmId)throw new Error('A fazenda mudou. Abra o registro novamente.');
      return repository.completeMovementValue(id,valueCents);
    }});
  },
  'ignore-alert': async value => { const {farmId,id}=JSON.parse(value); await repository.selectFarm(farmId); return repository.alertStatus(id,'ignored'); },
  'load-admin': () => repository.loadAdmin(),
  'admin-view': async id => { assistant?.clearConversation(); await repository.selectFarm(id,{admin:!repository.farms.some(f=>f.id===id)}); navigate('dashboard'); },
  'back-admin': async () => { assistant?.clearConversation(); await repository.selectFarm('ALL_FARMS'); navigate('administracao'); },
  logout: () => logout(repository),
  'dismiss-migration': () => { sessionStorage.setItem(`migration-dismiss:${repository.userId}`,'true');render(); },
  'export-legacy': () => { const raw=localStorage.getItem(STORAGE_KEY);if(!raw)throw new Error('Nenhum dado local encontrado.');download(`controle-gado-local-${today()}.json`,raw); },
  'migrate-local': async () => { const {migrationDialog}=await import('./migration/localMigration.js');return migrationDialog(repository); },
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
    openModal({ feedback:{loading:'Importando lançamentos…',success:'Lançamentos importados'}, title: 'Importar histórico financeiro', content: `<p class="confirmation-text">Serão adicionados ${plan.records.length} lançamentos de ${h(plan.manifest.workbook)} (abas Varia e Apênd). Entradas: ${money(totals.income)}. Despesas: ${money(totals.expense)}. ${plan.skipped} registros já identificados serão ignorados. Seus registros atuais serão preservados. Uma cópia de segurança será preparada antes da importação.</p>`, submitLabel: 'Importar lançamentos', submit: () => {
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
  'export-backup': async () => { if(repository.cloud)download(`controle-gado-backup-${today()}.json`,await repository.exportBackup());else exportBackup(repository); toast('Backup preparado para download.'); },
  'import-backup': () => document.getElementById('backup-file').click(),
  'clear-local-data': () => clearLocalData(repository, () => assistant?.clearConversation()),
  'start-empty': () => openModal({ feedback:{loading:'Preparando inventário…',success:'Inventário iniciado'}, title: 'Iniciar inventário real', content: `<p class="confirmation-text">O estoque demonstrativo e suas movimentações serão removidos, incluindo o financeiro automático associado a elas. Os lançamentos independentes (manuais e da planilha) e as fotos serão preservados. Uma cópia será preparada antes da mudança. Depois, registre o inventário conferido usando movimentações do tipo Entrada.</p>${dateField(today())}`, submitLabel: 'Iniciar inventário', danger: true, submit: values => {
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

const actionFeedback={
  'export-backup':{loading:'Preparando backup…',success:'Backup preparado'},
  'export-legacy':{loading:'Preparando cópia…',success:'Cópia preparada'},
  'export-excel':{loading:'Gerando planilha…',success:'Planilha pronta'},
  'export-csv':{loading:'Gerando arquivo…',success:'Arquivo pronto'},
  'sync-now':{state:'syncing',loading:'Sincronizando…',success:'Sincronizado'},
  'retry-sync':{state:'syncing',loading:'Tentando sincronizar…',success:'Sincronizado'},
  'retry-command':{loading:'Confirmando registro…',success:'Registro confirmado'},
  'ignore-alert':{loading:'Atualizando aviso…',success:'Aviso ignorado'},
  'load-admin':{loading:'Carregando…',success:'Dados atualizados'},
};
const actionLocks=new Set();
function feedbackKey(button){return `${repository?.userId||'local'}:${repository?.selected||'local'}:${button.dataset.action}:${button.dataset.id||''}`;}

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target||target.disabled) return;
  const key=feedbackKey(target),name=target.dataset.action;
  if(actionLocks.has(key))return;actionLocks.add(key);
  const feedback=actionFeedback[name];
  try {
    if(feedback)await runButtonAction(target,()=>actions[name]?.(target.dataset.id),{...feedback,key,...(['sync-now','retry-sync'].includes(name)?{outcome:()=>syncOutcome(repository,name==='retry-sync'?target.dataset.id:undefined)}:{})});
    else{target.disabled=true;await actions[name]?.(target.dataset.id);}
  }
  catch (error) { toast(error.message, true); }
  finally { actionLocks.delete(key);if(!feedback)target.disabled = false; }
});
document.getElementById('backup-file').onchange = async event => {
  const file=event.target.files[0];if(!file)return;
  const button=document.querySelector('[data-action="import-backup"]');
  try { await runButtonAction(button,async()=>{if(repository.cloud){const {cloudImportDialog}=await import('./migration/cloudBackup.js');await cloudImportDialog(repository,file);}else await importBackup(file, repository, () => assistant?.clearConversation());},{key:feedbackKey(button),loading:'Validando arquivo…',success:'Arquivo validado'}); }
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
  repository = await authenticatedRepository() || getRepository();
  repository.getData();
  repository.subscribe(render);
  render();
  assistant = initializeAssistant(question => buildContext(repository.getData(), question));
  if(repository.cloud)repository.manager.run().catch(error=>toast(error.message,true));
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
} catch (error) {
  repository = null;
  document.body.classList.remove('auth-pending');
  if(cloudConfigured()){
    document.getElementById('auth-screen')?.remove();
    document.getElementById('novaMovimentacaoBtn').disabled=true;
    content.innerHTML=`<section class="panel startup-error"><h3>Não foi possível abrir sua conta</h3><p>${h(error.message)}</p><button class="secondary-button" id="retry-start">Tentar novamente</button></section>`;
    document.getElementById('retry-start').onclick=()=>location.reload();
  } else {
  document.getElementById('novaMovimentacaoBtn').disabled = true;
  content.innerHTML = `<section class="panel startup-error"><h3>Precisamos conferir os dados locais</h3><p>${h(error.message)}</p><button class="secondary-button" id="export-recovery">Baixar dados para recuperação</button></section>`;
  document.getElementById('export-recovery').onclick = () => {
    try { download(`controle-gado-recuperacao-${today()}.json`, JSON.stringify({ _meta: { system: 'controle-gado', kind: 'recovery', exportedAt: new Date().toISOString() }, recovery: { originalContent: getRepository().exportRaw() } }, null, 2)); }
    catch (e) { toast(e.message, true); }
  };
  }
}

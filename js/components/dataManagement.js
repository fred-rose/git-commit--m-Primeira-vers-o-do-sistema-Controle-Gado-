import { openModal } from './modal.js';
import { backupFilename } from '../storage/backup.js';
import { MAX_BACKUP_BYTES } from '../storage/schema.js';
import { download, number, formatDate } from '../utils.js';
import { nextPaint } from './actionButton.js';

export function exportBackup(repository) {
  download(backupFilename(), repository.exportBackup());
}
function paragraph(text, className = '') {
  const node = document.createElement('p'); node.textContent = text; node.className = className; return node;
}
export async function importBackup(file, repository, onRestored = () => {}) {
  if (!file) return;
  let content, inspected;
  try {
    if (file.size > MAX_BACKUP_BYTES) throw new Error('Selecione um backup JSON de até 20 MB.');
    content = await file.text();
    inspected = repository.inspectBackup(content);
  } catch (error) { throw new Error(`Não foi possível importar: ${error.message}`); }
  const { metadata, summary, legacy } = inspected;
  const container = document.createElement('div');
  container.append(paragraph(legacy ? 'Backup legado da V1/V1.1; data de exportação não informada.' : `Backup de ${formatDate(metadata.exportedAt.slice(0, 10))} · versão ${metadata.appVersion}`, 'backup-date'));
  const list = document.createElement('dl'); list.className = 'data-counts backup-counts';
  for (const [label, value] of [['Animais', summary.totalCattle], ['Movimentações', summary.movements], ['Registros financeiros', summary.financialRecords], ['Pastos ativos', summary.pastures], ['Fotos', summary.photos]]) {
    const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label; dd.textContent = number(value); row.append(dt, dd); list.append(row);
  }
  container.append(list, paragraph('A restauração substituirá os registros atuais. Antes da mudança, uma cópia de segurança da base atual será preparada para download.', 'confirmation-text'));
  openModal({ title: 'Conferir restauração', content: container, submitLabel: 'Restaurar backup', danger: true, successMessage: 'Backup restaurado com sucesso.', feedback:{loading:'Preparando cópia…',success:'Restaurado'}, submit: async (_,form,action) => {
    exportBackup(repository);
    action.step('Restaurando…');await nextPaint();
    repository.importData(content);
    onRestored();
  } });
}
export function clearLocalData(repository, onCleared = () => {}) {
  const content = document.createElement('div');
  content.append(paragraph('Esta ação esvazia os registros da fazenda neste navegador. Depois, você poderá importar um backup ou iniciar novos cadastros. A base permanecerá vazia ao reabrir o sistema.', 'confirmation-text'));
  const label = document.createElement('label'); label.className = 'form-group';
  const text = document.createElement('span'); text.textContent = 'Digite LIMPAR para confirmar';
  const input = document.createElement('input'); input.name = 'confirmation'; input.required = true; input.maxLength = 6; input.autocomplete = 'off'; input.spellcheck = false;
  label.append(text, input); content.append(label);
  openModal({ feedback:{loading:'Limpando dados…',success:'Dados removidos'}, title: 'Limpar dados locais?', content, danger: true, submitLabel: 'Limpar dados locais', successMessage: 'Registros locais removidos.', setup(form) {
    const button = form.querySelector('[type="submit"]'); button.disabled = true;
    input.addEventListener('input', () => { button.disabled = input.value !== 'LIMPAR'; });
  }, submit: values => { repository.clearData(values.get('confirmation')); onCleared(); } });
}

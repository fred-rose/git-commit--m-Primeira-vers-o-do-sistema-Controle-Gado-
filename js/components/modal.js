import { escapeHtml as h } from '../utils.js';
import { icon } from './icons.js';
import { toast } from './toast.js';

export function openModal({ title, subtitle = '', content, submit, submitLabel = 'Salvar', danger = false, setup, successMessage = 'Salvo com sucesso.' }) {
  const dialog = document.getElementById('dialog');
  if (dialog.open) dialog.close();
  const previousFocus = document.activeElement;
  dialog.innerHTML = `<div class="modal-header"><div><h3 id="dialog-title">${h(title)}</h3>${subtitle ? `<p>${h(subtitle)}</p>` : ''}</div><button type="button" class="close-modal" aria-label="Fechar">${icon('close')}</button></div>
    <form id="dialog-form">${typeof content === 'string' ? content : ''}<p class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="secondary-button cancel">Cancelar</button><button type="submit" class="primary-button ${danger ? 'danger-button' : ''}">${h(submitLabel)}</button></div></form>`;
  if (content instanceof Node) dialog.querySelector('form').prepend(content);
  dialog.querySelector('.close-modal').onclick = () => dialog.close();
  dialog.querySelector('.cancel').onclick = () => dialog.close();
  dialog.onclose = () => { document.body.classList.remove('dialog-open'); if (previousFocus?.isConnected) previousFocus.focus(); };
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = form.querySelector('.form-error');
    const button = form.querySelector('[type="submit"]');
    error.hidden = true;
    button.disabled = true;
    try {
      await submit(new FormData(form), form);
      dialog.close();
      if (successMessage) toast(successMessage);
    } catch (e) {
      error.textContent = e.message || 'Não foi possível salvar. Tente novamente.';
      error.hidden = false;
      error.scrollIntoView({ block: 'nearest' });
    } finally { button.disabled = false; }
  };
  setup?.(dialog.querySelector('form'));
  document.body.classList.add('dialog-open');
  dialog.showModal();
}
export function confirmAction(title, message, action, label = 'Excluir') {
  openModal({ title, content: `<p class="confirmation-text">${h(message)}</p>`, submitLabel: label, danger: true, submit: action });
}

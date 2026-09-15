import { escapeHtml as h } from '../utils.js';
import { icon } from './icons.js';
import { toast } from './toast.js';
import { createButtonAction, nextPaint } from './actionButton.js';

export function openModal({ title, subtitle = '', content, submit, submitLabel = 'Salvar', danger = false, setup, successMessage = 'Salvo com sucesso.', feedback = 'auto' }) {
  const dialog = document.getElementById('dialog');
  if(dialog.querySelector('form[aria-busy="true"]'))throw new Error('Aguarde a operação em andamento.');
  if (dialog.open) dialog.close();
  const previousFocus = document.activeElement;
  dialog.innerHTML = `<div class="modal-header"><div><h3 id="dialog-title">${h(title)}</h3>${subtitle ? `<p>${h(subtitle)}</p>` : ''}</div><button type="button" class="close-modal" aria-label="Fechar">${icon('close')}</button></div>
    <form id="dialog-form">${typeof content === 'string' ? content : ''}<p class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="secondary-button cancel">Cancelar</button><button type="submit" class="primary-button ${danger ? 'danger-button' : ''}">${h(submitLabel)}</button></div></form>`;
  if (content instanceof Node) dialog.querySelector('form').prepend(content);
  let submitting=false;
  dialog.querySelector('.close-modal').onclick = () => {if(!submitting)dialog.close();};
  dialog.querySelector('.cancel').onclick = () => {if(!submitting)dialog.close();};
  dialog.oncancel=event=>{if(submitting)event.preventDefault();};
  dialog.onclose = () => { document.body.classList.remove('dialog-open'); if (previousFocus?.isConnected) previousFocus.focus(); };
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = form.querySelector('.form-error');
    const button = form.querySelector('[type="submit"]');
    if(submitting||button.disabled)return;
    submitting=true;
    const values=new FormData(form),action=createButtonAction(button);
    const config=typeof feedback==='object'?feedback:{};
    const controls=[...form.querySelectorAll('input,select,textarea,button'),dialog.querySelector('.close-modal')].filter(el=>el!==button).map(el=>[el,el.disabled]);
    const lock=()=>{form.setAttribute('aria-busy','true');controls.forEach(([el])=>el.disabled=true);};
    error.hidden = true;
    try {
      button.disabled=true;
      if(feedback!=='auto'&&feedback!==false){action.loading(config.loading||'Salvando…');lock();await nextPaint();}
      const pending=submit(values,form,action),asynchronous=Boolean(pending&&typeof pending.then==='function');
      if(asynchronous){if(feedback!==false&&action.state==='idle')action.loading(config.loading||(danger?'Excluindo…':'Salvando…'));lock();}
      const result=await pending;
      if(result===false){action.reset();return;}
      if(feedback!==false&&(asynchronous||feedback!=='auto'))await action.finish(action.outcome?.state||'success',action.outcome?.label||config.success||(danger?'Excluído':'Salvo'));
      if(dialog.querySelector('form')!==form)return;
      action.reset();dialog.close();
      if (successMessage) toast(successMessage);
    } catch (e) {
      error.textContent = e.message || 'Não foi possível salvar. Tente novamente.';
      error.hidden = false;
      error.scrollIntoView({ block: 'nearest' });
      if(feedback!==false)await action.finish('error',config.error||'Não foi possível');
    } finally { action.reset();controls.forEach(([el,disabled])=>el.disabled=disabled);form.removeAttribute('aria-busy');submitting=false; }
  };
  setup?.(dialog.querySelector('form'));
  document.body.classList.add('dialog-open');
  dialog.showModal();
}
export function confirmAction(title, message, action, label = 'Excluir') {
  openModal({ title, content: `<p class="confirmation-text">${h(message)}</p>`, submitLabel: label, danger: true, submit: action, feedback:{loading:label==='Excluir'?'Excluindo…':'Aplicando…',success:label==='Excluir'?'Excluído':'Concluído'} });
}

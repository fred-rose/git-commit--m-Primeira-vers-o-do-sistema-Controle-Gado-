import { AiAssistant } from '../ai/aiAssistant.js';

export function initializeAssistant(getContext) {
  const assistant = new AiAssistant({ getContext });
  const launcher = document.getElementById('assistant-launcher'), panel = document.getElementById('assistant-panel');
  const log = document.getElementById('assistant-log'), input = document.getElementById('assistant-input');
  const form = document.getElementById('assistant-form'), status = document.getElementById('assistant-status'), send = document.getElementById('assistant-send');
  let generation = 0;
  function renderMessages() {
    const messages = assistant.history();
    const nodes = messages.map(message => {
      const article = document.createElement('article'); article.className = `chat-message chat-${message.role}`;
      const label = document.createElement('strong'); label.textContent = message.role === 'user' ? 'Você' : 'Assistente';
      const body = document.createElement('p'); body.textContent = message.text;
      article.append(label, body); return article;
    });
    log.replaceChildren(...nodes);
    document.getElementById('assistant-welcome').hidden = messages.length > 0;
    const scroller = log.parentElement;
    scroller.scrollTop = scroller.scrollHeight;
  }
  function clearConversation() {
    generation++; assistant.clear(); input.value = ''; status.hidden = true; input.disabled = false; send.disabled = false;
    renderMessages();
  }
  launcher.onclick = () => {
    panel.showModal(); document.body.classList.add('assistant-open'); launcher.setAttribute('aria-expanded', 'true'); input.focus();
  };
  document.getElementById('assistant-close').onclick = () => panel.close();
  panel.addEventListener('close', () => { document.body.classList.remove('assistant-open'); launcher.setAttribute('aria-expanded', 'false'); launcher.focus(); });
  document.getElementById('assistant-clear').onclick = () => { clearConversation(); input.focus(); };
  form.onsubmit = async event => {
    event.preventDefault();
    if (assistant.busy || !input.value.trim()) return;
    const currentGeneration = generation, question = input.value;
    input.value = ''; input.disabled = true; send.disabled = true; status.textContent = 'Consultando os dados…'; status.hidden = false;
    try {
      const pending = assistant.ask(question); renderMessages();
      await pending;
      if (currentGeneration === generation) renderMessages();
    } catch (error) { status.textContent = error.message; }
    finally {
      if (currentGeneration === generation) { input.disabled = false; send.disabled = false; if (status.textContent === 'Consultando os dados…') status.hidden = true; if (panel.open) input.focus(); }
    }
  };
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); } });
  for (const suggestion of panel.querySelectorAll('[data-question]')) suggestion.onclick = () => { input.value = suggestion.dataset.question; form.requestSubmit(); };
  launcher.disabled = false;
  return { clearConversation };
}

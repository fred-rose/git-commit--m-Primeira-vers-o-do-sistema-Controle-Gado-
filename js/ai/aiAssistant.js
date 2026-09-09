import { LocalRuleEngine } from './localRuleEngine.js';
import { RemoteProvider } from './remoteProvider.js';

export const MAX_CHAT_MESSAGES = 20;
export class AiAssistant {
  constructor({ getContext, localProvider = new LocalRuleEngine(), remoteProvider = new RemoteProvider() }) {
    this.getContext = getContext;
    this.localProvider = localProvider;
    this.remoteProvider = remoteProvider;
    this.messages = [];
    this.busy = false;
    this.generation = 0;
  }
  history() { return this.messages.map(message => ({ ...message })); }
  append(role, text, mode = 'local') {
    this.messages.push({ role, text, mode });
    this.messages = this.messages.slice(-MAX_CHAT_MESSAGES);
  }
  clear() { this.messages = []; this.generation++; this.busy = false; }
  async ask(raw) {
    const question = String(raw).trim();
    if (!question || question.length > 500) throw new Error('Digite uma pergunta de até 500 caracteres.');
    if (this.busy) throw new Error('Aguarde a resposta atual antes de enviar outra pergunta.');
    const generation = this.generation;
    this.busy = true;
    this.append('user', question);
    try {
      const context = this.getContext(question);
      const local = this.localProvider.answer(question, context);
      let answer = local;
      if (!local.handled && this.remoteProvider.available) {
        try { answer = await this.remoteProvider.answer(question, context) || local; }
        catch { answer = { ...local, text: 'O serviço remoto está indisponível. ' + local.text }; }
      }
      if (generation === this.generation) this.append('assistant', answer.text, answer.mode);
      return generation === this.generation ? answer : null;
    } catch {
      const answer = { text: 'Não foi possível consultar os dados atuais. Confira o armazenamento do sistema e tente novamente.', mode: 'local' };
      if (generation === this.generation) this.append('assistant', answer.text);
      return answer;
    } finally { if (generation === this.generation) this.busy = false; }
  }
}

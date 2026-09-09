import { CONTEXT_LIMITS } from './contextBuilder.js';

// A integração futura passa por um endpoint da própria aplicação. Nunca recebe chaves.
export class RemoteProvider {
  constructor({ endpoint = '', transport = null } = {}) {
    if (endpoint && (!endpoint.startsWith('/api/') || endpoint.includes('..') || endpoint.includes('?') || endpoint.includes('#'))) throw new Error('Configure um endpoint relativo em /api/, sem credenciais.');
    this.endpoint = endpoint;
    this.transport = transport;
  }
  get available() { return Boolean(this.endpoint && this.transport); }
  async answer(question, context) {
    if (!this.available) return null;
    if (question.length > 500 || new TextEncoder().encode(JSON.stringify(context)).byteLength > CONTEXT_LIMITS.maxBytes) throw new Error('A consulta excede o limite do assistente.');
    const response = await this.transport({ endpoint: this.endpoint, payload: { question, context } });
    if (!response || typeof response.text !== 'string' || response.text.length > 4000) throw new Error('Resposta inválida do assistente remoto.');
    return { text: response.text, mode: 'remote' };
  }
}

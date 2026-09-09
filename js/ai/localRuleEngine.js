import { normalizeQuestion } from './contextBuilder.js';
import { money, number, formatDate } from '../utils.js';

const help = {
  sale: 'Para registrar uma venda, acesse Movimentações → Nova movimentação. Selecione Venda, categoria, quantidade, proprietário, pasto, data e valor total. Ao salvar, o estoque diminui e uma entrada financeira é criada. O sistema bloqueia quantidades acima do saldo disponível.',
  purchase: 'Para registrar uma compra, acesse Movimentações → Nova movimentação e selecione Compra. Informe categoria, quantidade, proprietário, pasto, data e valor total. Ao salvar, os animais entram no rebanho e o valor informado gera uma despesa.',
  death: 'Para registrar uma morte, acesse Movimentações → Nova movimentação e selecione Morte. Informe categoria, quantidade, proprietário, pasto e data. Ao salvar, o estoque é reduzido; não há lançamento financeiro automático.',
  transfer: 'Para transferir animais, acesse Movimentações → Nova movimentação e selecione Transferência de pasto. Informe categoria, quantidade, proprietário, origem, destino e data. O total do rebanho permanece igual; o saldo muda entre os dois pastos.',
  birth: 'Para registrar um nascimento, acesse Movimentações → Nova movimentação e selecione Nascimento. Escolha Bezerras ou Bezerros, quantidade, proprietário, pasto e data. O rebanho será atualizado ao salvar.',
  backup: 'Acesse Configurações → Gerenciamento de Dados. Em Exportar backup, baixe a cópia JSON. Para restaurar, escolha Importar backup, confira o resumo e confirme. A restauração substitui os registros atuais deste navegador.',
};
const result = text => ({ handled: true, text, mode: 'local' });
const readonly = 'Eu não realizo alterações diretamente. ';
const stepsFor = q => /\b(venda|vender|venda?s?|vendas)\b/.test(q) ? help.sale : /\b(compra|comprar|compre)\b/.test(q) ? help.purchase : /\b(morte|morreu|obito)\b/.test(q) ? help.death : /\b(transfer|transfir|mudar de pasto)/.test(q) ? help.transfer : /\b(nascimento|nasceu)\b/.test(q) ? help.birth : /\b(backup|restaur|limpar dados|import)/.test(q) ? help.backup : 'Use a tela correspondente para cadastrar, editar ou excluir um registro e confira a confirmação antes de salvar.';

export class LocalRuleEngine {
  answer(question, context) {
    const q = normalizeQuestion(question);
    if (!q) return result('Digite uma pergunta sobre o rebanho, o financeiro ou como usar o sistema.');
    const how = /\b(como|onde|passos?|ajuda|posso)\b/.test(q);
    const command = /^(?:por favor )?(?:venda|vender|venderia|compre|comprar|registre|registrar|cadastre|cadastrar|crie|criar|adicione|adicionar|exclua|excluir|apague|apagar|delete|deletar|limpe|limpar|restaure|restaurar|importe|importar|altere|alterar|edite|editar|transfira|transferir|mova|salve|salvar)\b/.test(q) || /\b(quero|preciso|pode|favor)\b.*\b(vender|comprar|registrar|criar|excluir|apagar|limpar|restaurar|alterar|transferir)\b/.test(q);
    if (command) return result(readonly + stepsFor(q));
    if (how) return result(stepsFor(q));
    if (/\b(ontem|semana|ano|passado|passada|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|20\d\d)\b/.test(q)) return result('Posso consultar o saldo atual e as entradas/despesas do mês atual. Para outros períodos, use os filtros de Financeiro ou Relatórios.');
    const monthly = /\b(mes|mensal)\b/.test(q), f = context.financial;
    const selected = context.selected;
    const financialQuestion = /\b(saldo|balanco|entrou|entradas?|receitas?|recebemos|recebido|gasto|gastos|gastou|gastamos|despesas?|saiu|pagamos)\b/.test(q);
    if (financialQuestion && (selected.owners.length || selected.pastures.length || selected.categories.length || /\b(pasto|proprietario|categoria|venda|vendas|compra|compras|alimentacao|comissao)\b/.test(q))) return result('Aqui consulto os totais financeiros gerais. Para valores por proprietário, propriedade, categoria ou operação, use os filtros de Financeiro ou Relatórios.');
    const period = monthly ? ` no mês ${f.month.split('-').reverse().join('/')}` : ' em todo o período registrado';
    if (/\b(saldo|balanco)\b/.test(q)) return result(`O saldo${period} é ${money(monthly ? f.monthlyBalanceCents : f.balanceCents)}. Ele é calculado pelas entradas menos as despesas.`);
    if (/\b(entrou|entradas?|receitas?|recebemos|recebido)\b/.test(q)) return result(`As entradas${period} somam ${money(monthly ? f.monthlyIncomeCents : f.totalIncomeCents)}.`);
    if (/\b(gasto|gastos|gastou|gastamos|despesas?|saiu|pagamos)\b/.test(q)) return result(`As despesas${period} somam ${money(monthly ? f.monthlyExpenseCents : f.totalExpenseCents)}.`);
    if (/\b(ultim[ao]s?|recentes?|historico)\b/.test(q) && /\b(movimentacoes|movimentacao|registros|vendas|compras)\b/.test(q)) {
      if (!context.recentMovements.length) return result('Não há movimentações registradas nesse recorte. Consulte Movimentações para adicionar ou pesquisar registros.');
      return result('Movimentações recentes:\n' + context.recentMovements.map(m => `${formatDate(m.date)} · ${m.type} · ${number(m.quantity)} ${m.category.toLowerCase()}`).join('\n'));
    }
    if (/\b(quant[oa]s?|total|temos|existem|rebanho|distribuicao)\b/.test(q)) {
      if (/\b(vendemos|vendid[oa]s?|vendas?|compramos|comprad[oa]s?|compras?|morreram|mort[oa]s?|nasceram|nascimentos?|transferid[oa]s?|transferencias?)\b/.test(q)) return result('Essa pergunta exige somar movimentações. Consulte os filtros de Movimentações ou Relatórios; as quantidades que consulto aqui são o estoque atual.');
      if (/\b(cavalos?|eguas?|ovelhas?|porcos?|galinhas?|touros?|terneir[oa]s?)\b/.test(q)) return result('As categorias cadastradas são Vacas, Bois, Novilhas, Bezerras e Bezerros. Não tenho uma contagem separada para a categoria informada.');
      if (monthly) return result('As quantidades disponíveis aqui representam o estoque atual. Consulte Movimentações ou Relatórios para analisar registros por período.');
      const named = selected.pastures.length || selected.owners.length || selected.categories.length;
      if (/\b(por pasto|cada pasto|nos pastos|por proprietario|cada proprietario)\b/.test(q) && !named) {
        const group = /pasto/.test(q) ? context.summary.byPasture : context.summary.byOwner;
        return result(group.items.map(x => `${x.name}: ${number(x.quantity)} cabeças`).join('\n') + (group.omitted ? `\nMais ${group.omitted} grupos disponíveis nos relatórios.` : '') + (context.demoHerd ? '\nO rebanho está em demonstração.' : ''));
      }
      if (/\bpasto\b/.test(q) && !selected.pastures.length) return result('Não identifiquei o pasto informado. Confira seu nome na tela Pastos e pergunte novamente.');
      if (!selected.owners.length && !selected.pastures.length && /\b(d[oa]|de)\s+(?!gado\b|animais\b|rebanho\b|cabecas\b|vacas\b|bois\b|novilhas\b|bezerras\b|bezerros\b|fazenda\b)\w+\s*$/.test(q)) return result('Não identifiquei esse proprietário ou pasto. Confira o nome cadastrado e pergunte novamente.');
      const quantity = named ? selected.quantity : context.summary.totalCattle;
      const animal = selected.categories.length ? selected.categories.map(c => c.toLowerCase()).join(' e ') : 'animais';
      const scope = [selected.pastures.length ? `no pasto ${selected.pastures.join(' e ')}` : '', selected.owners.length ? `de ${selected.owners.join(' e ')}` : ''].filter(Boolean).join(' ');
      return result(`Temos ${number(quantity)} ${animal}${scope ? ' ' + scope : ' no rebanho'}.${context.demoHerd ? ' O rebanho está em demonstração.' : ''}`);
    }
    if (/^(oi|ola|bom dia|boa tarde|boa noite)$/.test(q)) return result('Olá! Posso consultar o rebanho, o saldo, as contas do mês e explicar como registrar as operações.');
    return { handled: false, mode: 'local', text: 'No modo local, respondo sobre quantidades atuais, pastos, proprietários, saldo e contas do mês atual. Também explico como registrar operações. Experimente: “Quantas vacas temos?” ou “Quanto foi gasto este mês?”.' };
  }
}

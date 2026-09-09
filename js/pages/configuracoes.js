import { summarize, getFinances } from '../domain.js';
import { number } from '../utils.js';
import { APP_VERSION } from '../constants.js';

export function render() {
  return `<div class="section-heading"><div><h3>Gerenciamento de Dados</h3><p>Guarde uma cópia da fazenda e restaure seus registros quando precisar.</p></div></div>
    <section class="panel data-overview"><h3>Dados deste navegador</h3><dl class="data-counts" id="settings-counts"></dl><p class="page-footnote">O backup inclui estoque inicial, movimentações, pastos, proprietários, lançamentos financeiros e fotos. Computador e celular mantêm bases locais independentes.</p></section>
    <div class="data-management-grid"><section class="panel data-management-card"><h3>Exportar backup</h3><p>Baixe todos os registros em um único arquivo JSON identificado e versionado. Guarde a cópia em um local de sua confiança.</p><button class="primary-button" data-action="export-backup">Exportar backup</button></section>
    <section class="panel data-management-card"><h3>Importar backup</h3><p>Selecione uma cópia de até 20 MB. O sistema valida o arquivo e mostra um resumo antes de substituir os registros atuais.</p><button class="secondary-button" data-action="import-backup">Importar backup</button></section>
    <section class="panel data-management-card danger-zone"><h3>Limpar dados locais</h3><p>Apaga animais, movimentações, pastos, financeiro e fotos deste navegador. Exporte uma cópia antes de continuar.</p><button class="primary-button danger-button" data-action="clear-local-data">Limpar dados locais</button></section></div>
    <p class="page-footnote" id="settings-version"></p>`;
}
export function setup(data) {
  const summary = summarize(data), target = document.getElementById('settings-counts');
  const rows = [['Animais', summary.total], ['Movimentações', data.movements.length], ['Financeiro', getFinances(data).length], ['Pastos ativos', summary.pastures.length], ['Fotos', data.photos.length]];
  target.replaceChildren(...rows.map(([label, count]) => {
    const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label; dd.textContent = number(count); row.append(dt, dd); return row;
  }));
  document.getElementById('settings-version').textContent = `Controle Gado ${APP_VERSION} · Dados salvos neste navegador`;
}

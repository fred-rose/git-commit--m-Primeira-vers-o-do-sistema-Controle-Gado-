import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as XLSX from '../js/vendor/xlsx.js';
import { createSeed } from './fixtures/legacy.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR', acceptDownloads: true });
await context.addInitScript(seed=>{if(/^https?:$/.test(location.protocol)&&!localStorage.getItem('controle-gado:v1'))localStorage.setItem('controle-gado:v1',JSON.stringify(seed));},createSeed());
const page = await context.newPage(), errors = [], requests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', request => requests.push(request.url()));
const artifacts = resolve('tests/artifacts');
await mkdir(artifacts, { recursive: true });
const base = process.env.TEST_URL || 'http://127.0.0.1:4173';
const modal = page.locator('#dialog'), panel = page.locator('#assistant-panel');
const raw = () => page.evaluate(() => localStorage.getItem('controle-gado:v1'));
const submit = () => modal.locator('button[type="submit"]').click();
const closed = () => modal.waitFor({ state: 'hidden' });
async function go(route) {
  await page.evaluate(route => { location.hash = route; }, route);
  await page.waitForFunction(route => document.querySelector('.menu-item.active')?.getAttribute('href') === '#' + route, route);
}
async function openChat() { await page.locator('#assistant-launcher').click(); await panel.waitFor(); }
async function ask(question) {
  await page.locator('#assistant-input').fill(question);
  await page.locator('#assistant-input').press('Enter');
  await page.waitForFunction(() => !document.getElementById('assistant-send').disabled && document.querySelectorAll('.chat-assistant').length > 0);
  return page.locator('.chat-assistant').last().innerText();
}
async function closeChat() { await page.locator('#assistant-close').click(); await panel.waitFor({ state: 'hidden' }); }
async function upload(buffer) {
  await page.waitForFunction(()=>!document.querySelector('[data-action="import-backup"]').disabled);
  await page.locator('#backup-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(buffer) });
}
async function addMovement(type, category, quantity, value) {
  await page.locator('#novaMovimentacaoBtn').click();
  await modal.locator('[name="type"]').selectOption(type);
  await modal.locator('[name="category"]').selectOption(category);
  await modal.locator('[name="quantity"]').fill(String(quantity));
  await modal.locator('[name="ownerId"]').selectOption('owner-1');
  await modal.locator('[name="pastureId"]').selectOption('pasture-2');
  await modal.locator('[name="value"]').fill(value);
  await submit(); await closed();
}
try {
  await page.goto(base + '/#configuracoes');
  await page.locator('#settings-counts').waitFor();
  assert.match(await page.locator('#settings-counts').innerText(), /169/);
  await page.evaluate(() => { localStorage.setItem('outro-sistema', 'preservar'); window.navigationSentinel = 'mesma-pagina'; });
  await page.screenshot({ path: resolve(artifacts, 'configuracoes-desktop.png'), fullPage: true });
  await openChat();
  await context.setOffline(true);
  const before = await raw(), requestCount = requests.length;
  assert.match(await ask('Quantas vacas temos?'), /108 vacas/);
  assert.match(await ask('Qual o saldo?'), /58\.485,81/);
  assert.match(await ask('Venda 5 vacas'), /não realizo alterações/);
  assert.equal(await raw(), before);
  assert.equal(requests.length, requestCount);
  await page.screenshot({ path: resolve(artifacts, 'assistente-desktop.png') });
  await closeChat();
  // All CRUD modules are already loaded; these changes and answers work offline.
  await addMovement('Venda', 'Vacas', 10, '40000,00');
  await addMovement('Compra', 'Bois', 5, '20000,00');
  await openChat();
  assert.match(await ask('Quantas vacas temos?'), /98 vacas/);
  assert.match(await ask('Quantos bois temos?'), /8 bois/);
  assert.match(await ask('Qual o saldo?'), /78\.485,81/);
  for (let i = 0; i < 9; i++) await ask('Quantos animais existem?');
  assert.equal(await page.locator('.chat-message').count(), 20);
  await ask('<img src=x onerror="window.chatInjected=true">');
  assert.equal(await page.locator('#assistant-log img').count(), 0);
  assert.equal(await page.evaluate(() => window.chatInjected), undefined);
  assert.match(await page.locator('.chat-user').last().innerText(), /<img/);
  const current = await raw();
  await page.locator('#assistant-clear').click();
  assert.equal(await page.locator('.chat-message').count(), 0);
  assert.equal(await raw(), current);
  await closeChat(); await context.setOffline(false);
  process.stdout.write('OK: assistente offline, venda/compra refletidas, limite de 20, texto seguro e nenhum acesso de rede.\n');

  const pending = page.waitForEvent('download');
  await page.locator('[data-action="export-backup"]').click();
  const file = await pending, backupPath = resolve(artifacts, 'backup-estruturado.json');
  assert.match(file.suggestedFilename(), /^controle-gado-backup-\d{4}-\d{2}-\d{2}\.json$/);
  await file.saveAs(backupPath);
  const backup = await readFile(backupPath, 'utf8'), envelope = JSON.parse(backup);
  assert.equal(envelope._meta.system, 'controle-gado');
  assert.equal(envelope.data.movements.length, 2);
  const beforeInvalid = await raw();
  await upload('{"qualquer":"coisa"}');
  await page.locator('.toast-error').last().waitFor();
  assert.equal(await modal.isVisible(), false);
  assert.equal(await raw(), beforeInvalid);
  await page.locator('[data-action="clear-local-data"]').click();
  assert.equal(await modal.locator('button[type="submit"]').isDisabled(), true);
  await modal.locator('[name="confirmation"]').fill('limpar');
  assert.equal(await modal.locator('button[type="submit"]').isDisabled(), true);
  await modal.locator('[name="confirmation"]').fill('LIMPAR');
  await submit(); await closed();
  assert.equal(JSON.parse(await raw()).finances.length, 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('outro-sistema')), 'preservar');
  assert.equal(await page.evaluate(() => window.navigationSentinel), 'mesma-pagina');
  await page.reload(); await page.locator('#settings-counts').waitFor();
  assert.equal(JSON.parse(await raw()).finances.length, 0);
  await page.evaluate(() => { window.navigationSentinel = 'restauracao-sem-reload'; });
  await upload(backup);
  await modal.waitFor();
  assert.match(await modal.innerText(), /Conferir restauração/);
  assert.match(await modal.innerText(), /164/);
  assert.match(await modal.innerText(), /46/);
  assert.equal(JSON.parse(await raw()).movements.length, 0);
  await modal.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal(JSON.parse(await raw()).movements.length, 0);
  await upload(backup); await modal.waitFor();
  await submit(); await closed();
  assert.equal(await page.evaluate(() => window.navigationSentinel), 'restauracao-sem-reload');
  assert.match(await page.locator('#settings-counts').innerText(), /164/);
  const restored = JSON.parse(await raw());
  assert.deepEqual({ ...restored, revision: envelope.data.revision }, envelope.data);
  await openChat(); assert.match(await ask('Qual o saldo?'), /78\.485,81/); await closeChat();
  await page.reload(); await page.locator('#settings-counts').waitFor();
  assert.equal(JSON.parse(await raw()).finances.length, 44);
  assert.equal(JSON.parse(await raw()).movements.length, 2);
  process.stdout.write('OK: JSON identificado, rejeição sem alteração, LIMPAR, cancelamento e restauração sem reload, seed preservado.\n');

  await go('relatorios');
  const excelPending = page.waitForEvent('download');
  await page.locator('[data-action="export-excel"][data-id="general"]').click();
  const excel = await excelPending, excelPath = resolve(artifacts, 'restaurado-geral.xlsx');
  await excel.saveAs(excelPath);
  const workbook = XLSX.read(await readFile(excelPath));
  assert.deepEqual(workbook.SheetNames, ['Resumo', 'Rebanho', 'Movimentações', 'Pastos', 'Financeiro']);
  assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets.Financeiro, { header: 1, range: 4 }).length, 46);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['dashboard', 'rebanho', 'movimentacoes', 'pastos', 'financeiro', 'fotos', 'relatorios', 'configuracoes']) {
      await go(route);
      assert.ok(await page.locator('#assistant-launcher').isVisible());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} excede ${width}px`);
    }
    await openChat(); await ask('Quantas vacas temos?');
    const bounds = await panel.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
    assert.ok(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    assert.ok(await page.locator('#assistant-close').isVisible());
    if (width === 390) await page.screenshot({ path: resolve(artifacts, 'assistente-mobile.png') });
    await page.keyboard.press('Escape'); await panel.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#assistant-launcher').evaluate(el => el === document.activeElement), true);
    if (width === 390) await page.screenshot({ path: resolve(artifacts, 'configuracoes-mobile.png'), fullPage: true });
  }
  assert.deepEqual(errors, []);
  process.stdout.write('OK: XLSX restaurado com cinco abas; oito telas de 320 a 1440 px, foco e console sem erros.\n');
} catch (error) {
  await page.screenshot({ path: resolve(artifacts, 'data-failure.png'), fullPage: true }).catch(() => {});
  process.stderr.write(JSON.stringify(errors) + '\n'); throw error;
} finally { await browser.close(); }

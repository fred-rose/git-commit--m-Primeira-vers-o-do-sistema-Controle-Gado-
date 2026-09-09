import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSeed } from '../js/seed.js';

// Dependência opcional de desenvolvimento. A aplicação não precisa de Playwright.
const playwrightModule = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(playwrightModule ? pathToFileURL(resolve(playwrightModule)).href : 'playwright');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR', acceptDownloads: true });
const fixture = { ...createSeed(), finances: [], seedVersion: 0, appliedSeeds: [] };
await context.addInitScript(fixture => { if (/^https?:$/.test(location.protocol) && localStorage.getItem('controle-gado:v1') === null) localStorage.setItem('controle-gado:v1', JSON.stringify(fixture)); }, fixture);
const page = await context.newPage();
const errors = [];
context.on('page', watch);
watch(page);
function watch(tab) {
  tab.on('pageerror', error => errors.push(error.message));
  tab.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
}
const artifacts = resolve('tests/artifacts');
await mkdir(artifacts, { recursive: true });
const base = process.env.TEST_URL || 'http://127.0.0.1:4173';
const dialog = page.locator('#dialog');
const submit = () => dialog.locator('button[type="submit"]').click();
async function closed() { await dialog.waitFor({ state: 'hidden' }); }
async function go(route) {
  await page.evaluate(route => { location.hash = route; }, route);
  await page.waitForFunction(route => document.querySelector('.menu-item.active')?.getAttribute('href') === '#' + route.split('?')[0], route);
}
async function total(expected) {
  await go('dashboard');
  await page.waitForFunction(expected => document.querySelector('#totalRebanho')?.textContent === String(expected), expected);
}
async function addMovement({ type, category = 'Vacas', quantity, pastureId = 'pasture-2', ownerId = 'owner-1', destinationId, value, note }) {
  await page.locator('#novaMovimentacaoBtn').click();
  await dialog.locator('[name="type"]').selectOption(type);
  await dialog.locator('[name="category"]').selectOption(category);
  await dialog.locator('[name="quantity"]').fill(String(quantity));
  await dialog.locator('[name="ownerId"]').selectOption(ownerId);
  await dialog.locator('[name="pastureId"]').selectOption(pastureId);
  if (destinationId) await dialog.locator('[name="destinationId"]').selectOption(destinationId);
  if (value) await dialog.locator('[name="value"]').fill(value);
  if (note) await dialog.locator('[name="note"]').fill(note);
  await submit();
}

try {
  await page.goto(base);
  await total(169);
  await page.screenshot({ path: resolve(artifacts, 'dashboard-desktop.png'), fullPage: true });
  await addMovement({ type: 'Nascimento', category: 'Bezerros', quantity: 5, note: '<img src=x onerror=alert(1)>' });
  await closed(); await total(174);
  await addMovement({ type: 'Venda', quantity: 10, value: '40000,00' });
  await closed(); await total(164);
  assert.match(await page.locator('.financial-panel').innerText(), /40\.000,00/);
  await addMovement({ type: 'Transferência de pasto', quantity: 20, destinationId: 'pasture-3' });
  await closed(); await total(164);
  await addMovement({ type: 'Venda', quantity: 500, value: '100000' });
  await dialog.locator('.form-error').waitFor({ state: 'visible' });
  assert.match(await dialog.locator('.form-error').innerText(), /Saldo insuficiente/);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await total(164);
  await page.reload(); await total(164);
  process.stdout.write('OK: nascimento, venda, transferência, bloqueio e persistência.\n');

  await go('movimentacoes');
  assert.equal(await page.locator('tbody img').count(), 0);
  const saleRow = page.locator('tbody tr').filter({ has: page.locator('.badge', { hasText: /^Venda$/ }) });
  await saleRow.locator('[data-action="edit-movement"]').click();
  await dialog.locator('[name="quantity"]').fill('5');
  await dialog.locator('[name="value"]').fill('20000,00');
  await submit(); await closed(); await total(169);
  await go('movimentacoes');
  await saleRow.locator('[data-action="delete-movement"]').click();
  await submit(); await closed(); await total(174);
  await addMovement({ type: 'Compra', quantity: 2, value: '10000' });
  await closed(); await total(176);
  process.stdout.write('OK: edição/exclusão e financeiro recalculado.\n');

  await go('rebanho');
  await page.locator('#filters-form [name="ownerId"]').selectOption('owner-1');
  await page.locator('#filters-form [name="pastureId"]').selectOption('pasture-2');
  await page.locator('#filters-form [name="category"]').selectOption('Vacas');
  await page.locator('#filters-form button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
  assert.match(await page.locator('tbody').innerText(), /12/);
  await page.getByRole('link', { name: 'Ver histórico', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#page-title').textContent === 'Movimentações');
  assert.equal(await page.locator('tbody tr').count(), 2);

  await go('pastos');
  await page.locator('[data-action="delete-pasture"][data-id="pasture-1"]').click();
  await submit();
  assert.match(await dialog.locator('.form-error').innerText(), /ainda possui animais/);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.locator('[data-action="new-pasture"]').click();
  await dialog.locator('[name="name"]').fill('Pasto de teste');
  await submit(); await closed();
  let card = page.locator('.pasture-card').filter({ hasText: 'Pasto de teste' });
  await card.locator('[data-action="edit-pasture"]').click();
  await dialog.locator('[name="name"]').fill('Pasto renomeado');
  await submit(); await closed();
  card = page.locator('.pasture-card').filter({ hasText: 'Pasto renomeado' });
  await card.locator('[data-action="delete-pasture"]').click();
  await submit(); await closed();
  assert.equal(await page.locator('.pasture-card').count(), 5);
  process.stdout.write('OK: filtros, histórico associado e cadastro/edição/exclusão de pasto.\n');

  await go('financeiro');
  await page.locator('[data-action="new-finance"]').click();
  await dialog.locator('[name="category"]').fill('Alimentação');
  await dialog.locator('[name="value"]').fill('150,25');
  await dialog.locator('[name="description"]').fill('Ração do mês');
  await submit(); await closed();
  assert.match(await page.locator('.finance-cards').innerText(), /10\.150,25/);
  await page.locator('#filters-form [name="type"]').selectOption('Entrada');
  await page.locator('#filters-form button[type="submit"]').click();
  await page.locator('.empty-state').waitFor();
  await page.locator('[data-action="clear-filters"]').click();
  await page.locator('tbody').waitFor();

  await go('fotos');
  await page.locator('[data-action="new-photo"]').click();
  await dialog.locator('[name="title"]').fill('Vistoria Barragem');
  await dialog.locator('[name="pastureId"]').selectOption('pasture-2');
  await dialog.locator('[name="ownerId"]').selectOption('owner-1');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 80;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#234d35'; ctx.fillRect(0, 0, 120, 80);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await dialog.locator('[name="file"]').setInputFiles({ name: 'pasto.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await submit(); await closed();
  assert.equal(await page.locator('.photo-card').count(), 1);
  assert.equal(await page.locator('.photo-card img').evaluate(img => img.complete && img.naturalWidth > 0), true);
  await page.locator('[data-action="view-photo"]').click();
  await dialog.locator('.photo-full').waitFor();
  await submit(); await closed();
  await page.locator('[data-action="edit-photo"]').click();
  await dialog.locator('[name="description"]').fill('Rebanho conferido');
  await submit(); await closed();
  process.stdout.write('OK: lançamento manual, filtros financeiros, upload e edição de foto.\n');

  await go('relatorios');
  await page.locator('#filters-form [name="report"]').selectOption('trades');
  await page.waitForFunction(() => document.querySelector('.report-heading h3').textContent === 'Compras e vendas');
  const csvDownload = page.waitForEvent('download');
  await page.locator('[data-action="export-csv"]').click();
  const csvFile = await csvDownload;
  await csvFile.saveAs(resolve(artifacts, 'compras-vendas.csv'));
  assert.match(await readFile(resolve(artifacts, 'compras-vendas.csv'), 'utf8'), /Compra/);
  await page.pdf({ path: resolve(artifacts, 'relatorio.pdf'), preferCSSPageSize: true, printBackground: true });
  await go('dashboard');
  const backupDownload = page.waitForEvent('download');
  await page.locator('[data-action="export-backup"]').click();
  const backupFile = await backupDownload;
  const backupPath = resolve(artifacts, 'backup-teste.json');
  await backupFile.saveAs(backupPath);
  await page.locator('[data-action="start-empty"]').click();
  await submit(); await closed(); await total(0);
  await page.locator('#backup-file').setInputFiles(backupPath);
  await dialog.waitFor({ state: 'visible' });
  await submit(); await closed(); await total(176);
  await go('fotos');
  assert.equal(await page.locator('.photo-card').count(), 1);
  process.stdout.write('OK: CSV, impressão PDF, início vazio e restauração completa de backup.\n');

  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['dashboard', 'rebanho', 'movimentacoes', 'pastos', 'financeiro', 'fotos', 'relatorios']) {
      await go(route);
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
      assert.ok(dimensions.content <= dimensions.viewport + 1, `${route}: overflow em ${width}px (${dimensions.content})`);
    }
    if (width === 390) {
      await go('dashboard');
      await page.locator('.toast').waitFor({ state: 'hidden' });
      await page.screenshot({ path: resolve(artifacts, 'dashboard-mobile.png'), fullPage: true });
      await page.locator('#menu-toggle').click();
      await page.getByRole('link', { name: 'Pastos', exact: true }).click();
      assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'), 'false');
      await page.locator('#novaMovimentacaoBtn').click();
      assert.equal(await dialog.locator('.form-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 1);
      const box = await dialog.boundingBox(); assert.ok(box.width <= 390 && box.height <= 900);
      await page.screenshot({ path: resolve(artifacts, 'formulario-mobile.png') });
      await page.keyboard.press('Escape'); await closed();
    }
  }
  process.stdout.write('OK: sete páginas sem overflow em 1440, 1024, 768, 390 e 320 px; menu e formulário mobile.\n');

  await page.setViewportSize({ width: 1440, height: 1000 });
  const second = await context.newPage();
  await second.goto(base);
  await second.locator('#totalRebanho').waitFor();
  await addMovement({ type: 'Entrada', quantity: 1 });
  await closed();
  await second.locator('#stale-notice').waitFor({ state: 'visible' });
  await second.locator('#novaMovimentacaoBtn').click();
  await second.locator('#dialog [name="quantity"]').fill('1');
  await second.locator('#dialog [name="ownerId"]').selectOption('owner-1');
  await second.locator('#dialog [name="pastureId"]').selectOption('pasture-2');
  await second.locator('#dialog button[type="submit"]').click();
  assert.match(await second.locator('.form-error').innerText(), /outra aba/);
  await second.close();
  const corruptContext = await browser.newContext();
  await corruptContext.addInitScript(() => { if (/^https?:$/.test(location.protocol)) localStorage.setItem('controle-gado:v1', '{corrompido'); });
  const corruptPage = await corruptContext.newPage();
  await corruptPage.goto(base);
  await corruptPage.locator('.startup-error').waitFor();
  assert.equal(await corruptPage.evaluate(() => localStorage.getItem('controle-gado:v1')), '{corrompido');
  await corruptContext.close();
  assert.deepEqual(errors, []);
  process.stdout.write('OK: conflito entre abas e recuperação de dados corrompidos. Nenhum erro de console ou JavaScript.\n');
} catch (error) {
  await page.screenshot({ path: resolve(artifacts, 'failure.png'), fullPage: true }).catch(() => {});
  process.stderr.write(`Erros de navegador: ${JSON.stringify(errors)}\n`);
  throw error;
} finally { await browser.close(); }

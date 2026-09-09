import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as XLSX from '../js/vendor/xlsx.js';
import { createSeed } from '../js/seed.js';

const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : 'playwright');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR', acceptDownloads: true });
const errors = [];
context.on('page', tab => {
  tab.on('pageerror', error => errors.push(error.message));
  tab.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
});
const page = await context.newPage();
const base = process.env.TEST_URL || 'http://127.0.0.1:4173';
const artifacts = resolve('tests/artifacts');
await mkdir(artifacts, { recursive: true });
const dialog = page.locator('#dialog');
async function go(hash) {
  await page.evaluate(hash => { location.hash = hash; }, hash);
  await page.waitForFunction(hash => document.querySelector('.menu-item.active')?.getAttribute('href') === '#' + hash.split('?')[0], hash);
}
async function download(kind, filename) {
  const pending = page.waitForEvent('download');
  await page.locator(`[data-action="export-excel"][data-id="${kind}"]`).click();
  const file = await pending;
  assert.ok(file.suggestedFilename().endsWith('.xlsx'));
  const path = resolve(artifacts, filename);
  await file.saveAs(path);
  return XLSX.read(await readFile(path), { cellNF: true });
}
const rowCount = sheet => XLSX.utils.sheet_to_json(sheet, { header: 1, range: 4 }).length;
try {
  await page.goto(base + '/#financeiro');
  await page.locator('.finance-cards').waitFor();
  assert.equal(await page.locator('tbody tr').count(), 44);
  assert.match(await page.locator('.finance-cards').innerText(), /176\.570,02/);
  assert.match(await page.locator('.finance-cards').innerText(), /58\.485,81/);
  await page.reload();
  await page.locator('.finance-cards').waitFor();
  assert.equal(await page.locator('tbody tr').count(), 44);
  await page.locator('tbody tr').filter({ hasText: 'Comissão Danilo' }).locator('[data-action="view-finance"]').click();
  assert.match(await dialog.innerText(), /848\.6568/);
  assert.match(await dialog.innerText(), /848,66/);
  await dialog.locator('button[type="submit"]').click();
  await dialog.waitFor({ state: 'hidden' });
  await page.locator('#filters-form [name="source"]').selectOption('migration');
  await page.locator('#filters-form [name="category"]').selectOption('Alimentação');
  await page.locator('#filters-form button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2);
  const filtered = await download('finance', 'financeiro-filtrado.xlsx');
  assert.equal(rowCount(filtered.Sheets.Financeiro), 2);
  assert.deepEqual(filtered.SheetNames, ['Financeiro']);
  await page.locator('[data-action="clear-filters"]').click();
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 44);
  await page.screenshot({ path: resolve(artifacts, 'financeiro-desktop.png') });

  await page.locator('[data-action="new-finance"]').click();
  await dialog.locator('[name="ownerId"]').selectOption('owner-1');
  await dialog.locator('[name="category"]').fill('Serviço específico');
  await dialog.locator('[name="property"]').fill('Fazenda de teste');
  await dialog.locator('[name="value"]').fill('100,01');
  await dialog.locator('[name="description"]').fill('Serviço manual');
  await dialog.locator('[name="notes"]').fill('Recibo conferido');
  await dialog.locator('button[type="submit"]').click();
  await dialog.waitFor({ state: 'hidden' });
  await page.locator('#filters-form [name="ownerId"]').selectOption('owner-1');
  await page.locator('#filters-form [name="source"]').selectOption('manual');
  await page.locator('#filters-form button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
  assert.match(await page.locator('tbody').innerText(), /Bruno/);
  await page.locator('[data-action="edit-finance"]').click();
  assert.equal(await dialog.locator('[name="notes"]').inputValue(), 'Recibo conferido');
  await dialog.locator('[name="value"]').fill('200');
  await dialog.locator('button[type="submit"]').click();
  await dialog.waitFor({ state: 'hidden' });
  await page.locator('[data-action="delete-finance"]').click();
  await dialog.locator('button[type="submit"]').click();
  await dialog.waitFor({ state: 'hidden' });
  process.stdout.write('OK: carga real única, conferência do valor original e filtros/manual completos.\n');

  for (const [route, kind, name] of [['rebanho', 'herd', 'Rebanho'], ['movimentacoes', 'movements', 'Movimentações'], ['pastos', 'pastures', 'Pastos']]) {
    await go(route);
    assert.deepEqual((await download(kind, `${kind}.xlsx`)).SheetNames, [name]);
  }
  await go('relatorios');
  const general = await download('general', 'relatorio-geral.xlsx');
  assert.deepEqual(general.SheetNames, ['Resumo', 'Rebanho', 'Movimentações', 'Pastos', 'Financeiro']);
  assert.equal(rowCount(general.Sheets.Financeiro), 44);
  await page.locator('#filters-form [name="report"]').selectOption('finance');
  await page.waitForFunction(() => document.querySelector('.report-heading h3').textContent === 'Financeiro por período');
  await page.pdf({ path: resolve(artifacts, 'financeiro-impresso.pdf'), preferCSSPageSize: true });
  process.stdout.write('OK: downloads XLSX nos quatro módulos e relatório geral com cinco abas; impressão.\n');

  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['financeiro', 'relatorios', 'pastos', 'rebanho', 'movimentacoes']) {
      await go(route);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} excede ${width}px`);
    }
    if (width === 390) {
      await go('financeiro');
      await page.locator('.toast').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.filter-disclosure').getAttribute('open'), null);
      await page.screenshot({ path: resolve(artifacts, 'financeiro-mobile.png') });
      await page.locator('.filter-disclosure summary').click();
      await page.locator('#filters-form [name="category"]').selectOption('Alimentação');
      await page.locator('#filters-form button[type="submit"]').click();
      await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2);
      assert.equal(await page.locator('.filter-disclosure').getAttribute('open'), null);
      await go('financeiro');
      await page.locator('[data-action="new-finance"]').click();
      assert.equal(await dialog.locator('.form-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 1);
      await page.screenshot({ path: resolve(artifacts, 'financeiro-formulario-mobile.png') });
      await page.keyboard.press('Escape');
    }
  }

  const legacyContext = await browser.newContext({ acceptDownloads: true });
  const legacyData = { ...createSeed(), version: 1, finances: [{ id: 'legacy-record', date: '2026-09-01', type: 'Despesa', category: 'Outros', valueCents: 500, description: 'Registro anterior' }] };
  delete legacyData.seedVersion; delete legacyData.appliedSeeds;
  await legacyContext.addInitScript(data => { if (/^https?:$/.test(location.protocol) && !localStorage.getItem('controle-gado:v1')) localStorage.setItem('controle-gado:v1', JSON.stringify(data)); }, legacyData);
  const old = await legacyContext.newPage();
  await old.goto(base + '/#financeiro');
  await old.locator('[data-action="import-financial-seed"]').waitFor();
  assert.equal(await old.locator('tbody tr').count(), 1);
  await old.locator('[data-action="import-financial-seed"]').click();
  await old.locator('#dialog button[type="submit"]').click();
  await old.locator('#dialog').waitFor({ state: 'hidden' });
  assert.equal(await old.locator('tbody tr').count(), 45);
  await old.reload();
  await old.locator('.finance-cards').waitFor();
  assert.equal(await old.locator('tbody tr').count(), 45);
  assert.equal(await old.locator('[data-action="import-financial-seed"]').count(), 0);
  await legacyContext.close();
  assert.deepEqual(errors, []);
  process.stdout.write('OK: responsividade de 320 a 1440 px, preservação de V1 e importação idempotente. Console sem erros.\n');
} catch (error) {
  await page.screenshot({ path: resolve(artifacts, 'finance-failure.png'), fullPage: true }).catch(() => {});
  process.stderr.write(JSON.stringify(errors) + '\n');
  throw error;
} finally { await browser.close(); }

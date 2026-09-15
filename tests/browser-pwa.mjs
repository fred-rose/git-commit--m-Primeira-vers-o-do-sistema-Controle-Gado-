import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173');
 await page.waitForFunction(()=>Boolean(document.querySelector('#totalRebanho')));
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 const before=await page.locator('#totalRebanho').innerText();
 await context.setOffline(true);await page.reload();await page.waitForFunction(()=>Boolean(document.querySelector('#totalRebanho')));
 assert.equal(await page.locator('#totalRebanho').innerText(),before);
 await page.evaluate(()=>location.hash='evolucao');await page.locator('.evolution-chart').waitFor();
 const cachesList=await page.evaluate(async()=>{const keys=await caches.keys();const cache=await caches.open(keys.find(k=>k.startsWith('controle-gado-shell-')));return(await cache.keys()).map(r=>r.url);});
 assert.ok(!cachesList.some(url=>url.includes('/rest/v1')||url.includes('/auth/v1')||url.includes('/storage/v1')));
 assert.deepEqual(errors,[]);console.log('PASS PWA: recarrega e navega sem rede; cache contém somente arquivos públicos do app.');
}finally{await browser.close();}

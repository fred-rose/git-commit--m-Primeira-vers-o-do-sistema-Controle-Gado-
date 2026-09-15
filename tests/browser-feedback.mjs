import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
await context.route('**/js/config.js',route=>route.fulfill({contentType:'text/javascript',body:"export const config={supabaseUrl:'',supabaseAnonKey:''};"}));
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
const dialog=page.locator('#dialog'),button=dialog.locator('[type=submit]');
const state=expected=>page.waitForFunction(expected=>document.querySelector('#dialog [type=submit]')?.dataset.buttonState===expected,expected);
try{
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173');await page.locator('#totalRebanho').waitFor();
  await page.evaluate(async()=>{
    const {openModal}=await import('/js/components/modal.js');window.calls=0;
    openModal({title:'Salvar movimentação',content:'<label class="form-group">Descrição<input name="note" value="Conferido no campo"></label>',
      submit:()=>{window.calls++;return new Promise((resolve,reject)=>{window.complete=resolve;window.fail=reject;});}});
  });
  const before=await button.boundingBox();
  await page.evaluate(()=>{const form=document.querySelector('#dialog form');form.dispatchEvent(new Event('submit',{cancelable:true}));form.dispatchEvent(new Event('submit',{cancelable:true}));});
  await state('loading');assert.equal(await page.evaluate(()=>window.calls),1);assert.equal(await button.getAttribute('aria-busy'),'true');
  const during=await button.boundingBox();assert.equal(during.width,before.width);assert.equal(during.height,before.height);
  await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true);
  await page.evaluate(()=>window.fail(new Error('Servidor indisponível. Dados preservados.')));await state('error');
  assert.match(await dialog.locator('.form-error').innerText(),/Dados preservados/);
  await page.waitForFunction(()=>!document.querySelector('#dialog [type=submit]').disabled);
  assert.equal(await dialog.locator('[name=note]').inputValue(),'Conferido no campo');
  await button.click();await state('loading');assert.equal(await page.evaluate(()=>window.calls),2);
  await page.evaluate(()=>window.complete());await state('success');const confirmedAt=Date.now();
  assert.equal(await dialog.isVisible(),true);await dialog.waitFor({state:'hidden'});assert.ok(Date.now()-confirmedAt>=750);
  // Um modal de consulta síncrona continua fechando sem feedback de gravação.
  await page.evaluate(async()=>{const {openModal}=await import('/js/components/modal.js');openModal({title:'Detalhe',content:'Consulta',submitLabel:'Fechar',successMessage:'',submit(){}});});
  await button.click();await dialog.waitFor({state:'hidden'});
  // Desativar a apresentação não pode permitir substituir um formulário em gravação.
  await page.evaluate(async()=>{
    const {openModal}=await import('/js/components/modal.js');window.silentCalls=0;
    openModal({title:'Operação sem animação',feedback:false,content:'<input name="note" value="Preservar"><input name="fixed" disabled value="Bloqueado">',submit:()=>{window.silentCalls++;return new Promise((resolve,reject)=>{window.silentComplete=resolve;window.silentFail=reject;});}});
  });
  await button.click();assert.equal(await button.getAttribute('data-button-state'),null);
  assert.equal(await dialog.locator('form').getAttribute('aria-busy'),'true');
  assert.equal(await dialog.locator('[name=note]').isDisabled(),true);
  assert.equal(await page.evaluate(async()=>{const {openModal}=await import('/js/components/modal.js');try{openModal({title:'Outro',content:'',submit(){}});return false;}catch{return true;}}),true);
  await page.evaluate(()=>document.querySelector('#dialog form').dispatchEvent(new Event('submit',{cancelable:true})));
  assert.equal(await page.evaluate(()=>window.silentCalls),1);
  await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true);
  await page.evaluate(()=>window.silentFail(new Error('Falha sem animação')));
  await page.waitForFunction(()=>!document.querySelector('#dialog [type=submit]').disabled);
  assert.equal(await dialog.locator('[name=note]').inputValue(),'Preservar');
  assert.equal(await dialog.locator('[name=note]').isDisabled(),false);
  assert.equal(await dialog.locator('[name=fixed]').isDisabled(),true);
  await button.click();await page.evaluate(()=>window.silentComplete());await dialog.waitFor({state:'hidden'});
  // A confirmação de capacidade conserva o novo rótulo e não anuncia uma gravação.
  await page.evaluate(async()=>{const {openModal}=await import('/js/components/modal.js');const {setIdleButtonLabel}=await import('/js/components/actionButton.js');openModal({title:'Capacidade',content:'Conferir',submit:async(_,form)=>{setIdleButtonLabel(form.querySelector('[type=submit]'),'Registrar mesmo assim');return false;}});});
  await button.click();await page.waitForFunction(()=>!document.querySelector('#dialog [type=submit]').disabled);
  assert.equal(await button.innerText(),'Registrar mesmo assim');assert.equal(await dialog.isVisible(),true);await dialog.locator('.cancel').click();
  // O mesmo componente continua bloqueando a ação após substituição do botão pelo render.
  await page.evaluate(async()=>{
    const {runButtonAction,bindActionButtons}=await import('/js/components/actionButton.js');window.directCalls=0;
    const host=document.createElement('div');host.id='feedback-fixture';host.innerHTML='<button class="primary-button" data-action="export-test">Exportar planilha</button>';document.body.append(host);
    const task=()=>{window.directCalls++;return new Promise(resolve=>window.finishExport=resolve);};
    void runButtonAction(host.firstChild,task,{key:'export-test',loading:'Gerando planilha…',success:'Planilha pronta'});
    host.innerHTML='<button class="primary-button" data-action="export-test">Exportar planilha</button>';
    bindActionButtons(host,()=> 'export-test');void runButtonAction(host.firstChild,task,{key:'export-test'});
  });
  await page.waitForFunction(()=>window.directCalls===1);
  assert.equal(await page.locator('#feedback-fixture button').isDisabled(),true);
  await page.evaluate(()=>window.finishExport());await page.waitForFunction(()=>document.querySelector('#feedback-fixture button').dataset.buttonState==='success');
  await page.waitForFunction(()=>!document.querySelector('#feedback-fixture button').disabled);assert.equal(await page.locator('#feedback-fixture button').innerText(),'Exportar planilha');
  // Progresso mensurável permanece no valor recebido; timers não o fazem avançar.
  await page.evaluate(async()=>{const {createButtonAction}=await import('/js/components/actionButton.js');window.visualAction=createButtonAction(document.querySelector('#feedback-fixture button'));window.visualAction.step('1 de 4 arquivos',1,4);});
  const progress=page.locator('#feedback-fixture .action-track>span');assert.match(await progress.getAttribute('style'),/scaleX\(0.25\)/);
  await page.waitForTimeout(150);assert.match(await progress.getAttribute('style'),/scaleX\(0.25\)/);
  await page.evaluate(()=>window.visualAction.loading('Enviando foto…'));await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await progress.evaluate(el=>getComputedStyle(el).animationName),'none');
  for(const width of [320,375,430,768,1024,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow em ${width}`);}
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.visualAction.reset());
  await page.evaluate(async()=>{const {openModal}=await import('/js/components/modal.js');openModal({title:'Enviar foto',content:'<p>Foto vinculada à movimentação.</p>',submitLabel:'Enviar foto',submit:()=>new Promise(resolve=>window.finishPhoto=resolve)});});
  await button.click();await state('loading');await mkdir('tests/artifacts',{recursive:true});await page.screenshot({path:'tests/artifacts/feedback-mobile.png'});
  await page.evaluate(()=>window.finishPhoto());await dialog.waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);console.log('PASS feedback: loading, erro/retry, trava lógica, formulário preservado, sucesso visível, confirmação sem gravação, rerender, progresso real, reduced motion e seis larguras.');
}finally{await browser.close();}

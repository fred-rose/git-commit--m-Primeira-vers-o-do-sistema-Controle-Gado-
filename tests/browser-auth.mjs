import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base=process.env.TEST_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const context=await browser.newContext({serviceWorkers:'block'});
const page=await context.newPage(),errors=[],requests=[];
let loginCalls=0,googleRedirect;
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>requests.push(request.url()));
await context.route('**/js/config.js',route=>route.fulfill({contentType:'text/javascript',body:"export const config={supabaseUrl:'https://controle-gado-auth.invalid',supabaseAnonKey:'test-public-key'};"}));
await context.route('https://controle-gado-auth.invalid/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/auth/v1/authorize'){
    googleRedirect=url;
    return route.fulfill({status:302,headers:{location:`${base}/?error_description=access_denied`},body:''});
  }
  if(url.pathname==='/auth/v1/token'){
    loginCalls++;await new Promise(resolve=>setTimeout(resolve,300));
    return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'invalid_credentials',msg:'Invalid login credentials'})});
  }
  if(url.pathname==='/auth/v1/signup')return route.fulfill({contentType:'application/json',body:JSON.stringify({id:'10000000-0000-0000-0000-000000000001',email:'teste@example.invalid',identities:[]})});
  return route.fulfill({status:400,contentType:'application/json',body:'{}'});
});
try{
  await page.goto(base);await page.locator('#login-form').waitFor();
  await mkdir('tests/artifacts',{recursive:true});
  for(const width of [320,375,430,768,1024,1440]){
    await page.setViewportSize({width,height:width<768?812:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow em ${width}`);
    assert.equal(await page.locator('.auth-visual').isVisible(),width>768);
    for(const selector of ['#google-login','#auth-email','#auth-password','#signup','.auth-submit']){
      const box=await page.locator(selector).boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=width,`${selector} cortado em ${width}`);
    }
    await page.screenshot({path:`tests/artifacts/auth-${width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:375,height:667});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),'scroll desnecessário em 375 × 667');
  await page.locator('#google-login').focus();await page.keyboard.press('Tab');assert.equal(await page.locator('#auth-email').evaluate(el=>el===document.activeElement),true);
  await page.locator('#auth-email').fill('invalido');await page.locator('#auth-password').fill('senha-de-teste');await page.keyboard.press('Enter');assert.equal(loginCalls,0);
  await page.locator('#auth-email').fill('teste@example.invalid');
  await page.getByRole('button',{name:'Mostrar senha',exact:true}).click();assert.equal(await page.locator('#auth-password').getAttribute('type'),'text');
  await page.keyboard.press('Space');assert.equal(await page.locator('#auth-password').getAttribute('type'),'password');assert.equal(await page.locator('#auth-password').inputValue(),'senha-de-teste');
  await page.locator('#auth-password').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('.auth-submit').disabled);
  await page.waitForFunction(()=>document.querySelector('#auth-error').textContent.includes('Não foi possível entrar'));
  assert.equal(loginCalls,1);
  await page.locator('#signup').click();await page.waitForFunction(()=>document.querySelector('#auth-error').textContent.includes('Confira seu email'));
  await page.getByText('Esqueci minha senha',{exact:true}).click();await page.getByText('A recuperação de senha ainda não está disponível nesta versão.').waitFor();
  await page.locator('#google-login').click();await page.waitForURL('**/?error_description=access_denied');
  await page.waitForFunction(()=>document.querySelector('#auth-error')?.textContent.includes('O acesso com Google não foi concluído'));
  assert.equal(googleRedirect.searchParams.get('provider'),'google');assert.equal(googleRedirect.searchParams.get('redirect_to'),`${base}/`);
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('#google-login').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
  assert.ok(!requests.some(url=>/\.(webp|avif|jpg|woff2?|mp4)(\?|$)/i.test(url)),'login carregou decoração ou fonte externa');
  assert.deepEqual(errors,[]);
  console.log('PASS login: seis larguras, teclado/Enter, senha visível, erro de login, confirmação de cadastro, encaminhamento Google simulado, reduced-motion e ausência de imagens/fontes pesadas. Reset inexistente é informado, sem chamada Auth nova.');
}finally{await browser.close();}

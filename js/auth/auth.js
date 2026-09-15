import { getSupabase, cloudConfigured } from '../supabase/client.js';
import { offlineDB } from '../offline/db.js';
import { isOnline } from '../offline/connectivity.js';
import { createCloudRepository } from '../repositories/cloudRepository.js';
import { createButtonAction, nextPaint } from '../components/actionButton.js';
export async function authenticatedRepository() {
  if(!cloudConfigured())return null;
  document.body.classList.add('auth-pending');
  const client=await getSupabase();let user;
  if(!isOnline())user=(await offlineDB.get('kv','current-user'))?.value;
  else {const session=await client.auth.getSession();if(session.data.session){const verified=await client.auth.getUser();if(!verified.error)user=verified.data.user;}}
  if(!user)user=await loginScreen(client);
  await offlineDB.put('kv',{id:'current-user',value:{id:user.id,email:user.email}});
  const repository=await createCloudRepository(client,user);
  document.body.classList.remove('auth-pending');document.getElementById('auth-screen')?.remove();
  let restarting=false;
  client.auth.onAuthStateChange((event,session)=>{
    if(restarting||!(event==='SIGNED_OUT'||session?.user?.id&&session.user.id!==user.id))return;
    restarting=true;repository.dispose();document.body.classList.add('auth-pending');
    document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
    document.getElementById('page-content').replaceChildren();
    document.getElementById('assistant-log').replaceChildren();
    // Eventos vindos de outra aba também invalidam a conta/cache em exibição.
    // Não chamar métodos Auth de dentro do callback: ele ocorre sob a trava do SDK.
    offlineDB.remove('kv','current-user').then(()=>location.reload(),()=>location.reload());
  });
  return repository;
}
function loginScreen(client){
  return new Promise(resolve=>{
    const panel=document.createElement('section');panel.id='auth-screen';panel.className='auth-screen';
    panel.innerHTML=`<div class="auth-card">
      <div class="auth-main">
        <header class="auth-brand"><img src="assets/favicon.svg" alt="" width="44" height="44"><div><h1>Controle Gado</h1><span>GESTÃO DA FAZENDA</span></div></header>
        <div class="auth-intro"><h2>Entre na sua conta</h2><p>Seu rebanho e suas fazendas,<br class="auth-desktop-break"> sempre por perto.</p></div>
        <button type="button" id="google-login" class="primary-button auth-google"><span class="auth-google-mark"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.61 24.46c0-1.36-.12-2.66-.35-3.92H24v7.42h11a9.4 9.4 0 0 1-4.08 6.18v5.14h6.62c3.87-3.56 6.07-8.8 6.07-14.82Z"/><path fill="#34A853" d="M24 44c5.4 0 9.93-1.79 13.24-4.85l-6.62-5.14c-1.83 1.23-4.17 1.98-6.62 1.98-5.2 0-9.61-3.51-11.19-8.24H5.98v5.3A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.81 27.75a12 12 0 0 1 0-7.5v-5.3H5.98a20 20 0 0 0 0 18.1Z"/><path fill="#EA4335" d="M24 12.01c2.94 0 5.58 1.01 7.66 3L37.4 9.3A19.2 19.2 0 0 0 24 4 20 20 0 0 0 5.98 14.95l6.83 5.3C14.39 15.52 18.8 12.01 24 12.01Z"/></svg></span>Continuar com Google</button>
        <div class="auth-divider"><span>ou</span></div>
        <form id="login-form">
          <label class="auth-field" for="auth-email"><span>Email</span><input id="auth-email" name="email" type="email" required autocomplete="username" placeholder="voce@exemplo.com" inputmode="email" autocapitalize="none" spellcheck="false"></label>
          <div class="auth-field"><label for="auth-password">Senha</label><div class="auth-password"><input id="auth-password" name="password" type="password" required minlength="8" autocomplete="current-password" placeholder="Sua senha"><button id="toggle-password" type="button" aria-label="Mostrar senha" aria-pressed="false" aria-controls="auth-password"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="auth-eye-slash" d="m3 3 18 18"/></svg></button></div></div>
          <details class="auth-recovery"><summary>Esqueci minha senha</summary><p>A recuperação de senha ainda não está disponível nesta versão.</p></details>
          <button class="primary-button auth-submit" type="submit"><span>Entrar</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg></button>
          <p class="auth-signup">Ainda não tem uma conta? <button class="text-button" type="button" id="signup">Criar conta</button></p>
        </form>
        <p id="auth-error" role="alert" aria-live="polite"></p>
        <footer class="auth-footnote">Simples no campo. Organizado em cada detalhe.</footer>
      </div>
      <aside class="auth-visual" aria-label="Conheça o Controle Gado">
        <div class="auth-visual-copy"><span class="auth-eyebrow">MAIS PERTO DA SUA FAZENDA</span><h2>Bem-vindo<br>de volta!</h2><p>Do dia a dia no campo às decisões de amanhã.<br> Uma visão clara do que importa.</p>
        <ul class="auth-benefits"><li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 4v16h16M8 14l4-4 4 2 5-7"/></svg>Acompanhe o desempenho</li><li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m5 9-3-4v7l4 3m13-6 3-4v7l-4 3M7 5 5 2m12 3 2-3M6 8c0-5 12-5 12 0v8c0 7-12 7-12 0ZM7 16h10M9 11h.1M15 11h.1"/></svg>Controle seu rebanho</li><li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 20V10m7 10V4m7 16v-7"/></svg>Tome decisões com mais dados</li></ul></div>
        <svg class="auth-landscape" viewBox="0 0 600 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><circle cx="460" cy="68" r="40" fill="#bec9a2" opacity=".22"/><path d="M0 144Q125 20 290 137T600 107V300H0Z" fill="#345b42"/><path d="M0 170Q170 77 358 187T600 161V300H0Z" fill="#426b4e"/><path d="M0 238Q216 120 600 224V300H0Z" fill="#244c36"/><g fill="none" stroke="#b0be94" stroke-width="1" opacity=".28"><path d="M-20 274Q245 136 625 262M-20 298Q255 161 625 284M85 315Q293 190 625 307"/></g><g stroke="#a2b28e" stroke-width="3" fill="none" opacity=".65"><path d="m40 210 124-29M40 223l124-29M49 200v35m37-44v35m37-43v35m36-43v35"/></g></svg>
        <span class="auth-visual-footer">CUIDAR DO CAMPO É OLHAR PARA O FUTURO.</span>
      </aside>
    </div>`;
    document.body.append(panel);const message=text=>{panel.querySelector('#auth-error').textContent=text;};
    panel.querySelector('#toggle-password').onclick=()=>{
      const input=panel.querySelector('#auth-password'),button=panel.querySelector('#toggle-password');
      const visible=input.type==='password';input.type=visible?'text':'password';
      button.setAttribute('aria-label',visible?'Ocultar senha':'Mostrar senha');button.setAttribute('aria-pressed',String(visible));
    };
    let submitting=false;
    const attempt=async(signup=false)=>{
      if(submitting)return;
      const form=panel.querySelector('form');if(!form.reportValidity())return;
      submitting=true;
      const action=createButtonAction(panel.querySelector(signup?'#signup':'.auth-submit'));
      const values=Object.fromEntries(new FormData(form)),buttons=panel.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
      action.loading(signup?'Criando conta…':'Entrando…');form.setAttribute('aria-busy','true');
      try{
        await nextPaint();
        const result=signup?await client.auth.signUp({...values,options:{emailRedirectTo:location.origin+location.pathname}}):await client.auth.signInWithPassword(values);
        if(result.error){message(signup?'Não foi possível criar a conta. Confira o email e use uma senha com pelo menos 8 caracteres.':'Não foi possível entrar. Confira email, senha e confirmação do email.');await action.finish('error',signup?'Erro ao criar':'Erro ao entrar');return;}
        if(!result.data.session){message('Confira seu email para confirmar a conta e depois entre.');await action.finish('success','Confira seu email');return;}
        await action.finish('success',signup?'Conta criada':'Login concluído');
        resolve(result.data.user);
      }catch{message('Não foi possível conectar. Confira sua internet.');await action.finish('error','Falha na conexão');}finally{action.reset();submitting=false;form.removeAttribute('aria-busy');buttons.forEach(b=>b.disabled=false);}
    };
    panel.querySelector('form').onsubmit=e=>{e.preventDefault();attempt();};panel.querySelector('#signup').onclick=()=>attempt(true);
    panel.querySelector('#google-login').onclick=async()=>{
      if(submitting)return;submitting=true;
      const action=createButtonAction(panel.querySelector('#google-login')),buttons=panel.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
      const release=()=>{action.reset();submitting=false;buttons.forEach(b=>b.disabled=false);};
      window.addEventListener('pagehide',release,{once:true});
      action.loading('Abrindo Google…');
      try{
        await nextPaint();const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});
        if(error){message('Não foi possível iniciar o acesso com Google. Confira a configuração do provedor.');await action.finish('error','Google indisponível');}
      }catch{message('Não foi possível iniciar o acesso com Google. Confira sua conexão.');await action.finish('error','Falha na conexão');}
      finally{release();window.removeEventListener('pagehide',release);}
    };
    if(new URL(location.href).searchParams.has('error_description'))message('O acesso com Google não foi concluído. Tente novamente.');
  });
}
export async function logout(repository){
  if(repository.manager.running)throw new Error('Aguarde a sincronização terminar antes de sair.');
  repository.dispose();await offlineDB.remove('kv','current-user');await repository.client.auth.signOut({scope:'local'});location.reload();
}

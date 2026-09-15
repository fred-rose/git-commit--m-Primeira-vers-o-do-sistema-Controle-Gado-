// Estados de apresentação. Não cria requests, retries nem percentuais por timer.
const nodes=new WeakMap(),active=new Map();
const labels={loading:'Salvando…',progress:'Processando…',syncing:'Sincronizando…',success:'Salvo',error:'Não foi possível',offline:'Salvo offline'};
const busyStates=new Set(['loading','progress','syncing']);
export const nextPaint=()=>new Promise(resolve=>{
  // Permite pintar antes de trabalho síncrono, sem travar uma aba em segundo plano.
  let frame;const done=()=>{clearTimeout(fallback);cancelAnimationFrame(frame);resolve();};
  const fallback=setTimeout(done,100);frame=requestAnimationFrame(()=>setTimeout(done,0));
});

function announce(text){
  let region=document.getElementById('action-status');
  if(!region){region=document.createElement('div');region.id='action-status';region.className='action-sr-only';region.setAttribute('role','status');region.setAttribute('aria-live','polite');document.body.append(region);}
  region.textContent=text;
}
function capture(button){
  return {html:button.innerHTML,disabled:button.disabled,label:button.getAttribute('aria-label'),busy:button.getAttribute('aria-busy')};
}
function restore(button,saved){
  button.innerHTML=saved.html;button.disabled=saved.disabled;
  for(const [attr,value] of [['aria-label',saved.label],['aria-busy',saved.busy]])if(value===null)button.removeAttribute(attr);else button.setAttribute(attr,value);
  button.classList.remove('action-button');delete button.dataset.buttonState;nodes.delete(button);
}
export function setIdleButtonLabel(button,label){
  const action=nodes.get(button);
  if(action){const span=document.createElement('span');span.textContent=label;action.saved.get(button).html=span.innerHTML;}
  else button.textContent=label;
}
export function createButtonAction(button,{key}={}){
  if(key&&active.has(key)){const action=active.get(key);action.attach(button);return action;}
  if(nodes.has(button))return nodes.get(button);
  let state='idle',label='',progress=null,timer,resolveTimer,finished=false;
  const saved=new Map();
  function paint(node){
    if(!node.isConnected)return;
    const original=document.createElement('span');original.className='action-original';original.innerHTML=saved.get(node).html;original.setAttribute('aria-hidden','true');
    const text=document.createElement('span');text.className='action-label';text.textContent=`${state==='success'||state==='offline'?'✓ ':state==='error'?'! ':''}${label}`;
    const track=document.createElement('span');track.className='action-track';track.setAttribute('aria-hidden','true');
    const bar=document.createElement('span');track.append(bar);
    if(progress!==null){bar.style.transform=`scaleX(${progress})`;track.dataset.determinate='true';}
    node.replaceChildren(original,text,track);node.classList.add('action-button');node.dataset.buttonState=state;
    node.disabled=true;node.setAttribute('aria-busy',String(busyStates.has(state)));node.setAttribute('aria-label',text.textContent);
  }
  const action={
    saved,get state(){return state;},get busy(){return !finished;},
    attach(node){if(!saved.has(node)){saved.set(node,capture(node));nodes.set(node,action);}if(state!=='idle')paint(node);return action;},
    set(next,options={}){
      if(finished)return action;
      state=next;label=options.label||labels[next]||'';progress=null;
      if(next==='progress'&&Number.isFinite(options.completed)&&Number.isFinite(options.total)&&options.total>0)progress=Math.max(0,Math.min(1,options.completed/options.total));
      for(const node of saved.keys()){if(node.isConnected)paint(node);else{saved.delete(node);nodes.delete(node);}}
      announce(label);return action;
    },
    loading:label=>action.set('loading',{label}),
    step:(label,completed,total)=>action.set('progress',{label,completed,total}),
    syncing:label=>action.set('syncing',{label}),
    async finish(next='success',text=labels[next],duration=1000){
      action.set(next,{label:text});
      await new Promise(resolve=>{resolveTimer=resolve;timer=setTimeout(resolve,duration);});
      action.reset();
    },
    reset(){
      if(finished)return;finished=true;clearTimeout(timer);resolveTimer?.();
      for(const [node,original]of saved)restore(node,original);
      saved.clear();if(key&&active.get(key)===action)active.delete(key);
    },
  };
  action.attach(button);if(key)active.set(key,action);return action;
}
export function bindActionButtons(root,keyFor){
  for(const button of root.querySelectorAll('button[data-action]')){const key=keyFor(button);if(key&&active.has(key))active.get(key).attach(button);}
}
export function isActionRunning(button,key){return Boolean(nodes.get(button)?.busy||(key&&active.has(key)));}
export async function runButtonAction(button,task,{key,loading='Processando…',success='Concluído',error='Não foi possível',state='loading',outcome}={}){
  if(isActionRunning(button,key))return;
  const action=createButtonAction(button,{key});action.set(state,{label:loading});
  try{
    await nextPaint();const result=await task(action);
    const end=outcome?await outcome(result):null;
    await action.finish(end?.state||'success',end?.label||success);
    return result;
  }catch(e){await action.finish('error',error);throw e;}
}

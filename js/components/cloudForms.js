import { openModal } from './modal.js';
import { inputField,selectField,textareaField } from './ui.js';
import { today,escapeHtml as h,toCents } from '../utils.js';
import { prepareImage } from './forms.js';
import { capacityConfigurations,capacityPeriod,capacityPeriodLabel,previewCapacity } from '../capacity/capacityService.js';
import { validateQuickMovement } from '../services/quickMovement.js';
import { setIdleButtonLabel } from './actionButton.js';
import { syncOutcome } from './syncFeedback.js';
export function farmForm(repository){
  const id=crypto.randomUUID();
  openModal({title:'Nova fazenda',content:`${inputField('name','Nome da fazenda','','text','required maxlength="100" placeholder="Ex.: Fazenda Santa Rosa"')}${selectField('mode','Como deseja controlar o rebanho?',[{id:'farm',name:'Fazenda inteira — sem divisão por pastos'},{id:'pasture',name:'Por pastos — localização dentro da propriedade'}],'farm')}${inputField('openingDate','Início do controle',today(),'date',`required max="${today()}"`)}<p class="form-hint">A fazenda começará vazia. Registre o inventário conferido ou migre os dados da versão local.</p>`,submit:values=>repository.createFarm({...Object.fromEntries(values),id})});
}
export function quickButtons(category,pastureId=''){
  const id=JSON.stringify({category,pastureId});
  return `<span class="quick-buttons"><button type="button" aria-label="Retirar ${h(category)}" data-action="quick-minus" data-id="${h(id)}">−</button><button type="button" aria-label="Adicionar ${h(category)}" data-action="quick-plus" data-id="${h(id)}">+</button></span>`;
}
export function quickForm(repository,id,direction){
  const data=repository.getData();if(!data.farm||data.readOnly)throw new Error('Selecione uma fazenda para registrar uma movimentação.');
  const {category,pastureId=''}=JSON.parse(id);
  const reasons=direction>0?['Entrada','Compra',...(['Bezerras','Bezerros'].includes(category)?['Nascimento']:[]),'Ajuste de contagem','Outro']:['Saída','Venda','Morte','Ajuste de contagem','Outro'];
  const owners=data.owners,selectedOwner=owners.length===1?owners[0].id:'',pastures=data.pastures.filter(p=>!p.archived);
  openModal({title:`${direction>0?'Adicionar':'Retirar'} ${category.toLowerCase()}`,submitLabel:`Confirmar ${direction>0?'+':'−'}1`,successMessage:'Movimentação registrada. Acompanhe a sincronização no indicador.',
    content:`<div class="quick-quantity"><button type="button" data-step="-1" aria-label="Diminuir quantidade">−</button>${inputField('quantity','Quantidade',1,'number','required min="1" max="2147483647" step="1" inputmode="numeric"')}<button type="button" data-step="1" aria-label="Aumentar quantidade">+</button></div>${selectField('type','Motivo',reasons,reasons[0])}${data.farm.controlMode==='pasture'?(pastureId?`<input type="hidden" name="pastureId" value="${h(pastureId)}"><p>${h(pastures.find(p=>p.id===pastureId)?.name||'Pasto')}</p>`:selectField('pastureId','Pasto',pastures,pastures.length===1?pastures[0].id:'','Selecione')):''}${owners.length?selectField('ownerId','Proprietário (opcional)',owners,selectedOwner,'Não informado',false):''}<div id="quick-value" hidden>${inputField('value','Valor total (opcional)','','text','inputmode="decimal"')}<p class="form-hint">Sem valor, ficará uma pendência para completar depois.</p></div>${textareaField('note','Descrição (opcional)','')}<label class="form-group"><span>Foto (opcional)</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></label><div id="capacity-confirm" hidden class="notice"></div>`,
    setup(form){
      form.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{form.elements.quantity.value=Math.max(1,Number(form.elements.quantity.value)+Number(b.dataset.step));form.dispatchEvent(new Event('change'));});
      form.addEventListener('change',()=>{form.querySelector('#quick-value').hidden=!['Compra','Venda'].includes(form.elements.type.value);form.querySelector('#capacity-confirm').hidden=true;form.dataset.capacityApproved='';setIdleButtonLabel(form.querySelector('[type="submit"]'),`Confirmar ${direction>0?'+':'−'}${form.elements.quantity.value}`);});
    },
    async submit(values,form,action){
      const input={...Object.fromEntries(values),category,direction,date:today(),quantity:Number(values.get('quantity')),valueCents:['Compra','Venda'].includes(values.get('type'))?toCents(values.get('value')):0};
      if(input.type==='Outro'){input.type=direction>0?'Entrada':'Saída';input.note=`Outro motivo. ${input.note||''}`;}
      input.pastureId=input.pastureId||'';input.ownerId=input.ownerId||'';validateQuickMovement(repository.getData(),input);
      const warnings=previewCapacity(repository.getData(),input);
      if(warnings.length&&!form.dataset.capacityApproved){
        const notice=form.querySelector('#capacity-confirm');notice.hidden=false;
        notice.innerHTML=warnings.map(w=>`<p><strong>${h(w.name)}: capacidade excedida</strong><br>Atual: ${w.heads} · Após registro: ${w.after}<br>Capacidade: ${w.maxHeads} · Excesso: ${w.excess}</p>`).join('');
        form.dataset.capacityApproved='true';setIdleButtonLabel(form.querySelector('[type="submit"]'),'Registrar mesmo assim');return false;
      }
      const offline=!repository.getData().online;
      action.loading(offline?'Salvando no dispositivo…':'Salvando…');
      const file=values.get('photo');let blob;if(file?.size){action.step(offline?'Salvando foto no dispositivo…':'Preparando foto…');blob=await (await fetch(await prepareImage(file))).blob();}
      const record=await repository.quickMovement(input,blob);
      if(offline){action.outcome={state:'offline',label:blob?'Foto e registro salvos offline':'Salvo offline'};}
      else{
        action.outcome={state:'offline',label:'Salvo no dispositivo'};
        action.syncing();
        try{await repository.manager.run();const outcome=await syncOutcome(repository,record.localId);action.outcome=outcome.state==='success'?{state:'success',label:'Rebanho atualizado'}:outcome;}
        catch{/* A outbox já confirmou a gravação local. Revisão fica na Central de Alertas. */}
      }
    },
  });
}
export function capacityForm(repository,id){
  const data=repository.getData();if(!data.farm)throw new Error('Selecione uma fazenda.');
  const current=id?capacityConfigurations(data.capacityRules).find(r=>r.id===id):null;if(id&&!current)throw new Error('Capacidade não encontrada.');
  const period=current?`${current.year}-${String(current.month).padStart(2,'0')}`:today().slice(0,7),pastureId=current?.pastureId||'';
  const periodFields=`${inputField('period','Mês inicial',period,'month','required')}${inputField('months','Período',current?.months??1,'number','required min="1" step="1" inputmode="numeric" aria-describedby="capacity-period-label"')}<p class="form-hint" id="capacity-period-label">${capacityPeriodLabel(current?.months??1)}</p>${data.farm.controlMode==='pasture'?selectField('pastureId','Local',data.pastures.filter(p=>!p.archived||p.id===pastureId),pastureId,'Fazenda inteira',false):''}`;
  openModal({title:current?'Editar capacidade':'Capacidade mensal',content:`${periodFields}${inputField('maxHeads','Capacidade em cabeças',current?.maxHeads||'','number','required min="1" max="2147483647" step="1"')}${inputField('warningPercentage','Avisar a partir de (%)',current?.warningPercentage??90,'number','required min="1" max="100" step="1"')}${selectField('active','Situação',[{id:'true',name:'Ativa'},{id:'false',name:'Desativada'}],String(current?.active??true))}<p class="form-hint">A capacidade será aplicada a cada mês do período.</p>`,setup:form=>{const refresh=()=>{const value=Number(form.elements.months.value);form.querySelector('#capacity-period-label').textContent=Number.isInteger(value)&&value>=1?capacityPeriodLabel(value):'Informe um número inteiro a partir de 1.';};form.elements.months.addEventListener('input',refresh);refresh();},submit:values=>{const [year,month]=values.get('period').split('-').map(Number),months=capacityPeriod(values.get('months'));return repository.saveCapacity({...(current?{id:current.id}:{}),year,month,months,pastureId:values.get('pastureId')||'',maxHeads:Number(values.get('maxHeads')),warningPercentage:Number(values.get('warningPercentage')),active:values.get('active')==='true'});}});
}
export function settingsForm(repository){
  const f=repository.getData().farm;if(!f)throw new Error('Selecione uma fazenda.');
  openModal({title:'Configurações da fazenda',content:`${inputField('name','Nome',f.name,'text','required maxlength="100"')}${textareaField('description','Descrição',f.description)}${selectField('capacityEnabled','Controle de capacidade',[{id:'true',name:'Ativado'},{id:'false',name:'Desativado'}],String(f.capacityEnabled))}`,submit:v=>repository.saveSettings({name:v.get('name'),description:v.get('description'),capacityEnabled:v.get('capacityEnabled')==='true'})});
}

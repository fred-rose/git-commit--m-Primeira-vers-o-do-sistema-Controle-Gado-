import { openModal } from './modal.js';
import { inputField,selectField,textareaField,dateField,options } from './ui.js';
import { CATEGORIES,MOVEMENT_TYPES } from '../constants.js';
import { today,toCents,escapeHtml as h } from '../utils.js';
import { stockAt } from '../services/evolution.js';
import { capacitySummary } from '../capacity/capacityService.js';
import { setIdleButtonLabel } from './actionButton.js';
export function movementForm(repository,id){
  const data=repository.getData();
  if(!data.farm||data.readOnly)throw new Error('Selecione uma fazenda para registrar.');
  const existing=data.movements.find(m=>m.id===id);
  if(existing?.pending)throw new Error('Sincronize esta movimentação antes de editar.');
  const m=existing||{type:'Entrada',category:'Vacas',quantity:1,date:today(),direction:1};
  const pasture=data.farm.controlMode==='pasture',types=[...MOVEMENT_TYPES,'Ajuste de contagem'].filter(t=>pasture||t!=='Transferência de pasto');
  openModal({title:id?'Editar movimentação':'Nova movimentação',content:`<div class="form-grid">${selectField('type','O que aconteceu?',types,m.type)}${dateField(m.date,data.openingDate)}${selectField('category','Categoria',CATEGORIES,m.category)}${inputField('quantity','Quantidade',m.quantity,'number','required min="1" step="1" max="2147483647" inputmode="numeric"')}${data.owners.length?selectField('ownerId','Proprietário (opcional)',data.owners,m.ownerId,'Não informado',false):''}${pasture?selectField('pastureId','Pasto / origem',data.pastures.filter(p=>!p.archived),m.pastureId,'Selecione',false):''}<div id="destination-field">${selectField('destinationId','Pasto de destino',data.pastures.filter(p=>!p.archived),m.destinationId,'Selecione')}</div><div id="direction-field">${selectField('direction','Ajuste',[{id:'1',name:'Adicionar ao estoque'},{id:'-1',name:'Retirar do estoque'}],String(m.direction))}</div><div id="value-field">${inputField('value','Valor total (opcional)',m.valueCents?(m.valueCents/100).toFixed(2):'','text','inputmode="decimal"')}<p class="form-hint">Sem valor, compra ou venda ficará pendente para completar depois.</p></div>${textareaField('note','Observação',m.note)}<div id="capacity-confirm" class="notice full-width" hidden></div></div>`,
  setup(form){
    const refresh=()=>{
      const type=form.elements.type.value,transfer=type==='Transferência de pasto';
      for(const [name,visible] of [['destination',transfer],['direction',type==='Ajuste de contagem'],['value',['Compra','Venda'].includes(type)]]){form.querySelector(`#${name}-field`).hidden=!visible;form.elements[name==='destination'?'destinationId':name].disabled=!visible;}
      if(pasture){form.elements.pastureId.required=!transfer;form.elements.pastureId.options[0].textContent=transfer?'Estoque geral (aguardando distribuição)':'Selecione';}
      const categories=type==='Nascimento'?['Bezerras','Bezerros']:CATEGORIES;if(form.elements.category.options.length!==categories.length)form.elements.category.innerHTML=options(categories,categories.includes(form.elements.category.value)?form.elements.category.value:categories[0]);
      form.dataset.capacityApproved='';form.querySelector('#capacity-confirm').hidden=true;setIdleButtonLabel(form.querySelector('[type="submit"]'),'Salvar');
    };form.addEventListener('change',refresh);refresh();
  },
  async submit(values,form){
    const input=Object.fromEntries(values);input.quantity=Number(input.quantity);input.direction=Number(input.direction||1);input.valueCents=['Compra','Venda'].includes(input.type)?toCents(input.value):0;input.pastureId=input.pastureId||'';input.ownerId=input.ownerId||'';
    const current=repository.getData(),candidate={...current,movements:[...current.movements.filter(x=>x.id!==id),{...input,farmId:current.farm.id,id:id||'preview',sequence:existing?.sequence||Number.MAX_SAFE_INTEGER}]};
    const before=capacitySummary(current),after=capacitySummary(candidate,today(),stockAt(candidate,today()));
    const warnings=after.filter(a=>a.heads>a.maxHeads&&a.heads>(before.find(b=>b.id===a.id)?.heads||0));
    if(warnings.length&&!form.dataset.capacityApproved){const notice=form.querySelector('#capacity-confirm');notice.hidden=false;notice.innerHTML=warnings.map(a=>`<p><strong>${h(a.name)}: capacidade excedida</strong><br>Atual: ${before.find(b=>b.id===a.id)?.heads||0} · Após registro: ${a.heads}<br>Capacidade: ${a.maxHeads} · Excesso: ${a.heads-a.maxHeads}</p>`).join('');form.dataset.capacityApproved='true';setIdleButtonLabel(form.querySelector('[type="submit"]'),'Registrar mesmo assim');return false;}
    return id?repository.updateMovement(id,input):repository.addMovement(input);
  }});
}

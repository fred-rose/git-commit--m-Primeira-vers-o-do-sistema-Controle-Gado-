import { CATEGORIES, MOVEMENT_TYPES } from '../constants.js';
import { validDate, getStock } from '../domain.js';
import { today } from '../utils.js';
export function validateQuickMovement(data,m){
  if(!data.farm||data.readOnly)throw new Error('Selecione uma fazenda que você possa alterar.');
  if(![...MOVEMENT_TYPES,'Ajuste de contagem'].includes(m.type)||!CATEGORIES.includes(m.category))throw new Error('Selecione motivo e categoria válidos.');
  if(!Number.isSafeInteger(m.quantity)||m.quantity<1||m.quantity>2147483647)throw new Error('Informe uma quantidade inteira maior que zero.');
  if(![-1,1].includes(m.direction))throw new Error('Direção de ajuste inválida.');
  if(!Number.isSafeInteger(m.valueCents)||m.valueCents<0)throw new Error('Valor financeiro inválido.');
  if(!validDate(m.date)||m.date>today()||m.date<data.openingDate)throw new Error('Informe uma data válida.');
  if(m.note.length>2000)throw new Error('Use uma descrição de até 2000 caracteres.');
  if(m.type==='Nascimento'&&!['Bezerras','Bezerros'].includes(m.category))throw new Error('Nascimento deve usar Bezerras ou Bezerros.');
  if(m.ownerId&&!data.owners.some(o=>o.id===m.ownerId))throw new Error('Proprietário inválido.');
  if(data.farm.controlMode==='farm'&&(m.pastureId||m.destinationId||m.type==='Transferência de pasto'))throw new Error('Use o estoque geral desta fazenda.');
  if(data.farm.controlMode==='pasture'&&!data.pastures.some(p=>p.id===m.pastureId&&!p.archived))throw new Error('Selecione um pasto ativo.');
  if(['Venda','Saída','Morte'].includes(m.type)||(m.type==='Ajuste de contagem'&&m.direction<0)){
    const available=getStock(data).filter(l=>l.category===m.category&&(l.ownerId||'')===(m.ownerId||'')&&(l.pastureId||'')===(m.pastureId||'')).reduce((s,l)=>s+l.quantity,0);
    if(m.quantity>available)throw new Error(`Saldo insuficiente: ${available} animais disponíveis neste grupo.`);
  }
  return m;
}

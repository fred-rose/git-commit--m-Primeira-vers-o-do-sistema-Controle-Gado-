import { CATEGORIES, IN_TYPES, OUT_TYPES } from '../constants.js';
import { getFinances, financialTotals, validDate } from '../domain.js';
import { today } from '../utils.js';
export function periodRange(period='30', asOf=today()) {
  const end = new Date(`${asOf}T12:00:00Z`), start = new Date(end);
  if (period==='year') start.setUTCMonth(0,1);
  else if (period==='180' || period==='365') start.setUTCMonth(start.getUTCMonth()-(period==='180'?6:12));
  else start.setUTCDate(start.getUTCDate()-(Number(period)||30)+1);
  return { from:start.toISOString().slice(0,10),to:asOf };
}
export function stockAt(data, date, { before = false } = {}) {
  const lots = new Map(), key = l => JSON.stringify([l.farmId || '',l.pastureId || '',l.ownerId || '',l.category]);
  const change = (l,q) => { const k=key(l), old=lots.get(k) || {...l,quantity:0}; lots.set(k,{...old,quantity:old.quantity+q}); };
  const eligible = d => before ? d<date : d<=date;
  for (const l of data.openingStock) {
    const opening = data.farms?.find(f => f.id===l.farmId)?.openingDate || data.openingDate;
    if (eligible(opening)) change(l,l.quantity);
  }
  const events = [...data.movements.map(m => ({...m,kind:'movement'})),...(data.modeChanges || []).map(m => ({...m,kind:'mode'}))].filter(m => eligible(m.date)).sort((a,b)=>a.date.localeCompare(b.date)||a.sequence-b.sequence);
  for (const m of events) {
    if (m.kind==='mode') {
      if (m.mode==='farm') for (const [k,l] of [...lots]) if(l.farmId===m.farmId && l.pastureId) { lots.delete(k); change({...l,pastureId:''},l.quantity); }
    } else {
      const delta=OUT_TYPES.includes(m.type)||m.type==='Transferência de pasto'?-m.quantity:IN_TYPES.includes(m.type)?m.quantity:m.type==='Ajuste de contagem'?m.quantity*m.direction:0;
      change(m,delta);
      if(m.type==='Transferência de pasto') change({...m,pastureId:m.destinationId},m.quantity);
    }
  }
  return [...lots.values()].filter(l=>l.quantity>0);
}
export function evolution(data, { from, to=today(), pastureId='' }) {
  if(!validDate(from)||!validDate(to)||from>to||to>today()) throw new Error('Selecione um período válido, até hoje.');
  const select = lots => lots.filter(l=>!pastureId||l.pastureId===pastureId), sum=lots=>lots.reduce((s,l)=>s+l.quantity,0);
  const initial=select(stockAt(data,from,{before:true})),final=select(stockAt(data,to));
  const start=sum(initial),end=sum(final),movements=data.movements.filter(m=>m.date>=from&&m.date<=to&&(!pastureId||m.pastureId===pastureId||m.destinationId===pastureId));
  const days=Math.round((Date.parse(to)-Date.parse(from))/86400000),step=Math.max(1,Math.ceil(days/60)),points=[];
  for(let n=0;n<=days;n+=step){const date=new Date(Date.parse(from)+n*86400000).toISOString().slice(0,10);points.push({date,quantity:sum(select(stockAt(data,date)))});}
  if(points.at(-1)?.date!==to) points.push({date:to,quantity:end});
  return {start,end,change:end-start,percentage:start?(end-start)/start*100:null,points,
    categories:CATEGORIES.map(name=>({name,start:sum(initial.filter(l=>l.category===name)),end:sum(final.filter(l=>l.category===name))})),
    movements:['Compra','Venda','Nascimento','Morte'].map(type=>({type,quantity:sum(movements.filter(m=>m.type===type))})),
    financial:financialTotals(getFinances(data).filter(f=>f.date>=from&&f.date<=to&&(!pastureId||f.pastureId===pastureId))),
    farms:(data.farms||[]).map(f=>{const a=sum(initial.filter(l=>l.farmId===f.id)),b=sum(final.filter(l=>l.farmId===f.id));return {id:f.id,name:f.name,start:a,end:b,change:b-a,percentage:a?(b-a)/a*100:null};}),
    partial:(data.farms||[{openingDate:data.openingDate}]).some(f=>f.openingDate>from),
  };
}

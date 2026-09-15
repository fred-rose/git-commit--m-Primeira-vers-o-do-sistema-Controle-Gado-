import { evolution,periodRange,stockAt } from '../services/evolution.js';
import { capacitySummary } from '../capacity/capacityService.js';
import { pageHeading,table,financeCards,selectField,inputField } from '../components/ui.js';
import { escapeHtml as h,number,formatDate,today } from '../utils.js';
export function render(data,filters={}){
  const period=filters.period||'30',range=period==='custom'?{from:filters.from||data.openingDate,to:filters.to||today()}:periodRange(period);
  let result;try{result=evolution(data,{...range,pastureId:filters.pastureId});}catch(error){return `<div class="notice">${h(error.message)} <a href="#evolucao">Limpar período</a></div>`;}
  const max=Math.max(1,...result.points.map(p=>p.quantity)),coords=result.points.map((p,i)=>`${20+i/Math.max(1,result.points.length-1)*760},${180-p.quantity/max*150}`).join(' ');
  const rules=capacitySummary(data,range.to,stockAt(data,range.to));
  const monthly=[];const cursor=new Date(`${range.from.slice(0,7)}-01T12:00:00Z`);
  while(cursor.toISOString().slice(0,10)<=range.to&&monthly.length<120){const end=new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,0)).toISOString().slice(0,10),date=end<range.to?end:range.to;for(const r of capacitySummary(data,date,stockAt(data,date)))monthly.push([h(r.name),formatDate(date),`${number(r.heads)} / ${number(r.maxHeads)}`,`${Math.round(r.percentage)}%`]);cursor.setUTCMonth(cursor.getUTCMonth()+1);}
  return `${pageHeading('Evolução','Rebanho e contas reconstruídos a partir do inventário inicial e do histórico.')}
  <details class="filter-disclosure" open><summary>Selecionar período</summary><form class="filters" id="filters-form">${selectField('period','Período',[{id:'30',name:'30 dias'},{id:'90',name:'90 dias'},{id:'180',name:'6 meses'},{id:'365',name:'1 ano'},{id:'year',name:'Ano atual'},{id:'custom',name:'Personalizado'}],period)}${inputField('from','De',range.from,'date',`max="${today()}"`)}${inputField('to','Até',range.to,'date',`max="${today()}"`)}${data.farm?.controlMode==='pasture'?selectField('pastureId','Pasto',data.pastures,filters.pastureId,'Todos os pastos',false):''}<button class="primary-button">Aplicar</button></form></details>
  ${result.partial?'<p class="notice">O período começa antes do inventário conhecido de uma ou mais fazendas. Não há contagem anterior disponível; a variação pode incluir o cadastro do inventário inicial.</p>':''}
  <div class="category-strip">${[['Início do período',result.start],['Final do período',result.end],['Variação',result.change],['Crescimento',result.percentage===null?'Sem base inicial':`${result.percentage.toFixed(1)}%`]].map(([k,v])=>`<div><span>${h(k)}</span><strong>${h(v)}</strong></div>`).join('')}</div>
  <section class="panel"><h3>Rebanho no período</h3><svg class="evolution-chart" viewBox="0 0 800 210" role="img" aria-label="Evolução de ${result.start} para ${result.end} cabeças"><line x1="20" y1="180" x2="780" y2="180" stroke="#d9dfd7"/><polyline fill="none" stroke="#285d40" stroke-width="3" points="${coords}"/><text x="20" y="205">${formatDate(range.from)}</text><text x="780" y="205" text-anchor="end">${formatDate(range.to)}</text></svg><details><summary>Ver valores do gráfico</summary>${table(['Data','Cabeças'],result.points.map(p=>[formatDate(p.date),number(p.quantity)]))}</details></section>
  <section class="panel">${table(['Categoria','Início','Final','Variação'],result.categories.map(c=>[h(c.name),number(c.start),number(c.end),number(c.end-c.start)]))}</section>
  <div class="category-strip">${result.movements.map(m=>`<div><span>${m.type}</span><strong>${number(m.quantity)}</strong></div>`).join('')}</div>
  ${financeCards(result.financial)}${filters.pastureId?'<p class="page-footnote">Financeiro por pasto inclui apenas compras e vendas vinculadas a esse pasto. Contas independentes são da fazenda.</p>':''}
  ${result.farms.length>1?`<section class="panel"><h3>Comparação entre fazendas</h3>${table(['Fazenda','Início','Final','Variação','Crescimento'],result.farms.map(f=>[h(f.name),number(f.start),number(f.end),number(f.change),f.percentage===null?'Sem base':`${f.percentage.toFixed(1)}%`]))}</section>`:''}
  ${monthly.length?`<section class="panel"><h3>Capacidade no fechamento de cada mês</h3>${table(['Local','Data','Cabeças / capacidade','Uso'],monthly)}</section>`:''}`;
}
export function setup(){const form=document.getElementById('filters-form');if(!form)return;for(const name of ['from','to'])form.elements[name].addEventListener('input',()=>{form.elements.period.value='custom';});}

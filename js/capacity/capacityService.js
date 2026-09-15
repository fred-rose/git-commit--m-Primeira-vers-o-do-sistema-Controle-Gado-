import { getStock } from '../domain.js';
import { today } from '../utils.js';
export function capacityPeriod(value) {
  const months = Number(value);
  if (!Number.isInteger(months) || months < 1) throw new Error('Informe um período em meses usando um número inteiro a partir de 1.');
  return months;
}
export function capacityPeriodLabel(value) {
  const months = capacityPeriod(value);
  return `${months} ${months === 1 ? 'mês' : 'meses'}`;
}
export function capacityPeriodEnd(year,month,months) {
  const duration=capacityPeriod(months),date=new Date(Date.UTC(Number(year),Number(month)-1+duration-1,1));
  return {year:date.getUTCFullYear(),month:date.getUTCMonth()+1};
}
export function capacityConfigurations(rules=[]) {
  const seen=new Set(),result=[];
  for(const rule of rules){
    const id=rule.periodId||rule.id;if(seen.has(id))continue;seen.add(id);
    const year=rule.periodStartYear??rule.year,month=rule.periodStartMonth??rule.month,months=rule.periodMonths??1;
    result.push({...rule,id,year,month,months,end:capacityPeriodEnd(year,month,months)});
  }
  return result;
}
export function capacityStatus(heads, maxHeads, warningPercentage = 90) {
  if (!Number.isSafeInteger(maxHeads) || maxHeads<=0 || warningPercentage<1 || warningPercentage>100) throw new Error('Capacidade inválida.');
  const percentage = heads / maxHeads * 100;
  return { heads, maxHeads, percentage, state: heads>maxHeads ? 'exceeded' : percentage>=warningPercentage ? 'warning' : 'normal' };
}
export function capacitySummary(data, asOf = today(), stock = getStock(data)) {
  const [year,month] = asOf.split('-').map(Number);
  return (data.capacityRules || []).filter(r => r.active && r.year===year && r.month===month && data.farms.some(f => f.id===r.farmId && f.capacityEnabled && (!r.pastureId || f.controlMode==='pasture'))).map(r => ({
    ...r, name: r.pastureId ? data.pastures.find(p => p.id===r.pastureId)?.name || 'Pasto' : data.farms.find(f => f.id===r.farmId)?.name || 'Fazenda',
    ...capacityStatus(stock.filter(l => l.farmId===r.farmId && (!r.pastureId || l.pastureId===r.pastureId)).reduce((s,l) => s+l.quantity,0),r.maxHeads,r.warningPercentage),
  }));
}
export function previewCapacity(data, input) {
  const farmId = data.farm?.id;
  const delta = Number(input.quantity) * (['Venda','Saída','Morte'].includes(input.type) ? -1 : input.type==='Ajuste de contagem' ? Number(input.direction || 1) : 1);
  return capacitySummary(data).filter(r => r.farmId===farmId).map(r => {
    let change = delta;
    if (input.type==='Transferência de pasto') change = !r.pastureId ? 0 : r.pastureId===input.destinationId ? Number(input.quantity) : r.pastureId===input.pastureId ? -Number(input.quantity) : 0;
    else if (r.pastureId && r.pastureId!==input.pastureId) change=0;
    return { ...r, after: r.heads+change, excess: r.heads+change-r.maxHeads, change };
  }).filter(r => r.change>0 && r.after>r.maxHeads);
}

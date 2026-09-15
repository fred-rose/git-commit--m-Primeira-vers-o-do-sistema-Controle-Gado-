import { createSeed as actualSeed } from '../../js/seed.js';
// Dados sintéticos exclusivos dos testes legados. Nunca usados pela aplicação.
export function createSeed(includeInventory=true){
  const data=actualSeed(includeInventory);
  data.demo=includeInventory;
  data.owners=data.owners.filter(o=>o.id!=='owner-unassigned');
  data.pastures=data.pastures.filter(p=>p.id!=='pasture-unassigned').map((p,i)=>({...p,name:['Casa','Barragem','Serra','Vargem','Caixa'][i]}));
  if(includeInventory)data.openingStock=[
    {id:'test-v1',category:'Vacas',quantity:30,ownerId:'owner-1',pastureId:'pasture-2'},
    {id:'test-v2',category:'Vacas',quantity:48,ownerId:'owner-1',pastureId:'pasture-1'},
    {id:'test-v3',category:'Vacas',quantity:30,ownerId:'owner-2',pastureId:'pasture-3'},
    {id:'test-b',category:'Bois',quantity:3,ownerId:'owner-1',pastureId:'pasture-1'},
    {id:'test-n',category:'Novilhas',quantity:2,ownerId:'owner-1',pastureId:'pasture-1'},
    {id:'test-ba1',category:'Bezerras',quantity:6,ownerId:'owner-1',pastureId:'pasture-2'},
    {id:'test-ba2',category:'Bezerras',quantity:30,ownerId:'owner-2',pastureId:'pasture-4'},
    {id:'test-bo1',category:'Bezerros',quantity:10,ownerId:'owner-2',pastureId:'pasture-2'},
    {id:'test-bo2',category:'Bezerros',quantity:10,ownerId:'owner-3',pastureId:'pasture-5'},
  ];
  return data;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { importDataset } from '../js/migration/localMigration.js';
import { createSeed } from '../js/seed.js';

const farm={id:'20000000-0000-0000-0000-000000000001'};
function fixture(command,records={}){
  return {userId:'10000000-0000-0000-0000-000000000001',getData:()=>({farm,...records}),command};
}
test('migração bloqueada explica os registros carregados e preserva a decisão do servidor',async()=>{
  let calls=0;
  const error=Object.assign(new Error('Escolha uma fazenda vazia para preservar os registros existentes.'),{code:'P0001',retryable:false});
  const repository=fixture(async()=>{calls++;throw error;},{movements:[{farmId:farm.id},{farmId:farm.id},{farmId:'outra'}],openingStock:[{}],finances:[{}],pastures:[{}],photos:[{}],owners:[{}]});
  await assert.rejects(importDataset(repository,createSeed()),e=>{
    assert.equal(e,error);assert.equal(e.retryable,false);
    assert.match(e.message,/esta fazenda já possui dados/);
    assert.match(e.message,/2 movimentações, 1 lote de estoque inicial, 1 lançamento financeiro, 1 pasto, 1 foto, 1 proprietário/);
    assert.match(e.message,/escolha outra fazenda vazia/);return true;
  });
  assert.equal(calls,1);
});
test('retomada com dados existentes ainda envia o mesmo identificador de importação',async()=>{
  const ids=[],stages=[];
  const repository=fixture(async(action,payload,id)=>{assert.equal(action,'import');ids.push(id);return {confirmed:true};},{movements:[{}]});
  const data=createSeed();
  assert.deepEqual(await importDataset(repository,data,label=>stages.push(label)),{confirmed:true});
  await importDataset(repository,data);
  assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);
  assert.deepEqual(stages,['Preparando dados…','Migrando dados…']);
});
test('migração preserva erros de conexão e explica bloqueio sem contagens disponíveis',async()=>{
  const network=Object.assign(new Error('Sem conexão'),{retryable:true});
  await assert.rejects(importDataset(fixture(async()=>{throw network;}),createSeed()),e=>e===network);
  await assert.rejects(importDataset(fixture(async()=>{throw Object.assign(new Error('Escolha uma fazenda vazia'),{code:'P0001'});}),createSeed()),/já possui dados\. Exclua os registros de teste/);
});

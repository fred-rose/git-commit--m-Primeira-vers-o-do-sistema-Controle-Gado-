export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const collections = ['owners', 'pastures', 'openingStock', 'movements', 'finances', 'photos'];
export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
export function assertObject(value, label) {
  if (!isObject(value)) throw new Error(`${label} deve ser um objeto válido.`);
}
export function validTimestamp(value) {
  if (typeof value !== 'string' || value.length > 35 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60 && Number.isFinite(Date.parse(value));
}
export function validateTree(value) {
  let nodes = 0;
  function visit(item, depth, key = '') {
    if (++nodes > 300000 || depth > 12) throw new Error('A estrutura dos dados excede o limite permitido.');
    if (typeof item === 'string' && item.length > (key === 'image' ? 600000 : 2000)) throw new Error('Um texto do arquivo excede o tamanho permitido.');
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('O arquivo contém um número inválido.');
    if (Array.isArray(item)) {
      if (item.length > 20000) throw new Error('O arquivo contém registros demais em uma coleção.');
      item.forEach(child => visit(child, depth + 1));
    } else if (item !== null && typeof item === 'object') {
      assertObject(item, 'Registro');
      if (Object.keys(item).length > 40) throw new Error('Registro com campos demais.');
      for (const [name, child] of Object.entries(item)) {
        if (['__proto__', 'prototype', 'constructor'].includes(name)) throw new Error('O arquivo contém uma propriedade não permitida.');
        visit(child, depth + 1, name);
      }
    } else if (item !== null && !['string', 'number', 'boolean', 'undefined'].includes(typeof item)) throw new Error('Tipo de dado não permitido.');
  }
  visit(value, 0);
}
export function validateStructure(data) {
  assertObject(data, 'Base de dados');
  validateTree(data);
  for (const key of collections) {
    if (!Array.isArray(data[key])) throw new Error(`Dados inválidos: ${key} deve ser um array.`);
    for (const row of data[key]) {
      assertObject(row, `Registro de ${key}`);
      for (const field of ['ownerId', 'pastureId', 'destinationId', 'movementId']) {
        if (row[field] !== undefined && row[field] !== null && (typeof row[field] !== 'string' || row[field].length > 100)) throw new Error(`Referência inválida: ${field}.`);
      }
      if (row.createdAt !== undefined && row.createdAt !== null && !validTimestamp(row.createdAt)) throw new Error('Data de cadastro inválida.');
      if (row.provenance !== undefined) assertObject(row.provenance, 'Origem da migração');
    }
  }
}

const fields = {
  owners: ['id', 'name'], pastures: ['id', 'name', 'archived'],
  openingStock: ['id', 'category', 'quantity', 'ownerId', 'pastureId'],
  movements: ['id', 'type', 'category', 'quantity', 'ownerId', 'pastureId', 'destinationId', 'date', 'valueCents', 'note', 'sequence', 'createdAt'],
  finances: ['id', 'date', 'type', 'category', 'description', 'valueCents', 'ownerId', 'owner', 'property', 'notes', 'source', 'movementId', 'createdAt', 'provenance'],
  photos: ['id', 'title', 'description', 'date', 'image', 'pastureId', 'ownerId'],
};
const provenanceFields = ['migrationId', 'workbook', 'workbookHash', 'sheet', 'row', 'originalDate', 'originalOperation', 'originalAmount', 'originalBalance', 'originalDescription'];
const pick = (value, names) => Object.fromEntries(names.filter(name => value[name] !== undefined).map(name => [name, structuredClone(value[name])]));
export function projectDatabase(data) {
  const result = pick(data, ['version', 'revision', 'seedVersion', 'appliedSeeds', 'demo', 'openingDate']);
  for (const collection of collections) result[collection] = data[collection].map(row => {
    const projected = pick(row, fields[collection]);
    if (projected.provenance) projected.provenance = pick(projected.provenance, provenanceFields);
    return projected;
  });
  return result;
}

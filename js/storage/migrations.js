import { SCHEMA_VERSION } from '../constants.js';
import { assertObject, validateTree } from './schema.js';

const migrations = {
  1(data) {
    data.version = 2;
    data.seedVersion = 0;
    data.appliedSeeds = [];
    if (Array.isArray(data.finances)) data.finances = data.finances.map(f => ({ ...f, source: 'manual', ownerId: f.ownerId || '', owner: '', property: '', notes: '', movementId: null, createdAt: null }));
    return data;
  },
};
// Novas versões acrescentam uma transformação por etapa, sem reinserir seeds.
export function upgradeData(input) {
  assertObject(input, 'Base de dados');
  validateTree(input);
  if (!Number.isInteger(input.version) || input.version < 1 || input.version > SCHEMA_VERSION) throw new Error('Versão do schema incompatível com este sistema.');
  let data = structuredClone(input);
  while (data.version < SCHEMA_VERSION) {
    const migrate = migrations[data.version];
    if (!migrate) throw new Error('Não há migração disponível para esta versão.');
    data = migrate(data);
  }
  return data;
}

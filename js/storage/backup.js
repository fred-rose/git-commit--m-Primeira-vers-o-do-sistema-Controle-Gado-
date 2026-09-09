import { APP_VERSION, SCHEMA_VERSION } from '../constants.js';
import { validateData, summarize, getFinances } from '../domain.js';
import { upgradeData } from './migrations.js';
import { MAX_BACKUP_BYTES, assertObject, validTimestamp, projectDatabase, validateTree } from './schema.js';
import { today } from '../utils.js';

export const backupFilename = () => `controle-gado-backup-${today()}.json`;
export function createBackup(data, exportedAt = new Date().toISOString()) {
  validateData(data);
  if (!validTimestamp(exportedAt)) throw new Error('Data de exportação inválida.');
  return {
    _meta: { system: 'controle-gado', schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, exportedAt },
    data: projectDatabase(data),
  };
}
export function serializeBackup(data) {
  const content = JSON.stringify(createBackup(data), null, 2);
  if (new TextEncoder().encode(content).byteLength > MAX_BACKUP_BYTES) throw new Error('O backup excede 20 MB. Reduza as fotos antes de exportar.');
  return content;
}
export function inspectBackup(content) {
  if (typeof content !== 'string' || new TextEncoder().encode(content).byteLength > MAX_BACKUP_BYTES) throw new Error('Selecione um backup JSON de até 20 MB.');
  let parsed;
  try { parsed = JSON.parse(content); } catch { throw new Error('O arquivo não contém um JSON válido.'); }
  assertObject(parsed, 'Backup');
  validateTree(parsed);
  let metadata = null, input;
  if (Object.hasOwn(parsed, '_meta')) {
    assertObject(parsed._meta, 'Metadados');
    metadata = parsed._meta;
    if (metadata.system !== 'controle-gado') throw new Error('Este backup não pertence ao Controle de Gado.');
    if (!Number.isInteger(metadata.schemaVersion) || metadata.schemaVersion < 1 || metadata.schemaVersion > SCHEMA_VERSION) throw new Error('Versão do schema do backup incompatível.');
    if (typeof metadata.appVersion !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(metadata.appVersion) || metadata.appVersion.length > 64 || !validTimestamp(metadata.exportedAt)) throw new Error('Metadados do backup inválidos.');
    assertObject(parsed.data, 'Dados do backup');
    if (parsed.data.version !== metadata.schemaVersion) throw new Error('A versão dos dados difere dos metadados.');
    input = parsed.data;
  } else {
    // Compatibilidade somente com os backups completos emitidos pelas V1/V1.1.
    if (![1, 2].includes(parsed.version) || !['owners', 'pastures', 'openingStock', 'movements', 'finances', 'photos'].every(key => Object.hasOwn(parsed, key))) throw new Error('Arquivo sem identificação de backup do Controle de Gado.');
    input = parsed;
  }
  const data = projectDatabase(validateData(upgradeData(input)));
  const snapshot = summarize(data);
  return {
    data, metadata, legacy: !metadata,
    summary: { totalCattle: snapshot.total, movements: data.movements.length, financialRecords: getFinances(data).length, pastures: data.pastures.filter(p => !p.archived).length, photos: data.photos.length },
  };
}

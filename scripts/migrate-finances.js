import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractFinancialMigration } from './lib/finance-migration.js';

const input = process.argv[2];
if (!input) throw new Error('Informe o caminho de Controle do Gado V2.xlsx.');
const result = extractFinancialMigration(await readFile(resolve(input)));
await mkdir('js/data', { recursive: true });
await mkdir('docs', { recursive: true });
await writeFile('js/data/financial-seed.js', `// Gerado de ${result.manifest.workbook} por scripts/migrate-finances.js. Não editar os valores manualmente.\nexport const FINANCIAL_SEED = ${JSON.stringify({ manifest: result.manifest, records: result.records }, null, 2)};\n`, 'utf8');
await writeFile('docs/financial-migration-audit.json', JSON.stringify(result.audit, null, 2) + '\n', 'utf8');
process.stdout.write(JSON.stringify(result.manifest, null, 2) + '\n');
